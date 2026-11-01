// server/csp.js: the pages' safety rules. Strict by default, relaxed only on pages with custom
// code (a filled-in "html" field, a script in "head", "scripts" from another site).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { html, raw } from "../core/html.js";
import { contentSecurityPolicy, foreignCode } from "../server/csp.js";

const STRICT =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; " +
  "font-src 'self' data:; media-src 'self' https:; frame-src https://www.youtube-nocookie.com https://www.google.com; " +
  "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

// What changes on a page with custom code; the rest stays strict.
const RELAXED = {
  "script-src": "'self' 'unsafe-inline' https:",
  "style-src": "'self' 'unsafe-inline' https:",
  "font-src": "'self' data: https:",
  "frame-src": "https:",
  "connect-src": "'self' https:",
  "form-action": "'self' https:",
};

// "a x; b y" → { a: "x", b: "y" }
const rules = (policy) => Object.fromEntries(policy.split("; ").map((r) => [r.slice(0, r.indexOf(" ")), r.slice(r.indexOf(" ") + 1)]));

// Test components, like the bundled ones: an "html" field shown with raw(), plain text, an area, a canvas.
const components = {
  embed: { name: "Embed", props: { code: { type: "html" } }, html: (p) => raw(p.code) },
  text: { name: "Text", props: { text: { type: "longtext" } }, html: (p) => html`<p>${p.text}</p>` },
  video: { name: "Video", props: { link: { type: "link" } }, html: () => "" },
  canvas: { name: "Free canvas", slots: { content: "Content" }, html: (p, ctx) => ctx.slot("content", { free: true }) },
  // An "html" field in a list, and one with a default value.
  widgets: { name: "Widgets", props: { list: { type: "list", fields: { code: { type: "html" } } } }, html: () => "" },
  "with-code": { name: "With code", props: { code: { type: "html", default: "<script>x()</script>" } }, html: () => "" },
  box: { name: "Box", slots: { content: "Content" }, html: (p, ctx) => ctx.slot("content") },
};

const embed = (props = { code: "<script>widget()</script>" }) => ({ id: "c", type: "embed", props });
const pageOf = (blocks, extra = {}) => ({ title: "P", blocks, ...extra });
const csp = (page, site = {}, zones = {}, options) => contentSecurityPolicy({ page, site, zones, components }, options);

describe("contentSecurityPolicy", () => {
  test("strict by default, exactly the rules asked for", () => {
    assert.equal(contentSecurityPolicy(), STRICT);
    assert.equal(csp(pageOf([{ id: "t", type: "text", props: {} }, { id: "v", type: "video", props: {} }])), STRICT);
  });

  test("a filled-in Embed block (anywhere on the page) relaxes it; empty or only spaces doesn't", () => {
    const relaxed = { ...rules(STRICT), ...RELAXED };
    assert.deepEqual(rules(csp(pageOf([embed()]))), relaxed);
    assert.deepEqual(rules(csp(pageOf([{ id: "s", type: "box", slots: { content: [{ id: "k", type: "box", slots: { content: [embed()] } }] } }]))), relaxed);
    assert.deepEqual(rules(csp(pageOf([{ id: "p", type: "canvas", slots: { content: [{ ...embed(), placement: { x: 1 } }] } }]))), relaxed);
    assert.equal(csp(pageOf([embed({ code: "" }), embed({ code: "  \n " }), embed({ code: { a: 1 } }), embed({})])), STRICT);
  });

  test("the field types come from the component's schema: lists, defaults; missing components don't count", () => {
    assert.notEqual(csp(pageOf([{ id: "w", type: "widgets", props: { list: [{ code: "" }, { code: "<iframe></iframe>" }] } }])), STRICT);
    assert.equal(csp(pageOf([{ id: "w", type: "widgets", props: { list: [{ code: "" }, "not an object", null] } }])), STRICT);
    assert.notEqual(csp(pageOf([{ id: "i", type: "with-code" }])), STRICT);
    assert.equal(csp(pageOf([{ id: "l", type: "does-not-exist", props: { code: "<script>x()</script>" } }])), STRICT);
    // A "text" field with a <script> is text: escaped when shown, so the page stays strict.
    assert.equal(csp(pageOf([{ id: "t", type: "text", props: { text: "<script>x()</script>" } }])), STRICT);
  });

  test("the shared zones count, if the page shows them", () => {
    const zones = { header: { blocks: [embed()] } };
    assert.notEqual(csp(pageOf([]), {}, zones), STRICT);
    assert.notEqual(csp(pageOf([]), {}, { footer: { blocks: [embed()] } }), STRICT);
    assert.equal(csp(pageOf([], { zones: false }), {}, zones), STRICT);
  });

  test("“head” with a script (from site.json or from the page) relaxes it; other tags don't", () => {
    assert.notEqual(csp(pageOf([]), { head: ["<script>document.documentElement.classList.add('js')</script>"] }), STRICT);
    assert.notEqual(csp(pageOf([], { head: ['<SCRIPT src="/a.js"></SCRIPT>'] })), STRICT);
    assert.notEqual(csp(pageOf([]), { head: ['<link rel="stylesheet" href="/a.css" onload="this.media=\'all\'">'] }), STRICT);
    assert.notEqual(csp(pageOf([]), { head: ['<script type="module" src="/a.js"></script>'] }), STRICT);
    assert.equal(csp(pageOf([]), { head: ['<link rel="apple-touch-icon" href="/a.png">', '<meta name="theme-color" content="#fff">'] }), STRICT);
    // JSON-LD data (for search engines) doesn't run: the page stays strict.
    assert.equal(csp(pageOf([]), { head: ['<script type="application/ld+json">{"@type":"Cafe"}</script>', "<script type=application/ld+json>{}</script>"] }), STRICT);
    assert.notEqual(csp(pageOf([]), { head: ['<script type="application/ld+json">{}</script><script>x()</script>'] }), STRICT);
    assert.equal(csp(pageOf([]), { head: ['<script/type="application/ld+json">{}</script>'] }), STRICT);
  });

  test("“head”: scripts read the way the browser reads them (“data-type” isn't “type”, attributes glued to quotes)", () => {
    for (const code of [
      '<script data-type="json">x()</script>',
      '<script data-type="json" type="module" src="/a.js"></script>',
      '<link rel="stylesheet" href="/a.css" media="print"onload="this.media=\'all\'">',
      '<link rel="stylesheet" href="/a.css"/onload="x()">',
    ]) {
      assert.notEqual(csp(pageOf([]), { head: [code] }), STRICT, code);
    }
    // A word in the text that merely starts with "on" isn't an attribute.
    assert.equal(csp(pageOf([]), { head: ['<meta name="description" content="A café online, open non-stop">'] }), STRICT);
  });

  test("“scripts” from another site relax it; the site's own don't", () => {
    for (const src of ["/assets/js/site.js", "assets/js/site.js", "/a.js?v=2"]) assert.equal(csp(pageOf([]), { scripts: [src] }), STRICT, src);
    for (const src of ["https://cdn.example.com/a.js", "//cdn.example.com/a.js", "/\\cdn.example.com/a.js", "http://cdn.example.com/a.js"]) {
      assert.notEqual(csp(pageOf([]), { scripts: [src] }), STRICT, src);
    }
    // The page's list replaces the site's.
    assert.equal(csp(pageOf([], { scripts: ["/b.js"] }), { scripts: ["https://cdn.example.com/a.js"] }), STRICT);
  });

  test("“styles” from another site: only that site for styles, and https fonts; scripts stay strict", () => {
    const r = rules(csp(pageOf([]), { styles: ["/assets/a.css", "https://fonts.example.com/css?family=X", "//fonts.example.com/b.css"] }));
    assert.equal(r["style-src"], "'self' 'unsafe-inline' https://fonts.example.com");
    assert.equal(r["font-src"], "'self' data: https:");
    assert.equal(r["script-src"], "'self'");
    // An address that would add a new rule (";") never reaches the policy.
    const bad = csp(pageOf([]), { styles: ["https://bad.com;script-src *;/a.css", "https://a b.com/x.css", "https://x'y.com/a.css"] });
    assert.equal(bad, STRICT);
  });

  test("meta: without frame-ancestors (the browser ignores it in a <meta>)", () => {
    assert.equal(csp(pageOf([]), {}, {}, { meta: true }), STRICT.replace("; frame-ancestors 'self'", ""));
    assert.ok(!csp(pageOf([embed()]), {}, {}, { meta: true }).includes("frame-ancestors"));
  });

  test("broken data doesn't throw", () => {
    for (const page of [undefined, null, {}, { blocks: "x" }, { blocks: [null, 5, { type: 3 }] }, { head: "x", scripts: {} }]) {
      assert.equal(contentSecurityPolicy({ page, site: null, zones: null, components }), STRICT);
    }
  });
});

describe("foreignCode", () => {
  test("the reasons, in plain words, once each", () => {
    const site = { head: ["<script>x()</script>"], scripts: ["https://cdn.example.com/a.js", "https://cdn.example.com/b.js"] };
    const zones = { header: { blocks: [embed()] }, footer: { blocks: [embed()] } };
    assert.deepEqual(foreignCode({ page: pageOf([embed(), embed(), { id: "w", type: "widgets", props: { list: [{ code: "<b>x</b>" }] } }]), site, zones, components }), [
      "the “Embed” block in the header",
      "the “Embed” block",
      "the “Widgets” block",
      "the “Embed” block in the footer",
      "a script in “head”",
      "a script from cdn.example.com",
    ]);
    assert.deepEqual(foreignCode({ page: pageOf([]), components }), []);
    assert.deepEqual(foreignCode(), []);
  });
});
