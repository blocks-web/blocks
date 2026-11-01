// core/runtime.js: the components' api (events, stopping) and starting them.
// It runs in Node, with a minimal "document"; no browser.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createApi, start } from "../core/runtime.js";

describe("createApi", () => {
  test("on / emit: messages between components; one error doesn't stop the others", (t) => {
    t.mock.method(console, "error", () => {});
    const api = createApi({ mode: "site", user: null });
    const got = [];
    api.on("x", () => {
      throw new Error("broken listener");
    });
    const off = api.on("x", (d) => got.push(d));
    api.emit("x", 1);
    off();
    api.emit("x", 2);
    api.emit("something-else", 3);
    assert.deepEqual(got, [1]);
  });

  test("onStop / stop: runs the cleanups once and removes the listeners", (t) => {
    t.mock.method(console, "error", () => {});
    const api = createApi({ mode: "editor" });
    let cleaned = 0;
    let heard = 0;
    api.onStop(() => cleaned++);
    api.onStop(() => {
      throw new Error("broken cleanup");
    });
    api.onStop(() => cleaned++);
    api.on("e", () => heard++);
    api.stop();
    api.stop();
    api.emit("e");
    assert.equal(cleaned, 2);
    assert.equal(heard, 0);
  });

  test("user(): null in the editor, the one it got on the site (without asking the server)", async () => {
    assert.equal(await createApi({ mode: "editor", user: { id: "u" } }).user(), null);
    const user = { id: "u1", name: "Ana", email: "a@b.com" };
    assert.deepEqual(await createApi({ mode: "site", user }).user(), user);
    assert.equal(await createApi({ mode: "site", user: null }).user(), null);
    assert.equal(createApi({ mode: "static" }).mode, "static");
  });

  test("get / post answer { ok, status, data }; without a connection, { error } in the visitor's words", async (t) => {
    t.mock.method(globalThis, "fetch", async (url) => {
      if (url === "/down") throw new TypeError("Failed to fetch");
      return { ok: false, status: 400, json: async () => ({ error: "Wrong" }) };
    });
    const api = createApi({ mode: "site", user: null });
    assert.deepEqual(await api.post("/api/c/form/submit", { a: 1 }), { ok: false, status: 400, data: { error: "Wrong" } });
    assert.deepEqual(await api.get("/down"), { ok: false, status: 0, data: { error: "We couldn't reach the server." } });
  });
});

describe("createApi: user() after logging in or out without a reload", () => {
  test("an api.post to /api/auth/... makes user() ask the server again", async (t) => {
    let logged = null;
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
      calls.push(`${options.method} ${url}`);
      if (url === "/api/auth/login") logged = { id: "u1", name: "Ana", email: "a@b.com" };
      const body = url === "/api/auth/me" ? { user: logged } : { ok: true };
      return { ok: true, status: 200, json: async () => body };
    });
    const api = createApi({ mode: "site", user: null });
    assert.equal(await api.user(), null);
    assert.deepEqual(calls, []); // it comes from the page
    await api.post("/api/c/form/submit", {});
    assert.equal(await api.user(), null);
    await api.post("/api/auth/login", { email: "a@b.com", password: "x" });
    assert.equal((await api.user()).name, "Ana");
    assert.equal((await api.user()).name, "Ana");
    assert.deepEqual(calls, ["POST /api/c/form/submit", "POST /api/auth/login", "GET /api/auth/me"]);
  });
});

describe("start", () => {
  // A minimal "document": finds elements by [data-id="..."].
  function fakeRoot(ids) {
    const els = new Map(ids.map((id) => [id, { id }]));
    return {
      querySelector(selector) {
        const m = selector.match(/^\[data-id="(.*)"\]$/);
        return m ? els.get(m[1]) ?? null : null;
      },
    };
  }

  test("starts js(el, p, api) for every instance found; errors don't stop the rest", async (t) => {
    t.mock.method(console, "error", () => {});
    const hadCss = "CSS" in globalThis;
    if (!hadCss) globalThis.CSS = { escape: (s) => String(s) };
    t.after(() => {
      if (!hadCss) delete globalThis.CSS;
    });

    const calls = [];
    const modules = {
      a: { default: { html: () => "", js: (el, p, api) => calls.push(["a", el.id, p.x, api.mode]) } },
      b: {
        default: {
          html: () => "",
          js() {
            throw new Error("broken js");
          },
        },
      },
      c: { default: { html: () => "", js: async () => Promise.reject(new Error("broken async")) } },
    };
    const instances = [
      { id: "1", type: "a", props: { x: 1 } },
      { id: "2", type: "b", props: {} },
      { id: "3", type: "c", props: {} },
      { id: "4", type: "missing", props: {} },
      { id: "not-on-the-page", type: "a", props: { x: 9 } },
      { id: "5", type: "a", props: { x: 2 } },
    ];
    const api = await start(instances, {
      mode: "site",
      user: null,
      root: fakeRoot(["1", "2", "3", "4", "5"]),
      load: async (type) => {
        if (!modules[type]) throw new Error("doesn't exist");
        return modules[type];
      },
    });
    await new Promise((ok) => setImmediate(ok));
    assert.deepEqual(calls, [
      ["a", "1", 1, "site"],
      ["a", "5", 2, "site"],
    ]);
    assert.equal(typeof api.emit, "function");
  });
});
