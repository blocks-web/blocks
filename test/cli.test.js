// blocks.js: clear messages (no "stack trace"), exit codes, the messages and account commands.
// The command runs in a copy of the project (blocks.js works in its own folder).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { componentTemplate } from "../server/project.js";
import { createAuth } from "../server/auth.js";
import { createStore } from "../server/store.js";
import { makeProject, PROJECT_ROOT, removeProject } from "./helpers.js";

describe("blocks.js", () => {
  let root;
  before(() => {
    root = makeProject({ "pages/index.json": { title: "Home", blocks: [] } });
    cpSync(join(PROJECT_ROOT, "server"), join(root, "server"), { recursive: true });
    cpSync(join(PROJECT_ROOT, "blocks.js"), join(root, "blocks.js"));
    cpSync(join(PROJECT_ROOT, "package.json"), join(root, "package.json"));
  });
  after(() => removeProject(root));

  // → { code, out, err }; stops the command if it doesn't end by itself (e.g. it started the server).
  function run(...args) {
    return new Promise((ok) => {
      const child = spawn(process.execPath, [join(root, "blocks.js"), ...args], { env: { ...process.env, PORT: "" } });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      const timer = setTimeout(() => child.kill(), 8000);
      child.on("close", (code) => {
        clearTimeout(timer);
        ok({ code, out, err });
      });
    });
  }

  test("without a command: the help, with --port, --out and --base; an unknown command → code 1", async () => {
    const help = await run();
    assert.equal(help.code, 0);
    for (const part of ["--port", "--out", "--base", "node blocks.js messages", "node blocks.js component <id>", "account delete <email>", "account logout <email>"]) {
      assert.ok(help.out.includes(part), part);
    }
    assert.equal((await run("help")).out, help.out);
    const wrong = await run("biuld");
    assert.equal(wrong.code, 1);
    assert.ok(wrong.err.includes("Unknown command: “biuld”."));
  });

  test("a wrong or busy port: a message in plain English, no stack trace", async () => {
    const bad = await run("dev", "--port", "abc");
    assert.equal(bad.code, 1);
    assert.ok(bad.err.includes("The port “abc” isn't valid."), bad.err);
    const busy = createServer();
    await new Promise((ok) => busy.listen(0, "127.0.0.1", ok));
    try {
      const { port } = busy.address();
      const res = await run("dev", `--port=${port}`);
      assert.equal(res.code, 1);
      assert.ok(res.err.includes(`Port ${port} is busy`), res.err);
      assert.ok(!res.err.includes("node:net"), res.err);
    } finally {
      busy.close();
    }
  });

  test("build: a wrong export folder → only the message; a broken page → code 1", async () => {
    const bad = await run("build", "--out", "pages");
    assert.equal(bad.code, 1);
    assert.ok(bad.err.includes("would delete project files"));
    assert.ok(!bad.err.includes("file://"), bad.err);
    // An absolute folder outside the project is refused too, and nothing is written anywhere.
    const outside = `${root}-outside`;
    const absolute = await run("build", "--out", outside);
    assert.equal(absolute.code, 1);
    assert.ok(absolute.err.includes("must be inside the project"), absolute.err);
    assert.ok(!existsSync(outside));
    assert.ok(!existsSync(join(root, outside)));
    const wrongBase = await run("build", "--base", "../x");
    assert.equal(wrongBase.code, 1);
    assert.ok(wrongBase.err.includes("--base /project/"), wrongBase.err);
    const ok = await run("build");
    assert.equal(ok.code, 0, ok.err);
    assert.ok(ok.out.includes("Export ready"));
    writeFileSync(join(root, "pages", "broken.json"), '{ "title": ');
    const broken = await run("build");
    assert.equal(broken.code, 1);
    assert.ok(broken.out.includes("Errors (1):") && broken.out.includes("pages/broken.json isn't valid JSON"), broken.out);
  });

  test("Node.js older than 22: dev, start and build warn, but work; package.json asks for 22", async () => {
    const major = Number(process.versions.node.split(".")[0]);
    const res = await run("build");
    assert.ok(res.out.includes("Export"), res.out); // the warning doesn't stop the command
    const warned = res.err.includes(`Warning: you have Node.js ${process.versions.node}. Blocks is made for Node.js 22 or newer`);
    assert.equal(warned, major < 22, res.err);
    if (warned) {
      assert.ok(res.err.includes("Node.js 20 and older versions no longer get security updates."));
      assert.ok(res.err.includes("https://nodejs.org") && res.err.includes("“nvm install 22”"));
    }
    assert.ok(!(await run("account", "list")).err.includes("Node.js 22"));
    assert.equal(JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8")).engines.node, ">=22");
  });

  test("component <id> writes the template", async () => {
    const res = await run("component", "product-price");
    assert.equal(res.code, 0, res.err);
    assert.equal(readFileSync(join(root, "components/product-price.js"), "utf8"), componentTemplate("product-price"));
    assert.equal((await run("component", "product-price")).code, 1);
    const wrong = await run("component", "Price");
    assert.equal(wrong.code, 1);
    assert.ok(wrong.err.includes("“Price” can't be a component's name: use lowercase letters, digits and hyphens"), wrong.err);
    const none = await run("component");
    assert.equal(none.code, 1);
    assert.ok(none.err.includes("Give the component a name, for example: node blocks.js component product-price"), none.err);
  });

  test("messages and account: they read and change data/", async () => {
    assert.ok((await run("messages")).out.includes("No messages yet."));
    assert.ok((await run("account", "list")).out.includes("No accounts yet."));
    assert.ok(!existsSync(join(root, "data")), "reading the messages and the accounts writes nothing");
    const store = createStore(join(root, "data"));
    store.collection("messages").add({ name: "Ana", email: "ana@example.com", phone: "0721 000 000", message: "Do you have a table on Saturday?\u202e\u001b[31m" });
    const messages = await run("messages");
    assert.ok(messages.out.includes("1 message received") && messages.out.includes("Do you have a table on Saturday?"), messages.out);
    assert.ok(messages.out.includes("Ana · ana@example.com · 0721 000 000"), messages.out);
    assert.ok(!messages.out.includes("\u202e") && !messages.out.includes("\u001b"), "no invisible or control characters reach the terminal");
    store.collection("messages").add({ name: "Bogdan", message: "Hello" });
    assert.ok((await run("messages")).out.includes("2 messages received"));

    await createAuth(store).register({ name: "Ana", email: "ana@example.com", password: "good-and-long-password-1" });
    assert.ok((await run("account", "list")).out.includes("Ana <ana@example.com>"));
    assert.ok((await run("account", "list")).out.includes("1 active session"));
    assert.ok((await run("account", "logout", "ana@example.com")).out.includes("Closed 1 session"));
    const removed = await run("account", "delete", "ana@example.com");
    assert.ok(removed.out.includes("Deleted the account ana@example.com"), removed.out);
    const again = await run("account", "delete", "ana@example.com");
    assert.equal(again.code, 1);
    assert.ok(again.err.includes("There is no account"));
    const usage = await run("account");
    assert.equal(usage.code, 1);
    assert.ok(usage.err.includes("Usage: node blocks.js account list"), usage.err);
    assert.ok(existsSync(join(root, "data/_auth/users.json")));
  });
});
