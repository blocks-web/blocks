// server/server.js in "dev" mode: the Host header, the editor's API, uploads, SSE events.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { startServer } from "../server/server.js";
import { contentSecurityPolicy } from "../server/csp.js";
import { ANSWERS, serverText } from "../editor/api.js";
import { RO, setLang } from "../editor/i18n.js";
import { componentSource, makeProject, removeProject, send, writeFiles } from "./helpers.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
// The start of each kind of image (the server looks at the first bytes, not only at the name).
const JPG = (text) => Buffer.concat([Buffer.from("ffd8ffe0", "hex"), Buffer.from(text)]);
const GIF = Buffer.from("GIF89a\u0001\u0000\u0001\u0000", "latin1");
const WEBP = Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ", "latin1");
const AVIF = Buffer.concat([Buffer.from("0000001c", "hex"), Buffer.from("ftypmif1\u0000\u0000\u0000\u0000mif1avifmiaf", "latin1")]);

const FILES = {
  "site.json": { name: "Dev Site", lang: "ro", theme: { primary: "#112233" } },
  "editor/index.html": "<!doctype html><title>EDITOR-HTML</title>\n",
  "components/heading.js": componentSource(`{
    name: "Heading",
    props: { text: { type: "text", default: "Heading" } },
    html: (p) => html\`<h1>\${p.text}</h1>\`,
  }`),
  "components/form.js": componentSource(`{ name: "Form", html: () => html\`<form></form>\` }`),
  "components/form.server.js": "export default { \"GET /x\": () => ({ x: 1 }) };\n",
  "components/notes.txt": "not a component\n",
  "pages/index.json": { title: "Home", blocks: [{ id: "b1", type: "heading", props: { text: "HOME" } }] },
  "pages/about.json": { title: "About us", access: "members", blocks: [] },
  "pages/_footer.json": { blocks: [] },
  "pages/Bad.json": { title: "invalid name" },
};

describe("server (dev)", () => {
  let root;
  let srv;
  let port;
  let origin;

  before(async () => {
    root = makeProject(FILES);
    srv = await startServer({ root, mode: "dev", port: 0, quiet: true });
    port = srv.port;
    origin = `http://localhost:${port}`;
  });
  after(async () => {
    await srv?.close();
    removeProject(root);
  });

  // The editor and /_api live on localhost; the site's pages on 127.0.0.1 (another origin).
  const hostFor = (path) => (/^\/_(editor|api)\b/.test(path) ? `localhost:${port}` : `127.0.0.1:${port}`);
  const get = (path, headers) => send(port, path, { headers: { host: hostFor(path), ...headers } });
  // An editor request that changes something: the x-blocks header and the same origin.
  const edit = (method, path, body, headers = {}) =>
    send(port, path, {
      method,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      headers: { host: `localhost:${port}`, "content-type": "application/json", "x-blocks": "1", origin, ...headers },
    });
  const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

  test("listens only on 127.0.0.1 and gives the localhost address", () => {
    assert.equal(srv.server.address().address, "127.0.0.1");
    assert.equal(srv.url, `http://localhost:${port}`);
  });

  test("foreign Host headers → 403 (DNS rebinding protection)", async () => {
    // (An empty Host can't be sent: node:http puts the default header back.)
    for (const host of ["evil.com", `evil.com:${port}`, "localhost:1", `127.0.0.1.evil.com:${port}`, `localhost.evil.com:${port}`, `0.0.0.0:${port}`]) {
      const res = await get("/", { host });
      assert.equal(res.status, 403, host);
      assert.equal(res.json().error, "Address not allowed.");
    }
    const api = await get("/_api/site", { host: "evil.com" });
    assert.equal(api.status, 403);
    assert.ok(!api.text.includes("Dev Site"));
    assert.equal((await get("/", { host: `127.0.0.1:${port}` })).status, 200);
    for (const host of [`localhost:${port}`, `LOCALHOST:${port}`]) assert.equal((await get("/", { host })).status, 302, host);
  });

  test("the site works in dev too", async () => {
    const res = await get("/");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("<h1>HOME</h1>"));
    assert.ok(res.text.includes("--primary:#112233;"));
    assert.ok(!res.text.includes("data-slot"));
  });

  test("Content-Security-Policy on the site's pages in dev too; not on the editor and /_api", async () => {
    assert.equal((await get("/")).headers["content-security-policy"], contentSecurityPolicy());
    for (const path of ["/_editor/", "/_api/components", "/_api/site"]) {
      assert.equal((await get(path)).headers["content-security-policy"], undefined, path);
    }
  });

  // The site's pages (with Embed, "head", "scripts") don't share the editor's origin:
  // "View page" in the editor opens the page on 127.0.0.1, where /_api doesn't answer.
  test("in dev, the editor lives on localhost and the pages on 127.0.0.1", async () => {
    const page = await get("/about?x=1", { host: `localhost:${port}` });
    assert.equal(page.status, 302);
    assert.equal(page.headers.location, `http://127.0.0.1:${port}/about?x=1`);
    // A path like "//other-site.com/x" doesn't send anyone to another site.
    assert.equal((await get("//evil.com/x", { host: `localhost:${port}` })).headers.location, `http://127.0.0.1:${port}/x`);
    const editorPage = await get("/_editor/index.html?a=1", { host: `127.0.0.1:${port}` });
    assert.equal(editorPage.status, 302);
    assert.equal(editorPage.headers.location, `http://localhost:${port}/_editor/index.html?a=1`);
    const site = `http://127.0.0.1:${port}`;
    const api = await get("/_api/site", { host: `127.0.0.1:${port}` });
    assert.equal(api.status, 403);
    assert.equal(api.json().error, `The editor only answers on http://localhost:${port}.`);
    assert.ok(!api.text.includes("Dev Site"));
    // A script on one of the site's pages: neither from its own address nor from the editor's.
    assert.equal((await edit("PUT", "/_api/pages/index", { title: "BROKEN" }, { host: `127.0.0.1:${port}`, origin: site })).status, 403);
    assert.equal((await edit("PUT", "/_api/pages/index", { title: "BROKEN" }, { origin: site })).status, 403);
    assert.ok(!readFileSync(join(root, "pages/index.json"), "utf8").includes("BROKEN"));
    // The public files (for the editor's canvas and for the site) work on both addresses.
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) {
      assert.equal((await get("/core/base.css", { host })).status, 200, host);
      assert.equal((await get("/components/heading.js", { host })).status, 200, host);
    }
  });

  // S7: the code pasted into the Embed block runs in the editor in a sandboxed frame, without
  // allow-same-origin. Its requests come with "Origin: null"; the browser asks first (preflight), for the x-blocks header.
  test("S7: a script in the isolated frame can't write pages (Origin: null → refused, also when the browser asks)", async () => {
    const preflight = await send(port, "/_api/pages/index", {
      method: "OPTIONS",
      headers: { host: `localhost:${port}`, origin: "null", "access-control-request-method": "PUT", "access-control-request-headers": "content-type,x-blocks" },
    });
    assert.ok(preflight.status >= 400, String(preflight.status));
    assert.equal(preflight.headers["access-control-allow-origin"], undefined);
    const before = readFileSync(join(root, "pages/index.json"), "utf8");
    for (const [method, path, body] of [
      ["PUT", "/_api/pages/index", { title: "BROKEN", blocks: [] }],
      ["PUT", "/_api/site", { name: "BROKEN", head: ["<script>x()</script>"] }],
      ["PUT", "/_api/zones/header", { blocks: [] }],
      ["DELETE", "/_api/pages/about", undefined],
    ]) {
      const res = await edit(method, path, body, { origin: "null" });
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.json().error, "Request blocked: it came from another site.");
    }
    const upload = await send(port, "/_api/upload?name=a.png", {
      method: "POST",
      body: PNG,
      headers: { host: `localhost:${port}`, "x-blocks": "1", origin: "null" },
    });
    assert.equal(upload.status, 403);
    assert.equal(readFileSync(join(root, "pages/index.json"), "utf8"), before);
    assert.ok(!readFileSync(join(root, "site.json"), "utf8").includes("BROKEN"));
    assert.ok(existsSync(join(root, "pages/about.json")));
  });

  test("in dev, a page with broken JSON shows which file to fix", async (t) => {
    t.mock.method(console, "error", () => {});
    writeFileSync(join(root, "pages/broken.json"), '{"title": "X", "blocks": [');
    try {
      const res = await get("/broken");
      assert.equal(res.status, 500);
      assert.match(res.headers["content-type"], /^text\/html/);
      assert.match(res.text, /The file pages\/broken\.json isn('|&#39;|&#x27;)t valid JSON/);
      assert.ok(res.text.includes("Fix the file and reload the page."));
    } finally {
      rmSync(join(root, "pages/broken.json"));
    }
  });

  test("/_editor → /_editor/, which serves the editor", async () => {
    const redirect = await get("/_editor");
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, `http://localhost:${port}/_editor/`);
    const res = await get("/_editor/");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /^text\/html/);
    assert.ok(res.text.includes("EDITOR-HTML"));
    assert.equal(res.headers["cache-control"], "no-store");
    // A site page opened from the editor ("View page") doesn't get a window.opener to it.
    assert.equal(res.headers["cross-origin-opener-policy"], "same-origin");
    assert.equal((await get("/_editor/no-such-file.js")).status, 404);
    assert.equal((await get("/_editor/..%2fsite.json")).status, 404);
  });

  test("GET /_api/components → [{ id, hasServer }]", async () => {
    const res = await get("/_api/components");
    assert.equal(res.status, 200);
    assert.deepEqual(res.json(), [
      { id: "form", hasServer: true },
      { id: "heading", hasServer: false },
    ]);
  });

  test("GET /_api/components: a component that doesn't load comes with the reason and the line of the mistake", async (t) => {
    t.mock.method(console, "error", () => {});
    t.mock.method(console, "warn", () => {});
    writeFiles(root, { "components/broken.js": 'export default {\n  name: "X",\n  html() { return oops oops; },\n};\n' });
    try {
      const row = (await get("/_api/components")).json().find((c) => c.id === "broken");
      assert.equal(row.hasServer, false);
      assert.match(row.error, /^components\/broken\.js, line 3: /);
    } finally {
      rmSync(join(root, "components/broken.js"));
    }
  });

  describe("/_api/pages", () => {
    test("the list of pages (without zones and without invalid names, which are reported once)", async (t) => {
      const warn = t.mock.method(console, "warn", () => {});
      const res = await get("/_api/pages");
      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), [
        { slug: "about", title: "About us", path: "/about", access: "members", types: [] },
        { slug: "index", title: "Home", path: "/", access: "public", types: ["heading"] },
      ]);
      await get("/_api/pages");
      const skipped = warn.mock.calls.map((c) => String(c.arguments[0])).filter((m) => m.includes("pages/Bad.json"));
      assert.equal(skipped.length, 1);
      assert.ok(skipped[0].startsWith("[blocks] Skipped pages/Bad.json:"));
    });

    test("GET a page; 404 if it doesn't exist; 400 for an invalid name", async () => {
      const res = await get("/_api/pages/index");
      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), readJson("pages/index.json"));
      const missing = await get("/_api/pages/no-such-page");
      assert.equal(missing.status, 404);
      assert.equal(missing.json().error, "The page doesn't exist.");
      for (const slug of ["Bad", "a_b", "-a", "_footer", "a.json", "a%2fb", "a%00", "x".repeat(65)]) {
        const bad = await get(`/_api/pages/${slug}`);
        assert.equal(bad.status, 400, slug);
        assert.equal(bad.json().error, "The page name can only have lowercase letters, digits and hyphens.", slug);
      }
      assert.equal((await get("/_api/pages/a/b")).status, 404);
    });

    test("changes need x-blocks: 1 and the same origin", async () => {
      const page = { title: "New", blocks: [] };
      const noHeader = await send(port, "/_api/pages/new", {
        method: "PUT",
        body: JSON.stringify(page),
        headers: { host: `localhost:${port}`, "content-type": "application/json", origin },
      });
      assert.equal(noHeader.status, 403);
      assert.equal(noHeader.json().error, "The x-blocks header is missing.");
      assert.equal((await edit("PUT", "/_api/pages/new", page, { "x-blocks": "0" })).status, 403);
      for (const bad of ["http://evil.com", "null", `http://127.0.0.1:${port}`, "http://localhost:1"]) {
        assert.equal((await edit("PUT", "/_api/pages/new", page, { origin: bad })).status, 403, bad);
      }
      assert.equal((await edit("DELETE", "/_api/pages/about", undefined, { "x-blocks": undefined })).status, 403);
      assert.equal(existsSync(join(root, "pages/new.json")), false);
      assert.equal(existsSync(join(root, "pages/about.json")), true);
    });

    test("PUT creates the page (with default values), GET returns it", async () => {
      const res = await edit("PUT", "/_api/pages/new", { title: "New", blocks: [{ id: "b1", type: "heading", props: { text: "NEW" } }] });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), { ok: true });
      const saved = readJson("pages/new.json");
      assert.equal(saved.title, "New");
      assert.equal(saved.access, "public");
      assert.equal(saved.blocks.length, 1);
      assert.deepEqual((await get("/_api/pages/new")).json(), saved);
      assert.ok((await get("/new")).text.includes("<h1>NEW</h1>"));
      // Without an Origin (e.g. a local script) it's allowed, with the x-blocks header.
      const noOrigin = await edit("PUT", "/_api/pages/no-origin", {}, { origin: undefined });
      assert.equal(noOrigin.status, 200);
      assert.deepEqual(readJson("pages/no-origin.json"), { title: "", access: "public", blocks: [] });
      assert.equal(readdirSync(join(root, "pages")).filter((f) => f.endsWith(".tmp")).length, 0);
    });

    test("simultaneous saves of the same page: all of them succeed, the file stays valid", async () => {
      const pages = Array.from({ length: 12 }, (_, i) => ({ title: `V${i} ${"x".repeat(20_000 + i * 997)}`, access: "public", blocks: [] }));
      const results = await Promise.all(pages.map((page) => edit("PUT", "/_api/pages/simultaneous", page)));
      assert.deepEqual(
        results.map((r) => r.status),
        pages.map(() => 200),
      );
      const saved = readJson("pages/simultaneous.json");
      assert.ok(pages.some((p) => p.title === saved.title));
      assert.equal(readdirSync(join(root, "pages")).filter((f) => f.endsWith(".tmp")).length, 0);
      assert.equal((await edit("DELETE", "/_api/pages/simultaneous")).status, 200);
    });

    test("PUT with an invalid name or content → 400 / 415", async () => {
      for (const slug of ["Bad", "_header", "a_b", "-x"]) {
        assert.equal((await edit("PUT", `/_api/pages/${slug}`, { blocks: [] })).status, 400, slug);
      }
      assert.equal(existsSync(join(root, "pages/_header.json")), false);
      for (const body of ["[]", "null", '"text"', "5", '{"blocks":"x"}', '{"blocks":{}}', '{"access":"everyone"}', "{not json"]) {
        const res = await edit("PUT", "/_api/pages/invalid", body);
        assert.equal(res.status, 400, body);
        assert.equal(typeof res.json().error, "string");
      }
      assert.equal((await edit("PUT", "/_api/pages/invalid", '{"access":"everyone"}')).json().error, "“access” can be “public” or “members”.");
      assert.equal((await edit("PUT", "/_api/pages/invalid", '{"blocks":"x"}')).json().error, "“blocks” must be a list.");
      assert.equal((await edit("PUT", "/_api/pages/invalid", "[]")).json().error, "The page must be an object.");
      const text = await edit("PUT", "/_api/pages/invalid", "{}", { "content-type": "text/plain" });
      assert.equal(text.status, 415);
      assert.equal(existsSync(join(root, "pages/invalid.json")), false);
    });

    test("the page's shape is checked before writing: too deep, too large, blocks that aren't objects → refused", async () => {
      // 1000 sections one inside another (55 KB) would have swelled to 24 MB on disk.
      let deep = { id: "f", type: "text", props: {} };
      for (let i = 0; i < 1000; i++) deep = { id: `s${i}`, type: "section", props: {}, slots: { content: [deep] } };
      const tooDeep = await edit("PUT", "/_api/pages/deep", { title: "x", blocks: [deep] });
      assert.equal(tooDeep.status, 400);
      assert.equal(tooDeep.json().error, "The page has too many blocks nested inside each other.");
      // A deep list of zeros: 0.27 MB that would have become hundreds of MB.
      let list = Array(100).fill(0);
      for (let i = 0; i < 300; i++) list = [list];
      assert.equal((await edit("PUT", "/_api/pages/deep", { title: "x", blocks: [], extra: list })).status, 400);
      const big = await edit("PUT", "/_api/pages/big", { title: "x", blocks: Array.from({ length: 60000 }, () => ({ type: "text" })) });
      assert.equal(big.status, 413);
      assert.equal(big.json().error, "The page is too large: it has too many blocks or settings.");
      for (const blocks of [[null], [5], ["text"], [[]], [{ type: "x", slots: [] }], [{ type: "x", slots: { c: {} } }], [{ type: "x", slots: { c: [7] } }]]) {
        const res = await edit("PUT", "/_api/pages/wrong", { title: "x", blocks });
        assert.equal(res.status, 400, JSON.stringify(blocks));
      }
      assert.equal((await edit("PUT", "/_api/pages/wrong", { title: "x", blocks: [5] })).json().error, "The page: every block must be an object { type, props }.");
      // (not "bad": pages/Bad.json exists, and a disk may not tell capitals apart)
      for (const slug of ["deep", "big", "wrong"]) assert.equal(existsSync(join(root, `pages/${slug}.json`)), false, slug);
      // An ordinary page, with a few levels, goes through.
      let fine = { id: "t", type: "text", props: {} };
      for (let i = 0; i < 10; i++) fine = { id: `s${i}`, type: "section", props: {}, slots: { content: [fine] } };
      assert.equal((await edit("PUT", "/_api/pages/deep", { title: "x", blocks: [fine] })).status, 200);
      assert.equal((await edit("DELETE", "/_api/pages/deep")).status, 200);
      // The same for the zones and for site.json.
      assert.equal((await edit("PUT", "/_api/zones/header", { blocks: [deep] })).json().error, "The header has too many blocks nested inside each other.");
      assert.equal((await edit("PUT", "/_api/zones/footer", { blocks: [5] })).status, 400);
      assert.equal((await edit("PUT", "/_api/zones/footer", [])).status, 400);
      assert.equal((await edit("PUT", "/_api/site", { name: "x", extra: list })).status, 400);
    });

    test("DELETE deletes the page, but not index", async () => {
      const index = await edit("DELETE", "/_api/pages/index");
      assert.equal(index.status, 400);
      assert.equal(index.json().error, "The home page (index) can't be deleted.");
      assert.ok(existsSync(join(root, "pages/index.json")));
      assert.equal((await edit("DELETE", "/_api/pages/new")).status, 200);
      assert.equal(existsSync(join(root, "pages/new.json")), false);
      assert.equal((await edit("DELETE", "/_api/pages/new")).status, 404);
      assert.equal((await edit("DELETE", "/_api/pages/Bad")).status, 400);
      assert.ok(existsSync(join(root, "pages/Bad.json")));
    });

    test("methods that aren't allowed → 405", async () => {
      assert.equal((await edit("POST", "/_api/pages/index", {})).status, 405);
      assert.equal((await edit("PUT", "/_api/pages", {})).status, 405);
    });
  });

  describe("/_api/zones", () => {
    test("GET a zone that doesn't exist yet → { blocks: [] }", async () => {
      const res = await get("/_api/zones/header");
      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), { blocks: [] });
    });

    test("PUT saves pages/_header.json; the zone shows on the pages", async () => {
      const zone = { blocks: [{ id: "z1", type: "heading", props: { text: "NEW-MENU" } }] };
      const res = await edit("PUT", "/_api/zones/header", zone);
      assert.equal(res.status, 200);
      assert.deepEqual(readJson("pages/_header.json"), zone);
      assert.deepEqual((await get("/_api/zones/header")).json(), zone);
      const page = await get("/");
      assert.ok(page.text.indexOf("NEW-MENU") < page.text.indexOf("HOME"));
      assert.ok(page.text.indexOf("NEW-MENU") > 0);
      const empty = await edit("PUT", "/_api/zones/footer", {});
      assert.equal(empty.status, 200);
      assert.deepEqual(readJson("pages/_footer.json"), { blocks: [] });
    });

    test("unknown zone → 404; invalid body → 400; without the header → 403", async () => {
      const unknown = await get("/_api/zones/navbar");
      assert.equal(unknown.status, 404);
      assert.equal(unknown.json().error, "Unknown zone.");
      assert.equal((await edit("PUT", "/_api/zones/navbar", { blocks: [] })).status, 404);
      assert.equal(existsSync(join(root, "pages/_navbar.json")), false);
      for (const body of ['{"blocks":5}', '{"blocks":"x"}', "null", "{x"]) {
        assert.equal((await edit("PUT", "/_api/zones/header", body)).status, 400, body);
      }
      assert.equal((await edit("PUT", "/_api/zones/header", '{"blocks":5}')).json().error, "The zone must have a “blocks” list.");
      assert.equal((await edit("PUT", "/_api/zones/header", { blocks: [] }, { "x-blocks": undefined })).status, 403);
      assert.equal(readJson("pages/_header.json").blocks.length, 1);
    });
  });

  describe("/_api/site", () => {
    test("GET returns site.json with the default values", async () => {
      const site = (await get("/_api/site")).json();
      assert.equal(site.name, "Dev Site");
      assert.equal(site.lang, "ro");
      assert.equal(site.loginPage, "/login");
      assert.equal(site.theme.primary, "#112233");
    });

    test("PUT saves; a body that isn't an object → 400", async () => {
      const res = await edit("PUT", "/_api/site", { name: "New Site", lang: "en", theme: { primary: "#000000" } });
      assert.equal(res.status, 200);
      assert.equal(readJson("site.json").name, "New Site");
      assert.equal((await get("/_api/site")).json().name, "New Site");
      for (const body of ["[]", "null", '"x"', "7"]) {
        const bad = await edit("PUT", "/_api/site", body);
        assert.equal(bad.status, 400, body);
        assert.equal(bad.json().error, "The settings must be an object.", body);
      }
      assert.equal(readJson("site.json").name, "New Site");
      assert.equal((await edit("PUT", "/_api/site", { name: "X" }, { origin: "http://evil.com" })).status, 403);
      assert.equal(readJson("site.json").name, "New Site");
    });
  });

  describe("/_api/upload", () => {
    const upload = (name, body, headers = {}) =>
      send(port, `/_api/upload?name=${encodeURIComponent(name)}`, {
        method: "POST",
        body,
        headers: { host: `localhost:${port}`, "content-type": "application/octet-stream", "x-blocks": "1", origin, ...headers },
      });

    test("an image is saved in assets/uploads with a tidy name (no accents)", async () => {
      const res = await upload("Țară frumoasă ăâîșț.PNG", PNG);
      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), { url: "/assets/uploads/tara-frumoasa-aaist.png" });
      assert.deepEqual(readFileSync(join(root, "assets/uploads/tara-frumoasa-aaist.png")), PNG);
      const served = await get("/assets/uploads/tara-frumoasa-aaist.png");
      assert.equal(served.status, 200);
      assert.equal(served.headers["content-type"], "image/png");
      assert.deepEqual(served.buffer, PNG);
    });

    test("it doesn't overwrite: the second upload gets “-1”", async () => {
      const first = await upload("photo.jpg", JPG("one"));
      const second = await upload("photo.jpg", JPG("two"));
      const third = await upload("PHOTO.jpg", JPG("three"));
      assert.equal(first.json().url, "/assets/uploads/photo.jpg");
      assert.equal(second.json().url, "/assets/uploads/photo-1.jpg");
      assert.equal(third.json().url, "/assets/uploads/photo-2.jpg");
      assert.deepEqual(readFileSync(join(root, "assets/uploads/photo.jpg")), JPG("one"));
      assert.deepEqual(readFileSync(join(root, "assets/uploads/photo-1.jpg")), JPG("two"));
    });

    test("the name can't leave assets/uploads", async () => {
      const res = await upload("../../site.png", PNG);
      assert.equal(res.status, 200);
      assert.equal(res.json().url, "/assets/uploads/site.png");
      const odd = await upload("..\\..\\x?.gif", GIF);
      assert.match(odd.json().url, /^\/assets\/uploads\/[a-z0-9-]+\.gif$/);
      const only = await upload("ăăă.webp", WEBP);
      assert.equal(only.json().url, "/assets/uploads/aaa.webp");
      const none = await upload("???.webp", WEBP);
      assert.equal(none.json().url, "/assets/uploads/image.webp");
      assert.ok(existsSync(join(root, "assets/uploads/site.png")));
      assert.ok(!existsSync(join(root, "site.png")));
    });

    test("the content must be an image: an SVG or a page under a .png name → 400; a wrong extension is fixed", async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      for (const [name, body] of [["qa.png", svg], ["x.jpg", Buffer.from("<html><script>x()</script>")], ["y.gif", Buffer.from("GIF")], ["z.webp", Buffer.from("RIFF1234WEBX")]]) {
        const res = await upload(name, body);
        assert.equal(res.status, 400, name);
        assert.equal(res.json().error, "You can only upload images (png, jpg, gif, webp, avif); this file isn't an image.", name);
      }
      assert.ok(!existsSync(join(root, "assets/uploads/qa.png")));
      // A PNG named .jpg stays a PNG (and is served as image/png); .jpeg stays .jpeg.
      assert.equal((await upload("wrong.jpg", PNG)).json().url, "/assets/uploads/wrong.png");
      assert.equal((await upload("photo.jpeg", JPG("x"))).json().url, "/assets/uploads/photo.jpeg");
      assert.equal((await upload("new.avif", AVIF)).json().url, "/assets/uploads/new.avif");
    });

    test("extensions that aren't allowed (.svg, .html, .js, none) → 400", async () => {
      for (const name of ["drawing.svg", "page.html", "code.js", "x.png.html", "no-extension", ".png", "a.php", "a.SVG"]) {
        const res = await upload(name, PNG);
        assert.equal(res.status, 400, name);
        assert.equal(res.json().error, "You can only upload images (png, jpg, gif, webp, avif).", name);
      }
      assert.ok(!readdirSync(join(root, "assets/uploads")).some((f) => /\.(svg|html|js|php)$/i.test(f)));
    });

    test("an empty file → 400; without x-blocks → 403", async () => {
      const empty = await upload("empty.png", Buffer.alloc(0));
      assert.equal(empty.status, 400);
      assert.equal(empty.json().error, "The file is empty.");
      assert.ok(!existsSync(join(root, "assets/uploads/empty.png")));
      const noHeader = await upload("none.png", PNG, { "x-blocks": undefined });
      assert.equal(noHeader.status, 403);
      const foreign = await upload("none.png", PNG, { origin: "http://evil.com" });
      assert.equal(foreign.status, 403);
      assert.ok(!existsSync(join(root, "assets/uploads/none.png")));
      assert.equal((await get("/_api/upload?name=a.png")).status, 404);
    });
  });

  test("unknown /_api routes → 404", async () => {
    for (const path of ["/_api/", "/_api/nothing", "/_api/components/x", "/_api/site/x", "/_api/zones"]) {
      assert.equal((await get(path)).status, 404, path);
    }
  });

  test("SSE /_api/events announces a change to a component", async (t) => {
    try {
      watch(root).close();
    } catch {
      t.skip("fs.watch isn't available here");
      return;
    }
    const events = [];
    let buffer = "";
    let req;
    const opened = new Promise((ok, fail) => {
      req = request(
        { host: "127.0.0.1", port, path: "/_api/events", headers: { host: `localhost:${port}` }, agent: false },
        (res) => {
          assert.equal(res.statusCode, 200);
          assert.match(res.headers["content-type"], /^text\/event-stream/);
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            // SSE messages end with an empty line; the last piece may be incomplete.
            const parts = (buffer + chunk).split("\n\n");
            buffer = parts.pop();
            for (const part of parts) {
              if (part.startsWith("retry:")) ok();
              for (const line of part.split("\n")) if (line.startsWith("data: ")) events.push(JSON.parse(line.slice(6)));
            }
          });
        },
      );
      req.on("error", fail);
      req.end();
    });
    t.after(() => req.destroy());
    await opened;

    const waitFor = (match, ms = 3000) =>
      new Promise((ok, fail) => {
        const started = Date.now();
        const timer = setInterval(() => {
          const found = events.find(match);
          if (found) {
            clearInterval(timer);
            ok(found);
          } else if (Date.now() - started > ms) {
            clearInterval(timer);
            fail(new Error(`No matching event; received: ${JSON.stringify(events)}`));
          }
        }, 20);
      });

    // We let the watcher start fully before the first write.
    await new Promise((ok) => setTimeout(ok, 100));
    writeFileSync(join(root, "components/fresh.js"), componentSource(`{ name: "Fresh", html: () => "" }`));
    const ev = await waitFor((e) => e.type === "components" && e.file === "fresh.js");
    assert.deepEqual(ev, { type: "components", file: "fresh.js" });

    writeFileSync(join(root, "pages/event.json"), "{}\n");
    await waitFor((e) => e.type === "pages" && e.file === "event.json");

    writeFileSync(join(root, "site.json"), JSON.stringify({ name: "Changed" }));
    await waitFor((e) => e.type === "site" && e.file === "site.json");
    assert.ok(!events.some((e) => String(e.file).endsWith(".tmp")));
  });
});

// editor/api.js: the server's English answers, shown in the editor's language.
describe("the server's answers in the editor (editor/api.js → serverText)", () => {
  test("each known answer is keyed by its own English text, and has its Romanian", () => {
    for (const [text, fn] of Object.entries(ANSWERS)) {
      assert.equal(fn(), text);
      assert.ok(Object.hasOwn(RO, text), text);
    }
  });

  test("in Romanian: the plain answers, the ones about a page / zone / site.json, and an unknown one as it is", () => {
    setLang("ro");
    try {
      assert.equal(serverText("The page doesn't exist."), "Pagina nu există.");
      assert.equal(serverText("The header has too many blocks nested inside each other."), "Antetul are prea multe blocuri puse unul în altul.");
      assert.equal(serverText("The site.json file is too large: it has too many blocks or settings."), "Fișierul site.json e prea mare: are prea multe blocuri sau setări.");
      assert.equal(serverText("The footer: every block must be an object { type, props }."), "Subsolul: fiecare bloc trebuie să fie un obiect { type, props }.");
      assert.equal(serverText("Something new from the server."), "Something new from the server.");
      assert.equal(serverText("toString"), "toString");
      assert.equal(serverText(undefined), "");
    } finally {
      setLang("en");
    }
    assert.equal(serverText("The page doesn't exist."), "The page doesn't exist.");
  });
});
