// server/build.js: the static export to dist/.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { buildSite } from "../server/build.js";
import { componentSource, makeProject, removeProject } from "./helpers.js";

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const block = (id, type, props = {}) => ({ id, type, props });

const FILES = {
  "site.json": { name: "Static Site", lang: "en" },
  "components/heading.js": componentSource(`{
    name: "Heading",
    props: { text: { type: "text", default: "Heading" } },
    html: (p) => html\`<h1>\${p.text}</h1>\`,
  }`),
  "components/button.js": componentSource(`{
    name: "Button",
    html: () => html\`<button>Press</button>\`,
    js(el) {},
  }`),
  "components/form.js": componentSource(`{ name: "Form", html: () => html\`<form class="form"></form>\` }`),
  "components/form.server.js": "// SECRET-SERVER\nexport default { \"POST /submit\": () => ({ ok: true }) };\n",
  "components/login.js": componentSource(`{ name: "Login", needsServer: true, html: () => html\`<form class="login"></form>\` }`),
  "components/box.js": componentSource(`{ name: "Box", slots: { content: "Content" }, html: (p, ctx) => html\`<div>\${ctx.slot("content")}</div>\` }`),
  "components/menu.js": componentSource(`{
    name: "Menu",
    props: { links: { type: "list", fields: { link: { type: "link" } } } },
    html: (p, ctx) => html\`<nav>\${p.links.filter((l) => ctx.reachable(l.link)).map((l) => html\`<a href="\${url(l.link)}">go</a>\`)}</nav>\`,
  }`),
  "pages/index.json": { title: "Home", blocks: [block("b1", "heading", { text: "HOME-STATIC" }), block("b2", "button")] },
  "pages/about.json": { title: "About", blocks: [block("b1", "heading", { text: "ABOUT-STATIC" })] },
  "pages/404.json": { title: "Missing", blocks: [block("b1", "heading", { text: "MISSING-STATIC" })] },
  "pages/members.json": { title: "Members", access: "members", blocks: [block("b1", "heading", { text: "MEMBERS-SECRET" })] },
  "pages/contact.json": {
    title: "Contact",
    blocks: [{ id: "c1", type: "box", slots: { content: [block("f1", "form")] } }],
  },
  "pages/login.json": { title: "Log in", blocks: [block("l1", "login")] },
  "pages/simple.json": { title: "Simple", zones: false, blocks: [block("b1", "heading", { text: "SIMPLE-STATIC" })] },
  "pages/_header.json": {
    blocks: [block("a1", "heading", { text: "HEADER-STATIC" }), block("a2", "menu", { links: [{ link: "/about" }, { link: "/members" }, { link: "/members/" }] })],
  },
  "assets/photo.png": PNG,
  "assets/.secret": "SECRET\n",
  "assets/sub/.hidden": "SECRET\n",
  "assets/sub/visible.txt": "visible\n",
  "data/_auth/users.json": "[]\n",
};

// Every file in a folder, with relative paths.
function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
  );
}

describe("buildSite", () => {
  let root;
  let result;
  let dist;

  before(async () => {
    root = makeProject(FILES);
    writeFileSync(join(root, "dist-marker"), "");
    result = await buildSite({ root, quiet: true });
    dist = join(root, "dist");
  });
  after(() => removeProject(root));

  const read = (rel) => readFileSync(join(dist, rel), "utf8");

  test("writes index.html, SLUG/index.html and 404.html", () => {
    assert.equal(result.outDir, dist);
    for (const file of ["index.html", "about/index.html", "404.html", "contact/index.html", "login/index.html", "simple/index.html"]) {
      assert.ok(existsSync(join(dist, file)), file);
      assert.ok(result.written.includes(file), file);
    }
    assert.ok(read("index.html").includes("<h1>HOME-STATIC</h1>"));
    assert.ok(read("about/index.html").includes("<h1>ABOUT-STATIC</h1>"));
    assert.ok(read("404.html").includes("<h1>MISSING-STATIC</h1>"));
    assert.ok(!existsSync(join(dist, "404/index.html")));
    assert.ok(!existsSync(join(dist, "index/index.html")));
  });

  test("the pages are rendered in static mode, with the shared zones", () => {
    const index = read("index.html");
    assert.ok(index.startsWith("<!doctype html>"));
    assert.ok(index.includes("<title>Home · Static Site</title>"));
    assert.ok(index.indexOf("HEADER-STATIC") < index.indexOf("HOME-STATIC"));
    assert.ok(!index.includes("data-slot"));
    const data = JSON.parse(index.match(/id="b-data">([^]*?)<\/script>/)[1]);
    assert.equal(data.mode, "static");
    assert.ok(!("user" in data));
    assert.ok(index.includes('<script type="module" src="/core/runtime.js"></script>'));
    assert.ok(!read("about/index.html").includes("b-data"));
    const simple = read("simple/index.html");
    assert.ok(simple.includes("SIMPLE-STATIC"));
    assert.ok(!simple.includes("HEADER-STATIC"));
  });

  test("members-only pages aren't exported and produce a warning", () => {
    assert.ok(!existsSync(join(dist, "members")));
    assert.ok(!walk(dist).some((f) => readFileSync(join(dist, f)).includes("MEMBERS-SECRET")));
    assert.ok(result.warnings.some((w) => w.includes("Page “Members” (/members)") && w.includes("for members only")));
  });

  test("a menu leaves out the links to the pages that aren't exported (ctx.reachable), on every page", () => {
    for (const file of ["index.html", "about/index.html", "404.html"]) {
      const text = read(file);
      assert.ok(text.includes('<nav><a href="/about">go</a></nav>'), file);
      assert.ok(!text.includes('href="/members'), file);
    }
    assert.ok(!result.warnings.some((w) => w.includes("“/members”") && w.includes("link")), result.warnings.join("\n"));
  });

  test("components with a .server.js or needsServer: true produce warnings, with the name from the editor", () => {
    const contact = result.warnings.filter((w) => w.includes("Page “Contact” (/contact)"));
    assert.equal(contact.length, 1);
    assert.ok(contact[0].includes("“Form”"));
    assert.ok(contact[0].includes("needs the server"));
    const login = result.warnings.filter((w) => w.includes("Page “Log in” (/login)"));
    assert.equal(login.length, 1);
    assert.ok(login[0].includes("“Login”"));
    for (const path of ["/", "/about", "/404", "/simple"]) {
      assert.ok(!result.warnings.some((w) => w.includes(`(${path})`)), path);
    }
    assert.equal(result.warnings.length, 3);
    assert.deepEqual(result.errors, []);
  });

  test("*.server.js files aren't copied; the browser components are", () => {
    const files = walk(dist);
    assert.ok(!files.some((f) => f.endsWith(".server.js")));
    assert.ok(!files.some((f) => readFileSync(join(dist, f)).includes("SECRET-SERVER")));
    for (const id of ["heading", "button", "form", "login", "box", "menu"]) {
      assert.equal(read(`components/${id}.js`), readFileSync(join(root, `components/${id}.js`), "utf8"));
    }
  });

  test("core/ and assets/ are copied (without hidden files), data/ isn't", () => {
    for (const file of readdirSync(join(root, "core"))) {
      assert.ok(lstatSync(join(dist, "core", file)).isFile(), file);
      assert.equal(read(`core/${file}`), readFileSync(join(root, "core", file), "utf8"));
    }
    assert.deepEqual(readFileSync(join(dist, "assets/photo.png")), PNG);
    assert.equal(read("assets/sub/visible.txt"), "visible\n");
    assert.ok(!existsSync(join(dist, "assets/.secret")));
    assert.ok(!existsSync(join(dist, "assets/sub/.hidden")));
    assert.ok(!existsSync(join(dist, "data")));
    assert.ok(!existsSync(join(dist, "site.json")));
    assert.ok(!existsSync(join(dist, "pages")));
  });

  test("a new export removes the old files from dist", async () => {
    writeFileSync(join(dist, "old.html"), "old");
    await buildSite({ root, quiet: true });
    assert.ok(!existsSync(join(dist, "old.html")));
    assert.ok(existsSync(join(dist, "index.html")));
  });

  test("another export folder, inside the project", async () => {
    const out = join(root, "export", "site");
    const res = await buildSite({ root, out, quiet: true });
    assert.equal(res.outDir, out);
    assert.ok(existsSync(join(out, "index.html")));
  });

  test("refuses an export folder outside the project", async () => {
    const outside = mkdtempSync(join(tmpdir(), "blocks-outside-"));
    writeFileSync(join(outside, "keep.txt"), "don't delete");
    try {
      for (const out of [outside, join(root, ".."), root, join(root, "..", "other-project"), `${root}-dist`]) {
        await assert.rejects(buildSite({ root, out, quiet: true }), /inside the project/, out);
      }
      assert.ok(existsSync(join(outside, "keep.txt")));
      assert.ok(existsSync(join(root, "pages/index.json")));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("refuses to delete the project's folders and files", async () => {
    // With other letters too: on macOS and Windows "Pages" is the very same pages/ folder.
    for (const name of ["pages", "components", "core", "assets", "data", "site.json", "dist-marker", join("pages", "sub"), "Pages", "CORE", "Assets", join("Data", "x")]) {
      await assert.rejects(buildSite({ root, out: join(root, name), quiet: true }), Error, name);
    }
    assert.ok(existsSync(join(root, "pages/index.json")));
    assert.ok(existsSync(join(root, "components/heading.js")));
    assert.ok(existsSync(join(root, "core/render.js")));
    assert.ok(existsSync(join(root, "assets/photo.png")));
    assert.ok(existsSync(join(root, "data/_auth/users.json")));
    assert.ok(existsSync(join(root, "site.json")));
    assert.ok(existsSync(join(root, "dist-marker")));
  });
});

describe("buildSite: errors, links to what's missing, --base", () => {
  let root;
  let result;
  let dist;
  const FILES_WITH_ERRORS = {
    "site.json": { name: "Café" },
    "components/heading.js": componentSource(`{ name: "Heading", props: { text: { type: "text" } }, html: (p) => html\`<h1>\${p.text}</h1>\` }`),
    "components/link.js": componentSource(`{
      name: "Link",
      props: { to: { type: "link" } },
      html: (p) => html\`<a href="\${url(p.to)}">to</a><img src="/assets/photo.png" alt="">\`,
      css: ".link { background: url(/assets/photo.png); }",
    }`),
    "components/price.js": componentSource(`{ name: "Price", html: (p) => html\`<p>\${p.missing.x}</p>\` }`),
    // A syntax error on line 4.
    "components/broken.js": 'import { html } from "../core/html.js";\n\nexport default {\n  html() { const y = ; },\n};\n',
    "pages/index.json": {
      title: "Home",
      blocks: [
        block("b1", "heading", { text: "HOME" }),
        block("b2", "link", { to: "/account" }),
        block("b3", "link", { to: "/does-not-exist" }),
        block("b4", "link", { to: "/about" }),
      ],
    },
    "pages/about.json": { title: "About", blocks: [block("b1", "heading", { text: "ABOUT" })] },
    "pages/offer.json": { title: "Offer", blocks: [block("o1", "price"), block("o2", "gallerry"), block("o3", "broken")] },
    "pages/broken.json": '{ "title": "Broken", "blocks": [',
    "pages/account.json": { title: "My account", access: "members", blocks: [] },
    "pages/_footer.json": { blocks: [block("s1", "not-a-component")] },
    "assets/photo.png": PNG,
  };

  before(async () => {
    root = makeProject(FILES_WITH_ERRORS);
    result = await buildSite({ root, quiet: true });
    dist = join(root, "dist");
  });
  after(() => removeProject(root));

  test("the pages and blocks missing from the export are errors, with a name and a reason", () => {
    const { errors } = result;
    assert.ok(errors.some((e) => e.includes("pages/broken.json isn't valid JSON")), errors.join("\n"));
    assert.ok(errors.some((e) => e.includes("components/broken.js, line 4") && e.includes("const y = ;")), errors.join("\n"));
    assert.ok(errors.some((e) => e.includes("On page “Offer” (/offer), the “Price” block failed")));
    assert.ok(errors.some((e) => e.includes("the component “gallerry” doesn't exist")));
    assert.ok(errors.some((e) => e.includes("the component “broken” doesn't exist (or couldn't be loaded)")));
    // The broken block in the footer shows up once, not on every page.
    assert.equal(errors.filter((e) => e.includes("In the footer, the component “not-a-component”")).length, 1);
    assert.equal(errors.length, 6, errors.join("\n"));
    // The rest of the site is exported.
    assert.ok(existsSync(join(dist, "index.html")));
    assert.ok(existsSync(join(dist, "offer/index.html")));
    assert.ok(!existsSync(join(dist, "broken")));
  });

  test("a component that doesn't load isn't copied to dist/components", () => {
    assert.ok(!existsSync(join(dist, "components/broken.js")));
    assert.ok(existsSync(join(dist, "components/heading.js")));
  });

  test("links to pages that aren't in the export produce warnings", () => {
    const members = result.warnings.filter((w) => w.includes("“/account”"));
    assert.equal(members.length, 1);
    assert.ok(members[0].includes("Home") && members[0].includes("for members only"));
    assert.ok(result.warnings.some((w) => w.includes("“/does-not-exist”") && w.includes("doesn't exist in the export")));
    // What exists (pages, images, core/) produces no warnings.
    for (const ok of ["“/about”", "“/assets/photo.png”", "“/core/"]) assert.ok(!result.warnings.some((w) => w.includes(ok)), ok);
  });

  test("--base /project/: the addresses in the pages (and in the CSS) start with /project/", async () => {
    const out = join(root, "export-base");
    const res = await buildSite({ root, out, base: "/project/", quiet: true });
    const index = readFileSync(join(out, "index.html"), "utf8");
    assert.ok(index.includes('href="/project/core/base.css"'));
    assert.ok(index.includes('href="/project/about"'));
    assert.ok(index.includes('src="/project/assets/photo.png"'));
    assert.ok(index.includes("url(/project/assets/photo.png)"));
    assert.ok(!/(href|src)="\/(?!project\/)/.test(index), "no address left at the root");
    assert.deepEqual(res.errors, result.errors);
    for (const base of ["../x", "/a b/", "/x/../y/"]) {
      await assert.rejects(buildSite({ root, out, base, quiet: true }), /The base/, base);
    }
  });
});

describe("buildSite: the safety rules (Content-Security-Policy)", () => {
  let root;
  before(() => {
    root = makeProject({
      "site.json": { name: "Site", lang: "ro" },
      "components/heading.js": componentSource(`{ name: "Heading", props: { text: { type: "text" } }, html: (p) => html\`<h1>\${p.text}</h1>\` }`),
      "components/embed.js": componentSource(`{ name: "Embed", props: { code: { type: "html" } }, html: (p) => raw(p.code) }`),
      "pages/index.json": { title: "Home", blocks: [block("b1", "heading", { text: "HOME" })] },
      "pages/widget.json": { title: "Bookings", blocks: [block("w1", "embed", { code: "<script>book()</script>" })] },
      "pages/reviews.json": { title: "Reviews", blocks: [block("w1", "embed", { code: "<div data-reviews></div>" })] },
      "pages/analytics.json": { title: "Analytics", head: ["<script>count()</script>"], blocks: [] },
    });
  });
  after(() => removeProject(root));

  test("every page has the rules as a <meta> (without frame-ancestors); the ones with custom code are named, with the reason", async (t) => {
    const log = t.mock.method(console, "log", () => {});
    const result = await buildSite({ root });
    const read = (rel) => readFileSync(join(root, "dist", rel), "utf8");
    const meta = (text) => text.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)[1].replace(/&#39;/g, "'");
    const index = read("index.html");
    assert.ok(index.startsWith('<!doctype html>\n<html lang="ro">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy"'));
    assert.match(meta(index), /^default-src 'self'; script-src 'self'; /);
    assert.ok(!meta(index).includes("frame-ancestors"));
    assert.match(meta(read("widget/index.html")), /script-src 'self' 'unsafe-inline' https:; /);
    assert.deepEqual(result.relaxed, [
      "Page “Analytics” (/analytics) has custom code (a script in “head”), so the safety rules are relaxed on it.",
      "Pages “Reviews” (/reviews), “Bookings” (/widget) have custom code (the “Embed” block), so the safety rules are relaxed on them.",
    ]);
    const printed = log.mock.calls.map((c) => c.arguments.join(" ")).join("\n");
    assert.ok(printed.includes("Safety:\n    - Page “Analytics” (/analytics) has custom code"), printed);
  });

  test("a script in “head” from site.json: every page, on a single line", async () => {
    writeFileSync(join(root, "site.json"), JSON.stringify({ name: "Site", head: ["<script>x()</script>"] }));
    const { relaxed } = await buildSite({ root, quiet: true });
    assert.deepEqual(relaxed, [
      "All pages have custom code (a script in “head”), so the safety rules are relaxed on them.",
      "Pages “Reviews” (/reviews), “Bookings” (/widget) have custom code (the “Embed” block), so the safety rules are relaxed on them.",
    ]);
  });
});
