// server/project.js: loading components (with the errors explained), wrong names, the template.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { componentTemplate, createProject, DEFAULT_SITE } from "../server/project.js";
import { renderParts } from "../core/render.js";
import { componentSource, makeProject, PROJECT_ROOT, removeProject } from "./helpers.js";

describe("createProject: components and pages with problems", () => {
  let root;
  let project;
  const warnings = [];
  const errors = [];

  before(() => {
    root = makeProject({
      "components/good.js": componentSource(`{ name: "Good", html: () => html\`<p>ok</p>\` }`),
      // A syntax error on line 5.
      "components/broken.js": 'import { html } from "../core/html.js";\n\nexport default {\n  name: "Broken",\n  html(p) { const y = ; },\n};\n',
      "components/at-start.js": 'export default {\n  name: "X",\n  html: () => "",\n};\nnoSuchThing.x = 1;\n',
      "components/no-html.js": "export default { name: 'No html' };\n",
      "components/schema.js": componentSource(`{ name: "Schema", Props: {}, html: () => "" }`),
      "components/routes.server.js": 'export default {\n  "post /x": () => 1,\n  "GET /y": 5,\n  "POST /good": () => ({ ok: true }),\n};\n',
      "components/broken-routes.server.js": "export default { 'GET /x': () => { ;\n",
      "components/ProductPrice.js": componentSource(`{ name: "Wrong name", html: () => "" }`),
      "components/product_price.js": componentSource(`{ name: "Wrong name", html: () => "" }`),
      "pages/index.json": { title: "Home", blocks: [] },
      "pages/About.json": { title: "Wrong name" },
      "pages/broken.json": '{ "title": "x", ',
    });
    project = createProject(root, { warn: (m) => warnings.push(m), error: (m) => errors.push(m) });
  });
  after(() => removeProject(root));

  test("a syntax error is reported with the file, the line and the code, once per version", async () => {
    const components = await project.loadComponents();
    assert.deepEqual(Object.keys(components).sort(), ["good", "schema"]);
    const syntax = errors.filter((e) => e.includes("components/broken.js"));
    assert.equal(syntax.length, 1, errors.join("\n"));
    assert.match(syntax[0], /^Couldn't load components\/broken\.js, line 5: Unexpected token ';'\n {4} {2}html\(p\) \{ const y = ; \},\n {4} +\^/);
    assert.ok(errors.some((e) => e.startsWith("Couldn't load components/at-start.js, line 5:") && e.includes("noSuchThing")));
    assert.ok(errors.some((e) => e === "components/no-html.js doesn't export a component with html(p, ctx)."));
    // On the second read (the file unchanged) it isn't repeated.
    const before = errors.length;
    await project.loadComponents();
    assert.equal(errors.length, before);
    // The fixed file loads; broken again, it's reported again.
    const file = join(root, "components/broken.js");
    writeFileSync(file, componentSource(`{ name: "Fixed", html: () => "" }`));
    utimesSync(file, new Date(), new Date(Date.now() + 2000));
    assert.ok((await project.loadComponents()).broken);
  });

  test("componentErrors: why each component doesn't load, for the editor", async () => {
    const failures = await project.componentErrors();
    assert.ok(failures["at-start"].startsWith("components/at-start.js, line 5:"));
    assert.equal(failures["no-html"], "components/no-html.js doesn't export a component with html(p, ctx).");
    assert.ok(!("good" in failures));
    const list = await project.listComponents();
    assert.deepEqual(list.find((c) => c.id === "routes"), undefined); // only <id>.js are components
    assert.deepEqual(list.find((c) => c.id === "good"), { id: "good", hasServer: false });
  });

  test("warnings: a wrong schema and files with a wrong name, once", async () => {
    await project.loadComponents();
    await project.listPages();
    assert.ok(warnings.includes("components/schema.js: the key “Props” is ignored; write “props”."), warnings.join("\n"));
    for (const name of ["components/ProductPrice.js", "components/product_price.js", "pages/About.json"]) {
      assert.equal(warnings.filter((w) => w.startsWith(`Skipped ${name}:`)).length, 1, name);
    }
    assert.ok(!warnings.some((w) => w.includes("routes.server.js") && w.startsWith("Skipped")));
  });

  test("a page with broken JSON is left out of the list and reported with the file name", async () => {
    const pages = await project.listPages();
    assert.deepEqual(pages, [{ slug: "index", title: "Home", path: "/", access: "public", types: [] }]);
    assert.ok(errors.some((e) => e.startsWith("The file pages/broken.json isn't valid JSON:") && e.endsWith("The page is skipped until you fix it.")));
    await assert.rejects(project.readPage("broken"), (err) => err.file === "pages/broken.json");
  });

  test("a broken zone is missing from readZones (and reported); the rest works", async () => {
    writeFileSync(join(root, "pages/_header.json"), '{"blocks": [,]}');
    writeFileSync(join(root, "pages/_footer.json"), JSON.stringify({ blocks: [{ id: "s", type: "good" }] }));
    try {
      const zones = await project.readZones();
      assert.deepEqual(zones.header, { blocks: [] });
      assert.equal(zones.footer.blocks.length, 1);
      assert.ok(errors.some((e) => e.includes("pages/_header.json isn't valid JSON") && e.includes("without the header")));
    } finally {
      rmSync(join(root, "pages/_header.json"));
      rmSync(join(root, "pages/_footer.json"));
    }
  });

  test("the site settings: the defaults, merged with site.json (the theme too)", async () => {
    assert.deepEqual(DEFAULT_SITE, { name: "My site", lang: "en", theme: {}, loginPage: "/login" });
    assert.deepEqual(await project.readSite(), DEFAULT_SITE);
    writeFileSync(join(root, "site.json"), JSON.stringify({ name: "Luna Café", lang: "ro", theme: { primary: "#123456" } }));
    try {
      assert.deepEqual(await project.readSite(), { name: "Luna Café", lang: "ro", theme: { primary: "#123456" }, loginPage: "/login" });
    } finally {
      rmSync(join(root, "site.json"));
    }
  });

  test(".server.js: badly written routes are reported; a broken file has its name in the error", async () => {
    const routes = await project.loadServerRoutes("routes");
    assert.equal(typeof routes["POST /good"], "function");
    assert.ok(warnings.some((w) => w.startsWith("components/routes.server.js: the route “post /x” will never answer")));
    assert.ok(warnings.some((w) => w === "components/routes.server.js: the route “GET /y” must be a function: (request, ctx) => { ... }."));
    const before = errors.length;
    for (let i = 0; i < 2; i++) {
      await assert.rejects(project.loadServerRoutes("broken-routes"), (err) => {
        assert.ok(err.message.startsWith("components/broken-routes.server.js, line"), err.message);
        assert.equal(err.reported, true); // the server doesn't write it once more
        return true;
      });
    }
    assert.equal(errors.length, before + 1);
    assert.equal(await project.loadServerRoutes("does-not-exist"), null);
  });
});

describe("componentTemplate (node blocks.js component)", () => {
  test("the template is a good component: b-block, paragraphs for longtext, CSS with .c-<id>", async () => {
    const root = makeProject({ "components/product-price.js": componentTemplate("product-price") });
    try {
      const components = await createProject(root, { warn: assert.fail, error: assert.fail }).loadComponents();
      const comp = components["product-price"];
      assert.equal(comp.name, "Product price");
      assert.equal(comp.category, "My blocks");
      assert.equal(comp.icon, "block");
      assert.equal(comp.props.title.format, true);
      assert.ok(comp.css.includes(".c-product-price h2"));
      assert.ok(comp.css.includes("var(--primary)"));
      const page = { blocks: [{ id: "b", type: "product-price", props: { title: "A *good* price", text: "The first paragraph.\n\nThe second.\nA new line." } }] };
      const { body } = renderParts({ page, components, mode: "site" });
      assert.ok(body.includes('<div class="b-block"><div class="b-container">'));
      assert.ok(body.includes("<h2>A <em>good</em> price</h2>"));
      assert.ok(body.includes("<p>The first paragraph.</p><p>The second.<br>A new line.</p>"));
    } finally {
      removeProject(root);
    }
  });

  // The README shows the template right after the command, so the docs and the code never drift apart.
  test("the README shows exactly the file the command creates", () => {
    const readme = readFileSync(join(PROJECT_ROOT, "README.md"), "utf8");
    const shown = readme.split("node blocks.js component product-price")[1]?.match(/```js\n([^]*?)```/)?.[1];
    assert.equal(shown, componentTemplate("product-price"));
  });
});
