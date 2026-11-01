// core/render.js: the site's styles and scripts, the title, the icon and ctx.path.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { html } from "../core/html.js";
import { headExtras, renderPage, renderParts, siteFiles } from "../core/render.js";

const components = {
  path: { name: "Path", html: (p, ctx) => html`<p>${ctx.path ?? "nothing"}</p>` },
};
const page = { title: "About", blocks: [{ id: "b1", type: "path" }] };

describe("styles and scripts", () => {
  test("the site's list, or the page's instead of it", () => {
    const site = { styles: ["/assets/a.css"], scripts: ["/assets/a.js"] };
    assert.deepEqual(siteFiles({}, site, "styles"), ["/assets/a.css"]);
    assert.deepEqual(siteFiles({ styles: ["/assets/b.css"] }, site, "styles"), ["/assets/b.css"]);
    assert.deepEqual(siteFiles({ styles: [] }, site, "styles"), []);
    assert.deepEqual(siteFiles({}, {}, "styles"), []);
  });

  test("dangerous or empty addresses are taken out", () => {
    const site = { styles: ["javascript:alert(1)", "", null, "/assets/ok.css"] };
    assert.deepEqual(siteFiles({}, site, "styles"), ["/assets/ok.css"]);
  });

  test("they show on the page: the CSS after base.css, the JS at the end", () => {
    const out = renderPage({ page, site: { styles: ["/assets/a.css"], scripts: ["/assets/a.js"] }, components });
    const base = out.indexOf("/core/base.css");
    const css = out.indexOf('<link rel="stylesheet" href="/assets/a.css">');
    assert.ok(base > 0 && css > base);
    assert.ok(out.indexOf('<script src="/assets/a.js"></script>') > out.indexOf("</main>"));
  });

  test("a design of its own can do without base.css, but keeps the essential rule", () => {
    const out = renderPage({ page, site: { blocksStyles: false }, components });
    assert.ok(!out.includes("/core/base.css"));
    assert.ok(out.includes("[data-c],.b-slot{display:contents}"));
  });

  test("quotes in the addresses are escaped", () => {
    const out = renderPage({ page, site: { styles: ['/a.css" onload="x'] }, components });
    assert.ok(!out.includes('onload="x"'));
  });
});

describe("head", () => {
  test("the site's and the page's, in order, before the styles", () => {
    const site = { head: ['<link rel="apple-touch-icon" href="/a.png">', "<script>document.documentElement.classList.add('js')</script>"] };
    const own = { ...page, head: ['<meta name="robots" content="noindex">'] };
    assert.deepEqual(headExtras(own, site), [...site.head, ...own.head]);
    assert.deepEqual(headExtras({}, {}), []);
    const out = renderPage({ page: own, site: { ...site, styles: ["/s.css"] }, components });
    const apple = out.indexOf("apple-touch-icon");
    assert.ok(apple > 0 && apple < out.indexOf("/s.css"));
    assert.ok(out.includes("classList.add('js')") && out.includes('name="robots"'));
    assert.ok(!renderParts({ page: own, site, components }).body.includes("apple-touch-icon"));
  });
});

describe("title, icon, path", () => {
  test("the default title, with the site's separator, or windowTitle", () => {
    assert.match(renderPage({ page, site: { name: "Site" }, components }), /<title>About · Site<\/title>/);
    assert.match(renderPage({ page, site: { name: "Site", titleSeparator: " – " }, components }), /<title>About – Site<\/title>/);
    const own = { ...page, windowTitle: "Site – a smile" };
    assert.match(renderPage({ page: own, site: { name: "Site" }, components }), /<title>Site – a smile<\/title>/);
  });

  test("the site's icon", () => {
    assert.ok(renderPage({ page, site: { favicon: "/assets/i.png" }, components }).includes('<link rel="icon" href="/assets/i.png">'));
    assert.ok(renderPage({ page, site: {}, components }).includes('<link rel="icon" href="data:,">'));
  });

  test("ctx.path is the page's address, and main is the target of “Skip to content”", () => {
    const { body } = renderParts({ page, components, path: "/about" });
    assert.ok(body.includes("<p>/about</p>"));
    assert.ok(body.includes('<main class="b-page" id="content">'));
    assert.ok(renderParts({ page, components }).body.includes("<p>nothing</p>"));
  });
});
