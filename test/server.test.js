// server/server.js in "start" mode: pages, files, logging in, component routes.
// The project is in a temporary folder; requests go out through node:http, with raw paths.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { startServer } from "../server/server.js";
import { contentSecurityPolicy } from "../server/csp.js";
import { componentSource, cookieFrom, makeProject, removeProject, send, sendJson, writeFiles } from "./helpers.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const SECRETS = ["MUST-NOT-SHOW", "SECRET-SERVER-FILE", "SECRET-DOT", "SECRET-ROUTES"];

const block = (id, text) => ({ id, type: "heading", props: { text } });

const FILES = {
  "site.json": { name: "Test Site", lang: "en", loginPage: "/login", secret: "MUST-NOT-SHOW" },
  "server/auth.js": "// SECRET-SERVER-FILE\n",
  "components/heading.js": componentSource(`{
    name: "Heading",
    props: { text: { type: "text", default: "Default heading" } },
    html: (p) => html\`<h1 class="heading">\${p.text}</h1>\`,
  }`),
  "components/hello.js": componentSource(`{
    name: "Hello",
    html: (p, ctx) => html\`<p class="hello">Hello, \${ctx.user ? ctx.user.name : "visitor"}!</p>\`,
  }`),
  "components/form.js": componentSource(`{
    name: "Form",
    props: { button: { type: "text", default: "Send" } },
    html: (p) => html\`<form class="form"><button>\${p.button}</button></form>\`,
    js(el, p, api) {},
  }`),
  "components/form.server.js": `// SECRET-ROUTES
export default {
  "POST /submit": async (request) => ({
    body: request.body, query: request.query, user: request.user,
    method: request.method, path: request.path, hasIp: typeof request.ip === "string",
    header: request.headers["x-test"] ?? null,
  }),
  "GET /nothing": () => undefined,
  "GET /info": (request, ctx) => ({ query: request.query, body: request.body, user: request.user, lang: ctx.site.lang, name: ctx.site.name }),
  "GET /": () => ({ root: true }),
  "POST /error": (request, ctx) => { ctx.error(422, "Please write your email address."); },
  "GET /throws": () => { throw new Error("secret internal detail"); },
  "GET /wrong-status": (request, ctx) => { ctx.error(42, "odd status"); },
  "GET /no-status": (request, ctx) => { ctx.error("Message without a status"); },
  "GET /error-500": (request, ctx) => { ctx.error(500, "internal detail"); },
  "POST /save": (request, ctx) => ctx.data("messages").add({ text: request.body.text }),
  "POST /limited": (request, ctx) => { ctx.limit({ name: "tries", max: 2, minutes: 1 }); return { ok: true }; },
  "POST /limited-own": (request, ctx) => { ctx.limit({ name: "own", max: 1, minutes: 1, message: "Easy there: one per minute." }); return { ok: true }; },
  "POST /limited-all": (request, ctx) => { ctx.limit({ name: "all", max: 1, minutes: 1, allVisitors: true }); return { ok: true }; },
  "POST /find": async (request, ctx) => {
    const found = await ctx.block(request.body.page, request.body.block);
    return found && { id: found.block.id, type: found.block.type, path: found.path, name: found.component.name, title: found.page.title };
  },
};
`,
  "components/embed.js": componentSource(`{
    name: "Embed",
    props: { code: { type: "html" } },
    html: (p) => raw(p.code),
  }`),
  "pages/index.json": { title: "Home", blocks: [block("b1", "HOME-CONTENT"), { id: "f1", type: "form" }] },
  "pages/widget.json": { title: "Widget", blocks: [{ id: "w1", type: "embed", props: { code: "<script>widget()</script>" } }] },
  "pages/about.json": { title: "About", description: "About us", blocks: [block("b1", "ABOUT-CONTENT")] },
  "pages/members.json": {
    title: "Members",
    access: "members",
    blocks: [block("b1", "MEMBERS-CONTENT"), { id: "s1", type: "hello" }, { id: "f2", type: "form" }],
  },
  "pages/login.json": { title: "Log in", access: "members", blocks: [block("b1", "LOGIN-CONTENT")] },
  "pages/no-zones.json": { title: "No zones", zones: false, blocks: [block("b1", "NO-ZONES-CONTENT")] },
  "pages/_header.json": { blocks: [block("a1", "HEADER-ZONE"), { id: "f3", type: "form" }] },
  "pages/_footer.json": { blocks: [block("s1", "FOOTER-ZONE")] },
  "assets/photo.png": PNG,
  "assets/style.css": "body { color: red; }\n",
  "assets/drawing.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',
  "assets/.secret": "SECRET-DOT\n",
  "assets/sub/file.txt": "plain text\n",
};

describe("server (start)", () => {
  let root;
  let srv;
  let port;

  before(async () => {
    root = makeProject(FILES);
    srv = await startServer({ root, mode: "start", host: "127.0.0.1", port: 0, quiet: true });
    port = srv.port;
  });
  after(async () => {
    await srv?.close();
    removeProject(root);
  });

  const get = (path, headers) => send(port, path, { headers });

  async function register(email) {
    const res = await sendJson(port, "/api/auth/register", { name: "Ana <b>", email, password: "good-and-long-password-1" });
    assert.equal(res.status, 200, res.text);
    return cookieFrom(res);
  }

  // Runs fn with site.json in Romanian, then puts it back.
  async function inRomanian(fn) {
    writeFiles(root, { "site.json": { ...FILES["site.json"], lang: "ro" } });
    try {
      return await fn();
    } finally {
      writeFiles(root, { "site.json": FILES["site.json"] });
    }
  }

  describe("pages", () => {
    test("/ serves index.json, with the header before and the footer after", async () => {
      const res = await get("/");
      assert.equal(res.status, 200);
      assert.match(res.headers["content-type"], /^text\/html/);
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.ok(res.text.includes('<html lang="en">'));
      assert.ok(res.text.includes("<title>Home · Test Site</title>"));
      const [a, p, s] = ["HEADER-ZONE", "HOME-CONTENT", "FOOTER-ZONE"].map((x) => res.text.indexOf(x));
      assert.ok(a > 0 && a < p && p < s, "the order header → page → footer");
      // The form has js, so the page starts the runtime.
      assert.ok(res.text.includes('<script type="module" src="/core/runtime.js"></script>'));
      assert.ok(res.text.includes('<main class="b-page" id="content">'));
      assert.ok(!res.text.includes("data-slot"));
      assert.ok(!res.text.includes("MUST-NOT-SHOW"));
    });

    test("/about, and /about/ → 301 /about (keeping the query)", async () => {
      const res = await get("/about");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("ABOUT-CONTENT"));
      assert.ok(res.text.includes('<meta name="description" content="About us">'));
      const slash = await get("/about/");
      assert.equal(slash.status, 301);
      assert.equal(slash.headers.location, "/about");
      const withQuery = await get("/about/?a=1");
      assert.equal(withQuery.status, 301);
      assert.equal(withQuery.headers.location, "/about?a=1");
      const many = await get("/about///");
      assert.equal(many.headers.location, "/about");
    });

    test("/index and unknown pages → 404 (the default page), in the site's language", async () => {
      for (const path of ["/index", "/does-not-exist", "/About", "/a/b", "/_header", "/_footer", "/site.json", "/server/auth.js"]) {
        const res = await get(path);
        assert.equal(res.status, 404, path);
      }
      const res = await get("/does-not-exist");
      assert.match(res.headers["content-type"], /^text\/html/);
      assert.ok(res.text.includes('<html lang="en">') && res.text.includes("<h1>Page not found</h1>") && res.text.includes("Back to the home page"));
      await inRomanian(async () => {
        const ro = await get("/does-not-exist");
        assert.equal(ro.status, 404);
        assert.ok(ro.text.includes('<html lang="ro">') && ro.text.includes("<h1>Pagina nu există</h1>") && ro.text.includes("Înapoi la prima pagină"));
      });
    });

    test("pages/404.json, when it exists, is used for 404", async () => {
      writeFiles(root, { "pages/404.json": { title: "Missing", blocks: [block("b1", "OWN-404-PAGE")] } });
      try {
        const res = await get("/does-not-exist");
        assert.equal(res.status, 404);
        assert.ok(res.text.includes("OWN-404-PAGE"));
        assert.ok(res.text.includes("HEADER-ZONE"));
        assert.ok(!res.text.includes("Page not found"));
      } finally {
        rmSync(join(root, "pages/404.json"));
      }
    });

    test("the redirect for a trailing “/” can't send anyone to another site", async () => {
      for (const path of ["/.//evil.com/", "/x/..//evil.com/", "/.//evil.com//", "/.///evil.com/"]) {
        const res = await get(path);
        if (res.status >= 300 && res.status < 400) {
          assert.ok(!/^\/[/\\]/.test(res.headers.location), `${path} → ${res.headers.location}`);
          assert.ok(res.headers.location.startsWith("/"), `${path} → ${res.headers.location}`);
        }
      }
    });

    test("a members-only page: the visitor is sent to loginPage with ?next=", async () => {
      const res = await get("/members");
      assert.equal(res.status, 302);
      assert.equal(res.headers.location, "/login?next=%2Fmembers");
      assert.ok(!res.text.includes("MEMBERS-CONTENT"));
      const withQuery = await get("/members?tab=2&x=a%20b");
      assert.equal(withQuery.headers.location, `/login?next=${encodeURIComponent("/members?tab=2&x=a%20b")}`);
    });

    test("a members-only login page doesn't make a redirect loop", async () => {
      const res = await get("/login");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("LOGIN-CONTENT"));
    });

    test("not even when loginPage is written “/login/” or “/login?from=menu”", async () => {
      try {
        writeFiles(root, { "site.json": { ...FILES["site.json"], loginPage: "/login/" } });
        const login = await get("/login");
        assert.equal(login.status, 200);
        assert.ok(login.text.includes("LOGIN-CONTENT"));
        assert.equal((await get("/members")).headers.location, "/login/?next=%2Fmembers");

        writeFiles(root, { "site.json": { ...FILES["site.json"], loginPage: "/login?from=menu" } });
        assert.equal((await get("/login")).status, 200);
        const members = await get("/members");
        assert.equal(members.status, 302);
        assert.equal(members.headers.location, "/login?from=menu&next=%2Fmembers");
      } finally {
        writeFiles(root, { "site.json": FILES["site.json"] });
      }
    });

    test("without loginPage in site.json, the default one: /login", async () => {
      try {
        writeFiles(root, { "site.json": { name: "Test Site" } });
        assert.equal((await get("/members")).headers.location, "/login?next=%2Fmembers");
      } finally {
        writeFiles(root, { "site.json": FILES["site.json"] });
      }
    });

    test("a members-only page is served to those logged in (ctx.user escaped)", async () => {
      const cookie = await register("member@example.com");
      const res = await get("/members", { cookie });
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("MEMBERS-CONTENT"));
      assert.ok(res.text.includes('<p class="hello">Hello, Ana &lt;b&gt;!</p>'));
      // With someone's data on it, the page doesn't stay in the cache (after "Log out", "Back" can't show it).
      assert.equal(res.headers["cache-control"], "no-store");
      assert.equal((await get("/about")).headers["cache-control"], "private, no-cache");
    });

    test("Content-Security-Policy: strict on pages, relaxed only on those with custom code; not on the API", async () => {
      const strict = contentSecurityPolicy();
      assert.match(strict, /script-src 'self';/);
      for (const path of ["/", "/about", "/does-not-exist", "/about?x=1"]) {
        assert.equal((await get(path)).headers["content-security-policy"], strict, path);
      }
      const widget = await get("/widget");
      assert.ok(widget.text.includes("<script>widget()</script>"));
      assert.match(widget.headers["content-security-policy"], /script-src 'self' 'unsafe-inline' https:;/);
      assert.match(widget.headers["content-security-policy"], /frame-ancestors 'self'/);
      assert.equal((await get("/api/auth/me")).headers["content-security-policy"], undefined);
      assert.equal((await get("/components/heading.js")).headers["content-security-policy"], undefined);
      // The owner's 404 page gets its own rules.
      writeFiles(root, { "pages/404.json": { title: "Missing", blocks: [{ id: "w", type: "embed", props: { code: "<i>x</i>" } }] } });
      try {
        const res = await get("/does-not-exist");
        assert.equal(res.status, 404);
        assert.match(res.headers["content-security-policy"], /'unsafe-inline' https:/);
      } finally {
        rmSync(join(root, "pages/404.json"));
      }
    });

    test("a page with zones: false has no header and no footer", async () => {
      const res = await get("/no-zones");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("NO-ZONES-CONTENT"));
      assert.ok(!res.text.includes("HEADER-ZONE"));
      assert.ok(!res.text.includes("FOOTER-ZONE"));
    });

    test("HEAD on a page: headers without a body; PUT or a JSON POST on a page → 405", async () => {
      const head = await send(port, "/about", { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.equal(head.text, "");
      assert.ok(Number(head.headers["content-length"]) > 0);
      assert.equal((await send(port, "/about", { method: "PUT" })).status, 405);
      assert.equal((await sendJson(port, "/about", {})).status, 405);
    });

    test("a form sent without JavaScript (a plain POST on a page) → 303 back to the page, not JSON", async () => {
      const form = { "content-type": "application/x-www-form-urlencoded" };
      const res = await send(port, "/about?x=1", { method: "POST", body: "email=a%40b.com&password=x", headers: form });
      assert.equal(res.status, 303);
      assert.equal(res.headers.location, "/about?x=1");
      assert.equal((await send(port, "/", { method: "POST", body: "a=1", headers: form })).headers.location, "/");
      // Not even here can the visitor be sent to another site.
      const sneaky = await send(port, "/.//evil.com/", { method: "POST", body: "a=1", headers: form });
      assert.ok(!/^\/[/\\]/.test(sneaky.headers.location), sneaky.headers.location);
      assert.equal((await send(port, "/about", { method: "POST" })).status, 303);
    });
  });

  describe("files broken by hand", () => {
    test("a header with broken JSON: the pages work, without the header (not a 500 JSON on the whole site)", async (t) => {
      const errors = t.mock.method(console, "error", () => {});
      writeFiles(root, { "pages/_header.json": '{"blocks": [,]}' });
      try {
        for (const path of ["/", "/about"]) {
          const res = await get(path);
          assert.equal(res.status, 200, path);
          assert.match(res.headers["content-type"], /^text\/html/);
          assert.ok(!res.text.includes("HEADER-ZONE"));
          assert.ok(res.text.includes("FOOTER-ZONE"));
        }
        assert.ok(errors.mock.calls.some((c) => String(c.arguments[0]).includes("pages/_header.json isn't valid JSON")));
      } finally {
        writeFiles(root, { "pages/_header.json": FILES["pages/_header.json"] });
      }
    });

    test("a broken site.json: the pages work with the default settings", async (t) => {
      t.mock.method(console, "error", () => {});
      writeFiles(root, { "site.json": '{ "name": "Café", }' });
      try {
        const res = await get("/about");
        assert.equal(res.status, 200);
        assert.ok(res.text.includes("<title>About · My site</title>"));
      } finally {
        writeFiles(root, { "site.json": FILES["site.json"] });
      }
    });

    test("a page with broken JSON → 500 as an HTML page (no details in start mode), in the site's language", async (t) => {
      const errors = t.mock.method(console, "error", () => {});
      writeFiles(root, { "pages/broken.json": '{"title": "X", "blocks": [' });
      try {
        const res = await get("/broken");
        assert.equal(res.status, 500);
        assert.match(res.headers["content-type"], /^text\/html/);
        assert.equal(res.headers["cache-control"], "no-store");
        assert.equal(res.headers["content-security-policy"], contentSecurityPolicy());
        assert.ok(res.text.includes("This page can&#39;t be shown right now"), res.text);
        assert.ok(!res.text.includes("broken.json"));
        assert.ok(errors.mock.calls.some((c) => String(c.arguments[0]).includes("pages/broken.json isn't valid JSON")));
        assert.equal((await get("/about")).status, 200);
        await inRomanian(async () => {
          const ro = await get("/broken");
          assert.equal(ro.status, 500);
          assert.ok(ro.text.includes('<html lang="ro">') && ro.text.includes("Pagina nu poate fi afișată acum"));
        });
      } finally {
        rmSync(join(root, "pages/broken.json"));
      }
    });
  });

  describe("static files", () => {
    test("the right content type", async () => {
      const cases = [
        ["/core/base.css", /^text\/css/],
        ["/core/runtime.js", /^text\/javascript/],
        ["/core/html.js", /^text\/javascript/],
        ["/assets/style.css", /^text\/css/],
        ["/assets/photo.png", /^image\/png$/],
        ["/assets/drawing.svg", /^image\/svg\+xml$/],
        ["/assets/sub/file.txt", /^text\/plain/],
        ["/components/heading.js", /^text\/javascript/],
      ];
      for (const [path, type] of cases) {
        const res = await get(path);
        assert.equal(res.status, 200, path);
        assert.match(res.headers["content-type"], type, path);
        assert.equal(res.headers["x-content-type-options"], "nosniff");
      }
      const png = await get("/assets/photo.png");
      assert.deepEqual(png.buffer, PNG);
      assert.equal(Number(png.headers["content-length"]), PNG.length);
      const runtime = await get("/core/runtime.js");
      assert.equal(runtime.text, readFileSync(join(root, "core/runtime.js"), "utf8"));
    });

    test("ETag and Last-Modified: if the file hasn't changed → 304 without a body", async () => {
      const first = await get("/core/base.css");
      assert.equal(first.headers["cache-control"], "public, max-age=300");
      assert.match(first.headers.etag, /^W\/".+"$/);
      assert.ok(first.headers["last-modified"]);
      const again = await get("/core/base.css", { "if-none-match": first.headers.etag });
      assert.equal(again.status, 304);
      assert.equal(again.text, "");
      assert.equal((await get("/core/base.css", { "if-none-match": "\"something-else\"" })).status, 200);
      assert.equal((await get("/core/base.css", { "if-modified-since": first.headers["last-modified"] })).status, 304);
      assert.equal((await get("/core/base.css", { "if-modified-since": new Date(0).toUTCString() })).status, 200);
    });

    test("gzip for text (pages, CSS, JS) when the browser accepts it; images stay as they are", async () => {
      const { gunzipSync } = await import("node:zlib");
      const css = await get("/core/base.css", { "accept-encoding": "gzip, br" });
      assert.equal(css.headers["content-encoding"], "gzip");
      assert.equal(css.headers.vary, "accept-encoding");
      assert.equal(gunzipSync(css.buffer).toString("utf8"), readFileSync(join(root, "core/base.css"), "utf8"));
      const page = await get("/", { "accept-encoding": "gzip" });
      assert.equal(page.headers["content-encoding"], "gzip");
      assert.ok(gunzipSync(page.buffer).toString("utf8").includes("HOME-CONTENT"));
      assert.equal(Number(page.headers["content-length"]), page.buffer.length);
      const png = await get("/assets/photo.png", { "accept-encoding": "gzip" });
      assert.equal(png.headers["content-encoding"], undefined);
      assert.deepEqual(png.buffer, PNG);
      assert.equal((await get("/core/base.css")).headers["content-encoding"], undefined);
    });

    test("SVGs are served with a strict Content-Security-Policy", async () => {
      const res = await get("/assets/drawing.svg");
      assert.match(res.headers["content-security-policy"], /default-src 'none'/);
    });

    test("HEAD on a file: no body", async () => {
      const res = await send(port, "/assets/photo.png", { method: "HEAD" });
      assert.equal(res.status, 200);
      assert.equal(res.buffer.length, 0);
      assert.equal(Number(res.headers["content-length"]), PNG.length);
    });

    test("missing files and folders → 404", async () => {
      for (const path of ["/assets/does-not-exist.png", "/assets/sub", "/assets/sub/", "/core/", "/core/does-not-exist.js", "/components/does-not-exist.js"]) {
        assert.equal((await get(path)).status, 404, path);
      }
    });

    test("/components/x.server.js → 404, /components/x.js → 200", async () => {
      const client = await get("/components/form.js");
      assert.equal(client.status, 200);
      assert.ok(client.text.includes('name: "Form"'));
      for (const path of [
        "/components/form.server.js",
        "/components/form%2eserver.js",
        "/components/form.server%2ejs",
        "/components/FORM.SERVER.JS",
        "/components/form.SERVER.js",
        "/components/./form.server.js",
        "/components/sub/../form.server.js",
      ]) {
        const res = await get(path);
        assert.equal(res.status, 404, path);
        assert.ok(!res.text.includes("SECRET-ROUTES"), path);
      }
    });

    test("attempts to get out of the folder fail", async () => {
      await register("traversal@example.com"); // so that data/_auth/... exists
      const paths = [
        "/assets/../site.json",
        "/assets/%2e%2e/site.json",
        "/assets/%2E%2E/site.json",
        "/assets/.%2e/site.json",
        "/assets/%2e%2e%2fsite.json",
        "/assets/..%2fsite.json",
        "/assets/..%2Fsite.json",
        "/assets/..%5csite.json",
        "/assets/%5c..%5c..%5csite.json",
        "/assets/sub/..%2f..%2fsite.json",
        "/assets/%c0%ae%c0%ae/site.json",
        "/assets/%252e%252e/site.json",
        "/core/..%2fserver/auth.js",
        "/core/%2e%2e%2fserver%2fauth.js",
        "/core/..%2f..%2fsite.json",
        "/core/../server/auth.js",
        "/components/..%2fsite.json",
        "/components/../site.json",
        "/components/..%2fserver%2fauth.js",
        "/assets/.secret",
        "/assets/%2esecret",
        "/assets/sub/../.secret",
        "/assets/a%00b",
        "/assets/photo.png%00.txt",
        "/assets/%00",
        "/data/_auth/users.json",
        "/assets/..%2fdata%2f_auth%2fusers.json",
        "/assets/%2fetc%2fpasswd",
      ];
      for (const path of paths) {
        const res = await get(path);
        assert.equal(res.status, 404, path);
        for (const secret of SECRETS) assert.ok(!res.text.includes(secret), `${path} let out ${secret}`);
        assert.ok(!res.text.includes("scrypt$"), path);
      }
    });
  });

  describe("the editor doesn't exist in start mode", () => {
    test("/_editor/ and /_api/* → 404", async () => {
      for (const path of ["/_editor", "/_editor/", "/_editor/index.html", "/_api/pages", "/_api/site", "/_api/components", "/_api/events", "/_api/zones/header"]) {
        assert.equal((await get(path)).status, 404, path);
      }
      const put = await sendJson(port, "/_api/site", { name: "Hacked" }, { method: "PUT", headers: { "x-blocks": "1" } });
      assert.equal(put.status, 404);
      const upload = await send(port, "/_api/upload?name=a.png", { method: "POST", body: PNG, headers: { "x-blocks": "1" } });
      assert.equal(upload.status, 404);
      assert.ok(!readFileSync(join(root, "site.json"), "utf8").includes("Hacked"));
      assert.ok(!existsSync(join(root, "assets/uploads/a.png")));
    });
  });

  describe("logging in (API)", () => {
    test("register → an HttpOnly cookie; me → the user; logout → the cookie cleared", async () => {
      const res = await sendJson(port, "/api/auth/register", { name: "Bianca", email: "Bianca@Example.com", password: "a long password for her" });
      assert.equal(res.status, 200);
      const { user } = res.json();
      assert.deepEqual(Object.keys(user).sort(), ["email", "id", "name"]);
      assert.equal(user.email, "bianca@example.com");
      const setCookie = res.headers["set-cookie"][0];
      for (const flag of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age="]) assert.ok(setCookie.includes(flag), flag);
      assert.ok(!setCookie.includes("Secure"));
      const cookie = cookieFrom(res);
      assert.match(cookie, /^blocks_session=.{20,}/);

      const me = await get("/api/auth/me", { cookie });
      assert.equal(me.status, 200);
      assert.deepEqual(me.json(), { user });
      assert.equal(me.headers["cache-control"], "no-store");
      assert.deepEqual((await get("/api/auth/me")).json(), { user: null });

      const out = await sendJson(port, "/api/auth/logout", {}, { headers: { cookie } });
      assert.equal(out.status, 200);
      assert.deepEqual(out.json(), { ok: true });
      assert.match(out.headers["set-cookie"][0], /^blocks_session=;.*Max-Age=0/);
      assert.deepEqual((await get("/api/auth/me", { cookie })).json(), { user: null });
    });

    test("login: a wrong password → 401, the right one → 200 with a cookie", async () => {
      await register("login@example.com");
      const wrong = await sendJson(port, "/api/auth/login", { email: "login@example.com", password: "wrong-123" });
      assert.equal(wrong.status, 401);
      assert.deepEqual(wrong.json(), { error: "Wrong email or password." });
      assert.equal(wrong.headers["set-cookie"], undefined);
      const unknown = await sendJson(port, "/api/auth/login", { email: "nobody@example.com", password: "good-and-long-password-1" });
      assert.equal(unknown.status, 401);
      assert.deepEqual(unknown.json(), wrong.json());
      const ok = await sendJson(port, "/api/auth/login", { email: "LOGIN@example.com", password: "good-and-long-password-1" });
      assert.equal(ok.status, 200);
      assert.equal(ok.json().user.email, "login@example.com");
      const me = await get("/api/auth/me", { cookie: cookieFrom(ok) });
      assert.equal(me.json().user.email, "login@example.com");
    });

    test("a duplicate email → 409; invalid data → 400 with a message", async () => {
      await register("double@example.com");
      const dup = await sendJson(port, "/api/auth/register", { name: "X", email: " DOUBLE@example.com", password: "good-and-long-password-1" });
      assert.equal(dup.status, 409);
      assert.equal(dup.json().error, "We couldn't create an account with this address. If you already have one, log in.");
      const bad = await sendJson(port, "/api/auth/register", { name: "X", email: "not-an-email", password: "good-and-long-password-1" });
      assert.equal(bad.status, 400);
      assert.equal(bad.json().error, "That email address doesn't look right.");
      for (const body of ["null", "5", '"text"', "[]"]) {
        const res = await send(port, "/api/auth/register", {
          method: "POST",
          body,
          headers: { "content-type": "application/json", origin: `http://127.0.0.1:${port}` },
        });
        assert.equal(res.status, 400, body);
        assert.equal(typeof res.json().error, "string");
      }
      const invalid = await send(port, "/api/auth/login", { method: "POST", body: "{not json", headers: { "content-type": "application/json" } });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.json().error, "The data sent isn't valid JSON.");
    });

    test("the visitor's messages follow the site's language (site.json → “lang”: “ro”)", async () => {
      await register("romanian@example.com");
      await inRomanian(async () => {
        const wrong = await sendJson(port, "/api/auth/login", { email: "romanian@example.com", password: "wrong-123" });
        assert.equal(wrong.status, 401);
        assert.deepEqual(wrong.json(), { error: "Email sau parolă greșită." });
        const short = await sendJson(port, "/api/auth/register", { name: "Ana", email: "short@example.com", password: "o parola de 14" });
        assert.equal(short.status, 400);
        assert.equal(short.json().error, "Parola trebuie să aibă cel puțin 15 caractere. O propoziție scurtă e ușor de ținut minte.");
        const invalid = await send(port, "/api/auth/login", { method: "POST", body: "{x", headers: { "content-type": "application/json" } });
        assert.equal(invalid.json().error, "Datele trimise nu sunt JSON valid.");
        const foreign = await sendJson(port, "/api/auth/logout", {}, { headers: { origin: "https://evil.com" } });
        assert.equal(foreign.json().error, "Cerere blocată: a venit de pe alt site.");
      });
    });

    test("a Content-Type that isn't JSON → 415", async () => {
      for (const type of [undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "text/plain; a=application/json", "text/plain;application/json"]) {
        const headers = { origin: `http://127.0.0.1:${port}` };
        if (type) headers["content-type"] = type;
        const res = await send(port, "/api/auth/login", { method: "POST", body: '{"email":"a@b.com","password":"x"}', headers });
        assert.equal(res.status, 415, String(type));
        assert.ok(res.json().error.includes("JSON"));
      }
      const ok = await sendJson(port, "/api/auth/logout", {}, { headers: { "content-type": "Application/JSON; charset=utf-8" } });
      assert.equal(ok.status, 200);
    });

    test("an Origin from another site → 403", async (t) => {
      t.mock.method(console, "warn", () => {}); // the proxy tip, because of the local Host in the tests
      for (const origin of ["http://evil.com", "null", "http://127.0.0.1:1", "not-a-url"]) {
        const res = await sendJson(port, "/api/auth/register", { name: "X", email: "csrf@example.com", password: "good-and-long-password-1" }, { headers: { origin } });
        assert.equal(res.status, 403, origin);
        assert.equal(res.json().error, "Request blocked: it came from another site.");
      }
      const login = await sendJson(port, "/api/auth/login", { email: "a@b.com", password: "x" }, { headers: { origin: "https://evil.com" } });
      assert.equal(login.status, 403);
    });

    test("wrong methods and routes; a body too large → 413", async () => {
      assert.equal((await get("/api/auth/login")).status, 405);
      assert.equal((await sendJson(port, "/api/auth/me", {})).status, 405);
      assert.equal((await get("/api/auth/something-else")).status, 404);
      assert.equal((await get("/api/something-else")).status, 404);
      const big = await sendJson(port, "/api/auth/login", { email: "a@b.com", password: "x".repeat(20_000) });
      assert.equal(big.status, 413);
      assert.equal(big.json().error, "The request is too large.");
    });

    test("TRUST_PROXY=1: the limit uses the address added by the proxy, not what the client writes in X-Forwarded-For", async () => {
      await register("proxy@example.com");
      const wrong = (forwarded) =>
        sendJson(port, "/api/auth/login", { email: "proxy@example.com", password: "wrong-123" }, { headers: { "x-forwarded-for": forwarded } });
      const previous = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "1";
      try {
        // The client changes the first address every time; the proxy adds the real one at the end.
        for (let i = 0; i < 10; i++) assert.equal((await wrong(`10.9.9.${i}, 203.0.113.7`)).status, 401);
        assert.equal((await wrong("10.9.9.99, 203.0.113.7")).status, 429);
        assert.equal((await wrong("203.0.113.7")).status, 429);
        assert.equal((await wrong("10.9.9.1, 203.0.113.8")).status, 401);
      } finally {
        if (previous === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = previous;
      }
      // Without TRUST_PROXY the header is ignored: the connection's address is what counts.
      assert.equal((await wrong("203.0.113.7")).status, 401);
    });

    test("behind a proxy: with TRUST_PROXY=1 X-Forwarded-Host counts too; the default port doesn't matter", async (t) => {
      t.mock.method(console, "warn", () => {}); // the proxy_set_header tip (once per process)
      const logout = (headers) => sendJson(port, "/api/auth/logout", {}, { headers });
      const nginx = { host: "127.0.0.1:3000", origin: "https://cafe.example.com", "x-forwarded-host": "cafe.example.com", "x-forwarded-proto": "https" };
      assert.equal((await logout(nginx)).status, 403);
      const previous = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "1";
      try {
        assert.equal((await logout(nginx)).status, 200);
        // Another site still doesn't get through, however it writes the headers.
        assert.equal((await logout({ ...nginx, origin: "https://evil.com" })).status, 403);
        assert.equal((await logout({ host: "127.0.0.1:3000", origin: "https://cafe.example.com" })).status, 403);
      } finally {
        if (previous === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = previous;
      }
      assert.equal((await logout({ host: "cafe.example.com:443", origin: "https://cafe.example.com" })).status, 200);
      assert.equal((await logout({ host: "Cafe.Example.COM", origin: "http://cafe.example.com" })).status, 200);
      assert.equal((await logout({ host: "cafe.example.com:443", origin: "http://cafe.example.com" })).status, 403);
    });

    test("Secure on the cookie when the request comes through https", async () => {
      const res = await sendJson(
        port,
        "/api/auth/register",
        { name: "S", email: "secure@example.com", password: "good-and-long-password-1" },
        { headers: { "x-forwarded-proto": "https" } },
      );
      assert.equal(res.status, 200);
      assert.ok(res.headers["set-cookie"][0].includes("Secure"));
    });
  });

  describe("component routes (/api/c/ID/ROUTE)", () => {
    test("returns the result as JSON; the handler gets body, query, user", async () => {
      const res = await sendJson(port, "/api/c/form/submit?x=1&y=%C8%99", { email: "a@b.com", list: [1, 2] }, { headers: { "x-test": "yes" } });
      assert.equal(res.status, 200);
      assert.match(res.headers["content-type"], /^application\/json/);
      assert.deepEqual(res.json(), {
        body: { email: "a@b.com", list: [1, 2] },
        query: { x: "1", y: "ș" },
        user: null,
        method: "POST",
        path: "/submit",
        hasIp: true,
        header: "yes",
      });
      const cookie = await register("route@example.com");
      const logged = await sendJson(port, "/api/c/form/submit", {}, { headers: { cookie } });
      assert.equal(logged.json().user.email, "route@example.com");
      assert.deepEqual(Object.keys(logged.json().user).sort(), ["email", "id", "name"]);
      const info = await get("/api/c/form/info?q=coffee", { cookie });
      assert.deepEqual(info.json().query, { q: "coffee" });
      assert.deepEqual(info.json().body, {});
      assert.equal(info.json().user.email, "route@example.com");
    });

    test("ctx.site: the site settings, e.g. to answer in the site's language", async () => {
      assert.deepEqual((await get("/api/c/form/info")).json(), { query: {}, body: {}, user: null, lang: "en", name: "Test Site" });
      await inRomanian(async () => {
        assert.equal((await get("/api/c/form/info")).json().lang, "ro");
      });
    });

    test("the root route and a missing result → { ok: true }", async () => {
      assert.deepEqual((await get("/api/c/form")).json(), { root: true });
      const res = await get("/api/c/form/nothing");
      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), { ok: true });
    });

    test("an unknown route → 404, in the site's language (the editor's API stays in English)", async () => {
      for (const path of ["/api/c/form/does-not-exist", "/api/c/no-such-block/x", "/api/auth/nope", "/api/other"]) {
        const res = await get(path);
        assert.equal(res.status, 404, path);
        assert.deepEqual(res.json(), { error: "Route not found." }, path);
      }
      await inRomanian(async () => {
        for (const path of ["/api/c/form/does-not-exist", "/api/auth/nope", "/api/other"]) {
          assert.deepEqual((await get(path)).json(), { error: "Ruta nu există." }, path);
        }
      });
    });

    test("ctx.error → the status and { error }", async () => {
      const res = await sendJson(port, "/api/c/form/error", {});
      assert.equal(res.status, 422);
      assert.deepEqual(res.json(), { error: "Please write your email address." });
    });

    test("an unexpected error → 500 with a general message (no internal details), in the site's language", async (t) => {
      t.mock.method(console, "error", () => {});
      const res = await get("/api/c/form/throws");
      assert.equal(res.status, 500);
      assert.deepEqual(res.json(), { error: "Something went wrong on the server." });
      assert.ok(!res.text.includes("secret internal detail"));
      await inRomanian(async () => {
        assert.deepEqual((await get("/api/c/form/throws")).json(), { error: "A apărut o eroare pe server." });
      });
    });

    test("ctx.error with an invalid status doesn't stop the server: 400 with the message, plus a tip in the terminal", async (t) => {
      const warn = t.mock.method(console, "warn", () => {});
      const res = await get("/api/c/form/wrong-status");
      assert.equal(res.status, 400);
      assert.deepEqual(res.json(), { error: "odd status" });
      const missing = await get("/api/c/form/no-status");
      assert.equal(missing.status, 400);
      assert.deepEqual(missing.json(), { error: "Message without a status" });
      assert.ok(warn.mock.calls.some((c) => String(c.arguments[0]).includes("ctx.error(status, message)")));
      assert.equal((await get("/api/c/form/nothing")).status, 200);
    });

    test("ctx.error(500, ...) shows the visitor the general message", async (t) => {
      t.mock.method(console, "error", () => {});
      const res = await get("/api/c/form/error-500");
      assert.equal(res.status, 500);
      assert.deepEqual(res.json(), { error: "Something went wrong on the server." });
    });

    test("a route's body is always an object: null, 5, \"text\" or [] → 400, not a server error", async () => {
      for (const body of ["null", "5", '"text"', "[]"]) {
        const res = await send(port, "/api/c/form/save", {
          method: "POST",
          body,
          headers: { "content-type": "application/json", origin: `http://127.0.0.1:${port}` },
        });
        assert.equal(res.status, 400, body);
        assert.equal(res.json().error, "Send the data as a JSON object, like { ... }.");
      }
      assert.deepEqual((await send(port, "/api/c/form/info")).json().body, {});
    });

    test("ctx.data saves into the project's data/", async () => {
      const res = await sendJson(port, "/api/c/form/save", { text: "Hello!" });
      assert.equal(res.status, 200);
      const item = res.json();
      assert.equal(item.text, "Hello!");
      assert.equal(typeof item.id, "string");
      assert.equal(typeof item.created, "string");
      const saved = JSON.parse(readFileSync(join(root, "data/messages.json"), "utf8"));
      assert.deepEqual(saved, [item]);
    });

    test("ctx.limit: above max → 429, with the default message (in the site's language) or the route's own", async () => {
      const from = (ip) => ({ headers: { "x-forwarded-for": ip } });
      const previous = process.env.TRUST_PROXY;
      process.env.TRUST_PROXY = "1";
      try {
        assert.equal((await sendJson(port, "/api/c/form/limited", {}, from("198.51.100.1"))).status, 200);
        assert.equal((await sendJson(port, "/api/c/form/limited", {}, from("198.51.100.1"))).status, 200);
        const third = await sendJson(port, "/api/c/form/limited", {}, from("198.51.100.1"));
        assert.equal(third.status, 429);
        assert.deepEqual(third.json(), { error: "Too many attempts. Please try again in a few minutes." });
        await inRomanian(async () => {
          assert.deepEqual((await sendJson(port, "/api/c/form/limited", {}, from("198.51.100.1"))).json(), {
            error: "Prea multe încercări. Încearcă din nou peste câteva minute.",
          });
        });
        // Another address has its own count; the same /64 IPv6 network counts as one address.
        assert.equal((await sendJson(port, "/api/c/form/limited", {}, from("198.51.100.2"))).status, 200);
        assert.equal((await sendJson(port, "/api/c/form/limited-own", {}, from("2001:db8:5::1"))).status, 200);
        const own = await sendJson(port, "/api/c/form/limited-own", {}, from("2001:db8:5::2"));
        assert.deepEqual([own.status, own.json()], [429, { error: "Easy there: one per minute." }]);
        // allVisitors: a single count for the whole site.
        assert.equal((await sendJson(port, "/api/c/form/limited-all", {}, from("198.51.100.3"))).status, 200);
        assert.equal((await sendJson(port, "/api/c/form/limited-all", {}, from("198.51.100.4"))).status, 429);
      } finally {
        if (previous === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = previous;
      }
    });

    test("ctx.block: only a block of the route's kind that the visitor really sees on that page", async () => {
      const find = (body, headers) => sendJson(port, "/api/c/form/find", body, { headers });
      assert.deepEqual((await find({ page: "/", block: "f1" })).json(), { id: "f1", type: "form", path: "/", name: "Form", title: "Home" });
      assert.equal((await find({ page: "/?x=1#top", block: "f1" })).json().path, "/");
      // In the header, shown on every page with zones.
      assert.equal((await find({ page: "/about/", block: "f3" })).json().path, "/about");
      assert.equal((await find({ page: "/no-zones", block: "f3" })).json(), null);
      // Another kind of block, a missing one, a missing page, a members-only page for a visitor.
      for (const body of [{ page: "/", block: "b1" }, { page: "/", block: "nope" }, { page: "/does-not-exist", block: "f1" }, { page: "/members", block: "f2" }, { page: "", block: "f1" }, { page: 5, block: "f1" }, { page: "/", block: "" }]) {
        assert.equal((await find(body)).json(), null, JSON.stringify(body));
      }
      const cookie = await register("finder@example.com");
      assert.equal((await find({ page: "/members", block: "f2" }, { cookie })).json().id, "f2");
    });

    test("an unknown route or component → 404", async () => {
      for (const path of [
        "/api/c/form/does-not-exist",
        "/api/c/form/submit", // GET on a POST route
        "/api/c/form/toString",
        "/api/c/form/__proto__",
        "/api/c/form/constructor",
        "/api/c/does-not-exist/submit",
        "/api/c/heading/x",
        "/api/c/Form/submit",
        "/api/c/",
        "/api/c/-x/y",
      ]) {
        const res = await get(path);
        assert.equal(res.status, 404, path);
        assert.equal(typeof res.json().error, "string", path);
      }
      assert.equal((await sendJson(port, "/api/c/form/does-not-exist", {})).status, 404);
    });

    test("POST: a JSON body too large → 413; another Content-Type → 415; another Origin → 403", async () => {
      const big = await sendJson(port, "/api/c/form/submit", { text: "x".repeat(1_100_000) });
      assert.equal(big.status, 413);
      assert.equal(big.json().error, "The request is too large.");
      const text = await send(port, "/api/c/form/submit", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } });
      assert.equal(text.status, 415);
      const sneaky = await send(port, "/api/c/form/submit", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "text/plain; x=application/json" },
      });
      assert.equal(sneaky.status, 415);
      const foreign = await sendJson(port, "/api/c/form/submit", {}, { headers: { origin: "http://evil.com" } });
      assert.equal(foreign.status, 403);
      const bad = await send(port, "/api/c/form/submit", { method: "POST", body: "{x", headers: { "content-type": "application/json" } });
      assert.equal(bad.status, 400);
    });
  });
});
