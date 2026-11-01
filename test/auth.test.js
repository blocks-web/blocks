// server/auth.js: passwords, accounts, sessions, the attempt limits, cookies.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COOKIE, createAuth, hashPassword, HttpError, parseCookies, passwordProblem, verifyPassword, visitorError } from "../server/auth.js";
import { message } from "../server/i18n.js";
import { createStore } from "../server/store.js";

const reqWith = (token) => ({ headers: token ? { cookie: `other=1; ${COOKIE}=${token}` } : {} });

// Checks an HttpError with a status and (optionally) a message, in English.
async function rejectsHttp(promise, status, text) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof HttpError, `expected an HttpError, got ${err}`);
    assert.equal(err.status, status);
    if (text) assert.equal(err.message, text);
    return true;
  });
}

describe("hashPassword / verifyPassword", () => {
  let stored;
  before(async () => {
    stored = await hashPassword("good-password-123");
  });

  test("a salted scrypt hash, different on every call", async () => {
    assert.match(stored, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.ok(!stored.includes("good-password-123"));
    assert.notEqual(await hashPassword("good-password-123"), stored);
  });

  test("the right password is accepted, the wrong one isn't", async () => {
    assert.equal(await verifyPassword("good-password-123", stored), true);
    assert.equal(await verifyPassword("good-password-124", stored), false);
    assert.equal(await verifyPassword("", stored), false);
  });

  test("a broken stored value returns false (it doesn't throw and doesn't accept anything)", async () => {
    const [, , , , salt, hash] = stored.split("$");
    const malformed = [
      "",
      null,
      undefined,
      "abc",
      "scrypt$1$2$3",
      `bcrypt$16384$8$1$${salt}$${hash}`,
      `scrypt$not-a-number$8$1$${salt}$${hash}`,
      `scrypt$16384$8$1$${salt}$`,
      `scrypt$16384$8$1$$${hash}`,
      `scrypt$3$8$1$${salt}$${hash}`,
      `scrypt$16384$8$1$${salt}$${hash}$extra`,
    ];
    for (const value of malformed) {
      assert.equal(await verifyPassword("good-password-123", value), false, String(value));
      assert.equal(await verifyPassword("", value), false, String(value));
    }
  });
});

describe("scrypt: at most 2 computations at once, the rest wait in line", () => {
  test("more than 50 waiting → 503 right away; the others succeed", async () => {
    const results = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => hashPassword(`password-${i}`)));
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(results.length - rejected.length, 52);
    for (const r of rejected) {
      assert.ok(r.reason instanceof HttpError);
      assert.equal(r.reason.status, 503);
      assert.equal(r.reason.key, "serverBusy");
    }
    // The line is empty again: everything works.
    assert.equal(await verifyPassword("password-0", results[0].value), true);
  });
});

describe("parseCookies", () => {
  test("usual cases and edge cases", () => {
    assert.deepEqual(parseCookies(""), {});
    assert.deepEqual(parseCookies(), {});
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies("a=1; b=2"), { a: "1", b: "2" });
    assert.deepEqual(parseCookies("  a = 1 ;b=2;  "), { a: "1", b: "2" });
    assert.deepEqual(parseCookies("a=b=c"), { a: "b=c" });
    assert.deepEqual(parseCookies("no-value; =x; c=3"), { c: "3" });
    assert.deepEqual(parseCookies("a="), { a: "" });
    assert.deepEqual(parseCookies("a=%C8%99%C8%9B"), { a: "șț" });
    assert.deepEqual(parseCookies("a=%E0%A4%A; b=%"), { a: "%E0%A4%A", b: "%" });
  });

  test("special names don't break the object", () => {
    const out = parseCookies("__proto__=x; constructor=y; blocks_session=t");
    assert.equal(out.blocks_session, "t");
    assert.equal(Object.getPrototypeOf(out), Object.prototype);
  });
});

describe("passwordProblem: new passwords (NIST SP 800-63B-4)", () => {
  const SHORT = /^The password must be at least 15 characters long\./;
  const REPEATED = /^The password can't be one short piece repeated over and over/;
  const IN_A_ROW = /^The password can't be a simple run of keys or characters/;
  const EMAIL = "The password can't contain your email address (not even the part before the “@”).";

  test("at least 15 characters (counted as letters, not as UTF-16 units), at most 200", () => {
    assert.match(passwordProblem("a password 14c"), SHORT);
    assert.equal(passwordProblem("a password, 15!"), null);
    assert.match(passwordProblem(""), SHORT);
    assert.match(passwordProblem(undefined), SHORT);
    assert.match(passwordProblem("🐱🐶🐭🐹🐰🦊🐻🐼"), SHORT); // 8 characters, 16 UTF-16 units
    assert.equal(passwordProblem("Off to the sea 🌊"), null);
    assert.equal(passwordProblem("Off to the sea now. ".repeat(10)), null); // exactly 200
    assert.equal(passwordProblem("x".repeat(201)), "The password is too long.");
  });

  test("no composition rules: only lowercase letters and spaces is fine", () => {
    for (const ok of ["correct horse battery staple", "ana has apples and pears", "the night train to iasi", "good-and-long-password-1"]) {
      assert.equal(passwordProblem(ok, "x@example.com"), null, ok);
    }
  });

  test("the same short piece, repeated → refused", () => {
    for (const weak of ["aaaaaaaaaaaaaaa", "1".repeat(40), "abcabcabcabcabcabc", "passwordpasswordpassword", "ab".repeat(10), "🐱".repeat(15)]) {
      assert.match(passwordProblem(weak), REPEATED, weak);
    }
    // A 15-character piece repeated is worth a 15-character password: fine.
    assert.equal(passwordProblem("ana has apples!".repeat(2)), null);
  });

  test("keys or characters in a row (forward or backward, with at most one break) → refused", () => {
    for (const weak of [
      "abcdefghijklmnop",
      "zyxwvutsrqponmlk",
      "123456789012345",
      "9876543210987654",
      "qwertyuiopasdfgh",
      "QWERTZUIOPASDFGH",
      "1qaz2wsx3edc4rfv",
      "abcdefgh12345678",
      "asdf ghjk lzxc vbnm",
      "aaaaaaaabbbbbbbb",
    ]) {
      assert.match(passwordProblem(weak), IN_A_ROW, weak);
    }
    assert.equal(passwordProblem("abcdefg and 1234567"), null); // several breaks: a sentence
  });

  test("what counts is what a person sees: extra spaces and invisible characters don't make a password long", () => {
    const padding = /Extra spaces and invisible characters don't count\./;
    for (const fill of [" ", "\t", "\n", "\u00a0", "\u3000", "\u200b", "\u200d", "\u00ad", "\ufe0f", "\u3164", "\u0001", "\u0000"]) {
      assert.match(passwordProblem(`Ab3$x${fill.repeat(10)}`), SHORT, JSON.stringify(fill));
      assert.match(passwordProblem(`${fill.repeat(10)}Ab3$x`), padding, JSON.stringify(fill));
    }
    // Lone halves of an emoji all become "�" when hashed: they don't count.
    const halves = Array.from({ length: 15 }, (_, i) => String.fromCharCode(0xd800 + i * 7)).join("");
    assert.match(passwordProblem(halves), SHORT);
    // The spaces between words count (once); a composed emoji stays fine.
    assert.equal(passwordProblem("ana   has  apples ok"), null);
    assert.equal(passwordProblem("a password, 15!  "), null);
    assert.match(passwordProblem("a password 14c  "), SHORT);
    assert.equal(passwordProblem("❤\ufe0f Off to the sea now"), null);
  });

  test("the patterns can't be dodged with wide letters (NFKC), capital letters or spaces", () => {
    assert.match(passwordProblem("ｑｗｅｒｔｙｕｉｏｐａｓｄｆｇ"), IN_A_ROW);
    assert.match(passwordProblem("１２３４５６７８９０１２３４５"), IN_A_ROW);
    for (const weak of ["passwordPASSWORDpassword", "abc abc abc abc", "password password password", "Ana Ana Ana Ana Ana"]) {
      assert.match(passwordProblem(weak), REPEATED, weak);
    }
    assert.equal(passwordProblem("ＡＮＡ.ＰＯＰ has a password", "ana.pop@example.com"), EMAIL);
  });

  test("it contains the email address (the part before the “@”, at least 4 letters long) → refused", () => {
    assert.equal(passwordProblem("the password of ana.pop is good", "Ana.Pop@example.com"), EMAIL);
    assert.equal(passwordProblem("THE PASSWORD OF ANA.POP IS GOOD", " ana.pop@example.com "), EMAIL);
    assert.equal(passwordProblem("ana has a long password", "ana@example.com"), null); // "ana" is too short to matter
    assert.equal(passwordProblem("the password of ana.pop is good"), null);
  });

  test("the same rules, in the site's language: Romanian with “ro”", () => {
    assert.equal(
      passwordProblem("o parola de 14", "", "ro"),
      "Parola trebuie să aibă cel puțin 15 caractere. O propoziție scurtă e ușor de ținut minte.",
    );
    assert.equal(passwordProblem("x".repeat(201), "", "ro"), "Parola e prea lungă.");
    assert.equal(passwordProblem("aaaaaaaaaaaaaaa", "", "ro"), message("ro", "passwordRepeated"));
    assert.equal(passwordProblem("good-and-long-password-1", "", "ro"), null);
  });
});

describe("createAuth", () => {
  let root;
  let dir;
  let auth;
  before(() => {
    root = mkdtempSync(join(tmpdir(), "blocks-auth-"));
    dir = join(root, "data");
    auth = createAuth(createStore(dir));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  test("validation at sign-up (400, with a message key for the site's language)", async () => {
    await rejectsHttp(auth.register({ email: "a@b.com", password: "12345678" }), 400, "Please enter your name (up to 80 characters).");
    await rejectsHttp(auth.register({ name: "   ", email: "a@b.com", password: "12345678" }), 400, "Please enter your name (up to 80 characters).");
    await rejectsHttp(auth.register({ name: "x".repeat(81), email: "a@b.com", password: "12345678" }), 400);
    for (const email of ["", "ana", "ana@", "ana@example", "a b@c.com", "@c.com", undefined]) {
      await rejectsHttp(auth.register({ name: "Ana", email, password: "12345678" }), 400, "That email address doesn't look right.");
    }
    const short = "The password must be at least 15 characters long. A short sentence is easy to remember.";
    await rejectsHttp(auth.register({ name: "Ana", email: "a@b.com", password: "a password 14c" }), 400, short);
    await rejectsHttp(auth.register({ name: "Ana", email: "a@b.com" }), 400, short);
    await rejectsHttp(auth.register({ name: "Ana", email: "a@b.com", password: "x".repeat(201) }), 400, "The password is too long.");
    await rejectsHttp(auth.register({ name: "Ana", email: "a@b.com", password: "q".repeat(20) }), 400);
    await rejectsHttp(auth.register({ name: "Ana", email: "ana.pop@b.com", password: "the password of ana.pop" }), 400);
    await assert.rejects(auth.register({ name: "Ana", email: "a@b.com", password: "a password 14c" }), (err) => {
      assert.deepEqual([err.key, err.values], ["passwordTooShort", { min: 15 }]);
      assert.equal(message("ro", err.key, err.values), "Parola trebuie să aibă cel puțin 15 caractere. O propoziție scurtă e ușor de ținut minte.");
      return true;
    });
  });

  test("an old account, with a password shorter than 15 characters, still logs in", async () => {
    const store = createStore(dir);
    store.collection("_auth/users", { internal: true }).add({ name: "Old", email: "old@example.com", password: await hashPassword("short-1") });
    const { user } = await auth.login({ email: "old@example.com", password: "short-1" }, "9.9.9.1");
    assert.equal(user.email, "old@example.com");
  });

  test("missing or null data: 400, not a server error", async () => {
    await rejectsHttp(auth.register(), 400);
    await rejectsHttp(auth.register(null), 400);
    await rejectsHttp(auth.login(null, "9.9.9.9"), 401);
    await rejectsHttp(auth.login(undefined, "9.9.9.9"), 401);
  });

  test("sign-up: a public user, a normalized email, a token", async () => {
    const { user, token } = await auth.register({ name: "  Ana Popescu ", email: "  Ana@Example.COM ", password: "ana-has-a-long-password-1" });
    assert.deepEqual(Object.keys(user).sort(), ["email", "id", "name"]);
    assert.equal(user.name, "Ana Popescu");
    assert.equal(user.email, "ana@example.com");
    assert.equal(typeof token, "string");
    assert.ok(token.length >= 32);
    assert.deepEqual(auth.userFromRequest(reqWith(token)), user);
  });

  test("a duplicate email (ignoring capital letters and spaces) → 409", async () => {
    await rejectsHttp(
      auth.register({ name: "Another Ana", email: " ANA@example.com  ", password: "another-long-password-1" }),
      409,
      "We couldn't create an account with this address. If you already have one, log in.",
    );
  });

  test("the password and the token aren't saved in plain text", async () => {
    const { token } = await auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "1.2.3.4");
    const sessionsFile = readFileSync(join(dir, "_auth", "sessions.json"), "utf8");
    const usersFile = readFileSync(join(dir, "_auth", "users.json"), "utf8");
    assert.ok(!sessionsFile.includes(token));
    assert.ok(!usersFile.includes("ana-has-a-long-password-1"));
    assert.ok(usersFile.includes("scrypt$"));
  });

  test("login: right, wrong password and unknown email (the same message)", async () => {
    const { user, token } = await auth.login({ email: " ANA@example.com", password: "ana-has-a-long-password-1" }, "1.2.3.4");
    assert.equal(user.email, "ana@example.com");
    assert.deepEqual(auth.userFromRequest(reqWith(token)), user);
    await rejectsHttp(auth.login({ email: "ana@example.com", password: "wrong-123" }, "1.2.3.4"), 401, "Wrong email or password.");
    await rejectsHttp(auth.login({ email: "nobody@example.com", password: "ana-has-a-long-password-1" }, "1.2.3.4"), 401, "Wrong email or password.");
  });

  test("userFromRequest: no cookie, a wrong token, after logging out", async () => {
    assert.equal(auth.userFromRequest(reqWith(null)), null);
    assert.equal(auth.userFromRequest({ headers: { cookie: `${COOKIE}=made-up` } }), null);
    const { token } = await auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "1.2.3.5");
    assert.equal(auth.tokenFromRequest(reqWith(token)), token);
    assert.ok(auth.userFromRequest(reqWith(token)));
    auth.logout(token);
    assert.equal(auth.userFromRequest(reqWith(token)), null);
    assert.doesNotThrow(() => auth.logout(null));
  });

  test("an expired session → null", async (t) => {
    const { token } = await auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "1.2.3.6");
    assert.ok(auth.userFromRequest(reqWith(token)));
    const now = Date.now();
    t.mock.method(Date, "now", () => now + 8 * 86400 * 1000);
    assert.equal(auth.userFromRequest(reqWith(token)), null);
  });

  test("sessions survive a restart (a new auth on the same folder)", async () => {
    const { token, user } = await auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "1.2.3.7");
    const again = createAuth(createStore(dir));
    assert.deepEqual(again.userFromRequest(reqWith(token)), user);
  });

  test("after 10 wrong attempts from one address → 429; other addresses work", async (t) => {
    for (let i = 0; i < 10; i++) {
      await rejectsHttp(auth.login({ email: "ana@example.com", password: `wrong-${i}` }, "10.0.0.1"), 401);
    }
    const blocked = "Too many attempts. Please try again in a few minutes.";
    await rejectsHttp(auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "10.0.0.1"), 429, blocked);
    await rejectsHttp(auth.login({ email: "nobody@example.com", password: "x" }, "10.0.0.1"), 429, blocked);
    const ok = await auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "10.0.0.2");
    assert.equal(ok.user.email, "ana@example.com");
    // After the 15-minute window, the address can try again.
    const now = Date.now();
    t.mock.method(Date, "now", () => now + 16 * 60 * 1000);
    const later = await auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "10.0.0.1");
    assert.equal(later.user.email, "ana@example.com");
  });

  test("IPv6: the whole /64 network counts as one address", async () => {
    for (let i = 0; i < 10; i++) {
      await rejectsHttp(auth.login({ email: "ana@example.com", password: `wrong-${i}` }, `2001:db8:1:2::${i + 1}`), 401);
    }
    await rejectsHttp(auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "2001:db8:1:2:ffff::9"), 429);
    const other = await auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "2001:db8:1:3::1");
    assert.equal(other.user.email, "ana@example.com");
  });

  test("simultaneous sign-ups with the same email → a single account", async () => {
    const results = await Promise.allSettled(
      ["parallel@example.com", " PARALLEL@example.com", "Parallel@Example.com "].map((email) =>
        auth.register({ name: "Parallel", email, password: "a-simultaneous-long-password" }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      assert.ok(r.reason instanceof HttpError);
      assert.equal(r.reason.status, 409);
    }
    const users = JSON.parse(readFileSync(join(dir, "_auth", "users.json"), "utf8"));
    assert.equal(users.filter((u) => u.email === "parallel@example.com").length, 1);
  });

  test("login requests sent in parallel don't get around the limit", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) => auth.login({ email: "ana@example.com", password: `parallel-${i}` }, "10.0.1.1")),
    );
    const statuses = results.map((r) => r.reason?.status);
    assert.equal(statuses.filter((s) => s === 401).length, 10);
    assert.equal(statuses.filter((s) => s === 429).length, 20);
    await rejectsHttp(auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "10.0.1.1"), 429);
  });

  test("a success doesn't wipe the mistakes before it (your own account doesn't “reset” the limit)", async () => {
    await auth.register({ name: "Attacker", email: "attack@example.com", password: "the-intruders-password-1" });
    for (let i = 0; i < 9; i++) {
      await rejectsHttp(auth.login({ email: "ana@example.com", password: `guess-${i}` }, "10.0.2.1"), 401);
    }
    await auth.login({ email: "attack@example.com", password: "the-intruders-password-1" }, "10.0.2.1");
    await rejectsHttp(auth.login({ email: "ana@example.com", password: "guess-9" }, "10.0.2.1"), 401);
    await rejectsHttp(auth.login({ email: "attack@example.com", password: "the-intruders-password-1" }, "10.0.2.1"), 429);
  });

  test("successful logins don't add up to the limit", async () => {
    for (let i = 0; i < 15; i++) {
      const { user } = await auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "10.0.3.1");
      assert.equal(user.email, "ana@example.com");
    }
  });

  test("an account has at most 10 sessions: a new one closes the oldest", async () => {
    await auth.register({ name: "Many", email: "many@example.com", password: "sessions-on-every-device" }, "10.0.4.1");
    const tokens = [];
    for (let i = 0; i < 12; i++) tokens.push((await auth.login({ email: "many@example.com", password: "sessions-on-every-device" }, "10.0.4.1")).token);
    assert.deepEqual(tokens.map((t) => auth.userFromRequest(reqWith(t)) !== null), [false, false, ...Array(10).fill(true)]);
    const { id } = auth.userFromRequest(reqWith(tokens[11]));
    const saved = JSON.parse(readFileSync(join(dir, "_auth", "sessions.json"), "utf8"));
    assert.equal(saved.filter((x) => x.user === id).length, 10);
    // The sessions of other accounts stay.
    const { token } = await auth.login({ email: "ana@example.com", password: "ana-has-a-long-password-1" }, "10.0.4.2");
    await auth.login({ email: "many@example.com", password: "sessions-on-every-device" }, "10.0.4.1");
    assert.ok(auth.userFromRequest(reqWith(token)));
  });

  test("sign-up: at most 20 new accounts per hour from the same address (emails already in use count too)", async (t) => {
    await rejectsHttp(auth.register({ name: "A", email: "ana@example.com", password: "good-and-long-password-1" }, "10.0.5.1"), 409);
    for (let i = 1; i < 20; i++) await auth.register({ name: "Series", email: `series${i}@example.com`, password: "good-and-long-password-1" }, "10.0.5.1");
    const blocked = "Too many new accounts from this address. Please try again in an hour.";
    await rejectsHttp(auth.register({ name: "Series", email: "series-20@example.com", password: "good-and-long-password-1" }, "10.0.5.1"), 429, blocked);
    await rejectsHttp(auth.register({ name: "A", email: "ana@example.com", password: "good-and-long-password-1" }, "10.0.5.1"), 429, blocked);
    // Wrong data still gets its own message (it costs nothing to check).
    await rejectsHttp(auth.register({ name: "", email: "x@y.com", password: "good-and-long-password-1" }, "10.0.5.1"), 400);
    await auth.register({ name: "Other", email: "other-address@example.com", password: "good-and-long-password-1" }, "10.0.5.2");
    const now = Date.now();
    t.mock.method(Date, "now", () => now + 61 * 60 * 1000);
    await auth.register({ name: "Series", email: "series-21@example.com", password: "good-and-long-password-1" }, "10.0.5.1");
  });

  test("listAccounts, endSessions, deleteAccount (for `node blocks.js account`)", async () => {
    const { token } = await auth.register({ name: "Leaving", email: "leaving@example.com", password: "goodbye-and-thanks-1" }, "10.0.6.1");
    const second = (await auth.login({ email: "leaving@example.com", password: "goodbye-and-thanks-1" }, "10.0.6.1")).token;
    const row = auth.listAccounts().find((u) => u.email === "leaving@example.com");
    assert.deepEqual(Object.keys(row).sort(), ["created", "email", "id", "name", "sessions"]);
    assert.equal(row.sessions, 2);
    assert.equal(auth.endSessions(" LEAVING@example.com"), 2);
    assert.equal(auth.userFromRequest(reqWith(token)), null);
    assert.equal(auth.userFromRequest(reqWith(second)), null);
    const third = (await auth.login({ email: "leaving@example.com", password: "goodbye-and-thanks-1" }, "10.0.6.1")).token;
    assert.equal(auth.deleteAccount("leaving@example.com"), 1);
    assert.equal(auth.userFromRequest(reqWith(third)), null);
    assert.equal(auth.deleteAccount("leaving@example.com"), null);
    assert.equal(auth.endSessions("nobody@example.com"), null);
    // The address can be used again.
    await auth.register({ name: "Back", email: "leaving@example.com", password: "a-new-and-long-password-1" }, "10.0.6.1");
  });

  test("an account removed from the file while the server runs can't log in and doesn't come back at the next write", async () => {
    const { token } = await auth.register({ name: "Victim", email: "victim@example.com", password: "a-quiet-evening-walk-1" }, "10.0.7.1");
    const file = join(dir, "_auth", "users.json");
    await new Promise((ok) => setTimeout(ok, 5));
    writeFileSync(file, JSON.stringify(JSON.parse(readFileSync(file, "utf8")).filter((u) => u.email !== "victim@example.com"), null, 2));
    assert.equal(auth.userFromRequest(reqWith(token)), null);
    await auth.register({ name: "Other", email: "another-account@example.com", password: "someone-elses-password-1" }, "10.0.7.1");
    assert.ok(!readFileSync(file, "utf8").includes("victim@example.com"));
  });

  test("cookie(): HttpOnly, SameSite=Lax, Path=/, Max-Age, Secure on request", () => {
    const parts = (s) => s.split(";").map((x) => x.trim());
    const plain = parts(auth.cookie("tok"));
    assert.equal(COOKIE, "blocks_session");
    assert.equal(plain[0], `${COOKIE}=tok`);
    for (const flag of ["HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${7 * 86400}`]) assert.ok(plain.includes(flag), flag);
    assert.ok(!plain.includes("Secure"));
    assert.ok(parts(auth.cookie("tok", { secure: true })).includes("Secure"));
    const cleared = parts(auth.cookie(null));
    assert.equal(cleared[0], `${COOKIE}=`);
    assert.ok(cleared.includes("Max-Age=0"));
    assert.ok(cleared.includes("HttpOnly"));
    assert.ok(cleared.includes("Path=/"));
    assert.ok(parts(auth.cookie(null, { secure: true })).includes("Secure"));
  });
});

describe("visitorError", () => {
  test("an HttpError with an English message and the key for the site's language", () => {
    const err = visitorError(429, "tooManyAttempts");
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 429);
    assert.equal(err.message, "Too many attempts. Please try again in a few minutes.");
    assert.equal(message("ro", err.key, err.values), "Prea multe încercări. Încearcă din nou peste câteva minute.");
  });
});
