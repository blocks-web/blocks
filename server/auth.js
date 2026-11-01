// Accounts and sessions. It's the one part components don't reinvent:
// written once, with care, and used by all of them.
//
// - passwords are stored as a salted scrypt hash (never in plain text)
// - the session is a random token in an HttpOnly cookie; only its hash is on disk,
//   so data/_auth/sessions.json can't be used to log in
// - too many wrong attempts from the same address are blocked for a while,
//   and so are new accounts made in a row from the same address
// - an account has at most MAX_SESSIONS sessions: a new one closes the oldest
// - a new password has at least 15 characters (see passwordProblem); older, shorter ones still work
//
// What the visitor reads comes from server/i18n.js, in the site's language: the errors carry a
// message key, and the server picks the language when it answers (see visitorError).

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { publicUser } from "../core/render.js";
import { message } from "./i18n.js";
import { addressKey, createLimiter } from "./limits.js";

const scryptAsync = promisify(scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 7;
export const COOKIE = "blocks_session";
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_REGISTRATIONS = 20; // new accounts from the same address, within an hour
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 10; // per account (phone, laptop, ...)
// New passwords: at least 15 characters when the password is the only proof (NIST SP 800-63B-4), at most 200.
const PASSWORD_MIN = 15;
const PASSWORD_MAX = 200;

// Scrypt runs in the same few Node threads that read files.
// Without a limit, many sign-ups or logins at once would hold up every page.
const SCRYPT_PARALLEL = 2;
const SCRYPT_QUEUE = 50;
let scryptRunning = 0;
const scryptWaiting = [];

async function scryptLimited(...args) {
  if (scryptRunning < SCRYPT_PARALLEL) scryptRunning++;
  else if (scryptWaiting.length >= SCRYPT_QUEUE) {
    throw visitorError(503, "serverBusy");
  } else await new Promise((ok) => scryptWaiting.push(ok)); // whoever finishes hands the slot over directly
  try {
    return await scryptAsync(...args);
  } finally {
    const next = scryptWaiting.shift();
    if (next) next();
    else scryptRunning--;
  }
}

// An error with an HTTP status. Its message goes to whoever sent the request.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// An error a visitor reads: `key` is a message from server/i18n.js. The message is in English (for
// logs and tests); the server answers in the site's language (see server.js).
export function visitorError(status, key, values = {}) {
  return Object.assign(new HttpError(status, message("en", key, values)), { key, values });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptLimited(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  // An empty (or very short) hash would "match" any password.
  if (expected.length < 16) return false;
  try {
    const actual = await scryptLimited(String(password), Buffer.from(saltB64, "base64"), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch (err) {
    if (err instanceof HttpError) throw err; // the server is busy; the password isn't wrong
    return false; // broken scrypt parameters in the file
  }
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function parseCookies(header = "") {
  const out = {};
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function cleanEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

// Keys and characters in a row, read both ways (QWERTY and QWERTZ keyboards, rows and columns).
const SEQUENCES = [
  "abcdefghijklmnopqrstuvwxyz",
  "01234567890",
  "qwertyuiopasdfghjklzxcvbnm",
  "qwertzuiopasdfghjklyxcvbnm",
  "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
];
const adjacent = (a, b) => a === b || SEQUENCES.some((seq) => seq.includes(a + b) || seq.includes(b + a));

// Characters you can't see: control and format characters (e.g. the zero-width space), lone halves
// of an emoji (they all become "�" when hashed) and the ones fonts don't draw.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}]/gu;

// The password as a person sees it: letters in their usual form (NFKC: "ｑ" → "q"), without invisible
// characters or spaces at the ends, and a run of spaces counts once.
// This way "password" followed by spaces or invisible characters doesn't pass as a long password.
const asSeen = (text) => text.normalize("NFKC").replace(/\s+/g, " ").replace(INVISIBLE, "").replace(/ {2,}/g, " ").trim();

// What is wrong with a new password, as { key, values } for a message in server/i18n.js, or null if it's good.
// No composition rules ("a digit and a symbol"): they make passwords more predictable, not safer.
// Only the length and a few obvious patterns anyone guessing would try.
// The checks use the form as seen; the hash gets the password exactly as it was typed.
function passwordIssue(password, email) {
  const text = String(password ?? "");
  if (text.length > PASSWORD_MAX) return { key: "passwordTooLong" };
  const shown = asSeen(text).toLowerCase();
  // Characters, not UTF-16 units: an emoji is a single character.
  if ([...shown].length < PASSWORD_MIN) {
    const padded = [...text].length >= PASSWORD_MIN;
    return { key: padded ? "passwordTooShortPadded" : "passwordTooShort", values: { min: PASSWORD_MIN } };
  }
  // The same short piece, repeated, glued together or with a space ("aaaa…", "abcabc…", "password password…"),
  // is worth as much as a short password. Capital letters change nothing ("passwordPASSWORD…").
  const piece = shown.match(/^(.+?)(?: ?\1)+$/u)?.[1];
  if (piece && [...piece].length < PASSWORD_MIN) return { key: "passwordRepeated" };
  // Keys or characters in a row ("qwerty…", "abcdef…", "123456…"), with at most one break.
  const chars = [...shown.replace(/ /g, "")];
  let breaks = 0;
  for (let i = 1; i < chars.length; i++) if (!adjacent(chars[i - 1], chars[i])) breaks++;
  if (breaks <= 1) return { key: "passwordSequence" };
  const local = cleanEmail(email).split("@")[0];
  if (local.length >= 4 && shown.includes(local)) return { key: "passwordHasEmail" };
  return null;
}

// What is wrong with a new password (a message for a person, in `lang`), or null if it's good.
export function passwordProblem(password, email = "", lang = "en") {
  const issue = passwordIssue(password, email);
  return issue ? message(lang, issue.key, issue.values) : null;
}

export function createAuth(store) {
  const users = store.collection("_auth/users", { internal: true });
  const sessions = store.collection("_auth/sessions", { internal: true });
  // Attempts are counted per address (IPv6: per /64 network), with the shared limits from limits.js.
  const fails = createLimiter(FAIL_WINDOW_MS);
  const registrations = createLimiter(REGISTRATION_WINDOW_MS);
  // A fake hash, so an unknown email takes as long as a known one (nobody can guess who has an account).
  const dummyHash = hashPassword(randomBytes(16).toString("hex"));
  dummyHash.catch(() => {}); // it is awaited only at the first login

  function checkRate(ip) {
    if (fails.count(addressKey(ip)) >= MAX_FAILS) throw visitorError(429, "tooManyAttempts");
  }

  function createSession(userId) {
    const now = Date.now();
    // Expired sessions go, and of the account's own only the newest stay: one account can't fill the file.
    const own = sessions.filter((s) => s.user === userId && s.expires > now).sort((a, b) => a.expires - b.expires);
    const oldest = new Set(own.slice(0, Math.max(0, own.length - MAX_SESSIONS + 1)).map((s) => s.id));
    sessions.removeWhere((s) => s.expires <= now || oldest.has(s.id));
    const token = randomBytes(32).toString("base64url");
    sessions.add({ id: sha256(token), user: userId, expires: now + SESSION_DAYS * 86400 * 1000 });
    return token;
  }

  const findUser = (email) => users.find((u) => u.email === cleanEmail(email));

  return {
    async register(data, ip = "") {
      // The body can be any JSON (e.g. null): without fields → the validation messages.
      let { name, email, password } = data || {};
      name = String(name ?? "").trim();
      email = cleanEmail(email);
      password = String(password ?? "");
      if (!name || name.length > 80) throw visitorError(400, "nameRequired");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw visitorError(400, "emailInvalid");
      const issue = passwordIssue(password, email);
      if (issue) throw visitorError(400, issue.key, issue.values);
      // Attempts with an email already in use count too: otherwise anyone could find out in bulk who has an account.
      if (registrations.count(addressKey(ip)) >= MAX_REGISTRATIONS) throw visitorError(429, "tooManyAccounts");
      registrations.add(addressKey(ip));
      const taken = () => {
        // A neutral message: it doesn't tell someone trying addresses one after another whether an address has an account.
        if (users.find((u) => u.email === email)) throw visitorError(409, "accountTaken");
      };
      taken();
      const hash = await hashPassword(password);
      // Again after hashing (it takes a while): two sign-ups at once with the same email don't make two accounts.
      taken();
      const user = users.add({ name, email, password: hash });
      return { user: publicUser(user), token: createSession(user.id) };
    },

    async login(data, ip = "") {
      let { email, password } = data || {};
      checkRate(ip);
      // The attempt counts before the check, so requests sent in parallel can't get around the limit.
      const attempt = fails.add(addressKey(ip));
      email = cleanEmail(email);
      const user = users.find((u) => u.email === email);
      let ok;
      try {
        ok = await verifyPassword(String(password ?? ""), user ? user.password : await dummyHash);
      } catch (err) {
        attempt.count--; // the server was busy: it isn't a wrong password
        throw err;
      }
      if (!user || !ok) throw visitorError(401, "wrongLogin");
      // A success takes back only its own attempt: the mistakes stay, otherwise your own account would "reset" the limit.
      attempt.count--;
      return { user: publicUser(user), token: createSession(user.id) };
    },

    logout(token) {
      if (token) sessions.remove(sha256(token));
    },

    // For `node blocks.js account ...` (it also works while the server is running).
    listAccounts() {
      const now = Date.now();
      const active = sessions.filter((s) => s.expires > now);
      return users.all().map((u) => ({ ...publicUser(u), created: u.created, sessions: active.filter((s) => s.user === u.id).length }));
    },

    // Closes every session of the account; returns how many there were, or null if there is no such account.
    endSessions(email) {
      const user = findUser(email);
      return user ? sessions.removeWhere((s) => s.user === user.id) : null;
    },

    // Deletes the account and its sessions (the email address can be used again).
    deleteAccount(email) {
      const user = findUser(email);
      if (!user) return null;
      const closed = sessions.removeWhere((s) => s.user === user.id);
      users.remove(user.id);
      return closed;
    },

    // The user from the request's cookie, or null.
    userFromRequest(req) {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (!token) return null;
      const session = sessions.byId(sha256(token));
      if (!session || session.expires <= Date.now()) return null;
      return publicUser(users.byId(session.user));
    },

    tokenFromRequest(req) {
      return parseCookies(req.headers.cookie)[COOKIE] || null;
    },

    cookie(token, { secure = false } = {}) {
      const flags = ["Path=/", "HttpOnly", "SameSite=Lax"];
      if (secure) flags.push("Secure");
      if (!token) return `${COOKIE}=; ${flags.join("; ")}; Max-Age=0`;
      return `${COOKIE}=${token}; ${flags.join("; ")}; Max-Age=${SESSION_DAYS * 86400}`;
    },
  };
}
