// The project's own site, the Luna Café demo (pages/ and site.json): every page renders with no errors
// in every mode, with the shared header and footer; the files have what the editor needs; every block
// uses only the settings, areas and choices its component knows; every link inside the site points to a
// page and every image to a file; and the project's old name doesn't appear in the code and the docs.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createProject, slugForPath } from "../server/project.js";
import { eachBlock, renderPage } from "../core/render.js";
import { fold } from "../core/html.js";
import { PROJECT_ROOT } from "./helpers.js";

const project = createProject(PROJECT_ROOT, { warn: assert.fail, error: assert.fail });

// Every page and zone of the demo: [{ where, page }], the zones as { blocks }.
async function everyFile() {
  const out = [];
  for (const { slug } of await project.listPages()) out.push({ where: `pages/${slug}.json`, page: await project.readPage(slug) });
  const zones = await project.readZones();
  for (const [name, zone] of Object.entries(zones)) out.push({ where: `pages/_${name}.json`, page: zone });
  return out;
}

const optionValues = (field) => (Array.isArray(field?.options) ? field.options : []).map((o) => (o && typeof o === "object" ? o.value : o));

describe("the demo site", () => {
  test("every page renders in the editor, on the site and in the export, with the header and the footer, with no errors", async () => {
    const components = await project.loadComponents();
    const site = await project.readSite();
    const zones = await project.readZones();
    const pages = await project.listPages();
    assert.ok(pages.some((p) => p.slug === "index"));
    const headerId = zones.header.blocks[0]?.id;
    const footerId = zones.footer.blocks[0]?.id;
    assert.ok(headerId && footerId, "the demo has a shared header and a shared footer");
    for (const { slug, path } of pages) {
      const page = await project.readPage(slug);
      for (const mode of ["editor", "site", "static"]) {
        const errors = [];
        const out = renderPage({ page, site, components, mode, zones, path, onError: (e) => errors.push(e) });
        assert.deepEqual(errors, [], `${slug} (${mode})`);
        assert.ok(out.includes("<title>"), slug);
        const main = out.indexOf('<main class="b-page"');
        assert.ok(out.indexOf(`data-id="${headerId}"`) > 0 && out.indexOf(`data-id="${headerId}"`) < main, `${slug} (${mode}): the header`);
        assert.ok(out.indexOf(`data-id="${footerId}"`) > out.indexOf("</main>"), `${slug} (${mode}): the footer`);
      }
    }
  });

  // The pages' texts belong to whoever edits the site, so here we check what the editor and the
  // server need: a site name and language, a title and a valid access on every page, a login page.
  test("site.json and the pages have what the editor needs: a name, a language, titles, access, a login page", async () => {
    const site = await project.readSite();
    assert.equal(site.name, "Luna Café");
    assert.equal(site.lang, "en");
    const pages = await project.listPages();
    assert.ok(pages.some((p) => p.slug === "404"), "there is a 404 page");
    for (const { slug } of pages) {
      const page = await project.readPage(slug);
      assert.ok(typeof page.title === "string" && page.title.trim(), `${slug}: has a title`);
      assert.ok(["public", "members"].includes(page.access ?? "public"), `${slug}: unknown access (${page.access})`);
      assert.ok(Array.isArray(page.blocks), `${slug}: “blocks” is a list`);
    }
    // The home page is for everyone; the login page from site.json exists and has a Log in block.
    assert.equal(pages.find((p) => p.slug === "index").access, "public");
    const login = pages.find((p) => p.slug === slugForPath(site.loginPage));
    assert.ok(login, `the login page ${site.loginPage} exists`);
    assert.equal(login.access, "public");
    assert.ok(login.types.includes("login"), `${site.loginPage} has a Log in block`);
    assert.ok(pages.some((p) => p.access === "members"), "the demo shows a members-only page");
  });

  test("every block uses only the settings, list fields, choices and areas its component knows", async () => {
    const components = await project.loadComponents();
    const problems = [];
    for (const { where, page } of await everyFile()) {
      eachBlock(page.blocks, (block) => {
        const here = `${where} ${block.id}`;
        const comp = components[block.type];
        if (!comp) return problems.push(`${here}: no block “${block.type}”`);
        for (const key of Object.keys(block)) {
          if (!["id", "type", "props", "slots", "placement"].includes(key)) problems.push(`${here}: unknown key “${key}”`);
        }
        for (const [key, value] of Object.entries(block.props || {})) {
          const field = comp.props?.[key];
          if (!field) {
            problems.push(`${here}: “${block.type}” has no setting “${key}”`);
            continue;
          }
          if (field.type === "choice" && !optionValues(field).includes(value)) problems.push(`${here}: ${key} = “${value}” isn't an option`);
          if (field.type !== "list") continue;
          for (const [i, row] of (Array.isArray(value) ? value : []).entries()) {
            for (const [name, v] of Object.entries(row || {})) {
              const f = field.fields?.[name];
              if (!f) problems.push(`${here}: ${key}[${i}] has no field “${name}”`);
              else if (f.type === "choice" && !optionValues(f).includes(v)) problems.push(`${here}: ${key}[${i}].${name} = “${v}” isn't an option`);
            }
          }
        }
        for (const name of Object.keys(block.slots || {})) {
          if (!Object.hasOwn(comp.slots || {}, name)) problems.push(`${here}: “${block.type}” has no area “${name}”`);
        }
      });
    }
    assert.deepEqual(problems, []);
  });

  test("every link inside the site points to a page, and every image to a file in assets/", async () => {
    const slugs = new Set((await project.listPages()).map((p) => p.slug));
    const site = await project.readSite();
    const problems = [];
    const check = (where, address) => {
      if (!address.startsWith("/") || address.startsWith("//")) return;
      const path = address.replace(/[?#].*$/, "");
      if (path.startsWith("/assets/")) {
        if (!existsSync(join(PROJECT_ROOT, decodeURIComponent(path)))) problems.push(`${where}: no file ${path}`);
      } else if (!slugs.has(slugForPath(path))) problems.push(`${where}: no page at ${path}`);
    };
    const walk = (where, value) => {
      if (typeof value === "string") {
        check(where, value);
        for (const [, link] of value.matchAll(/\]\(([^)\s]+)\)/g)) check(where, link);
      } else if (value && typeof value === "object") {
        for (const v of Object.values(value)) walk(where, v);
      }
    };
    check("site.json loginPage", site.loginPage);
    let seen = 0;
    for (const { where, page } of await everyFile()) {
      eachBlock(page.blocks, (block) => {
        seen++;
        walk(`${where} ${block.id}`, block.props);
      });
    }
    assert.ok(seen > 30, "the demo has blocks to check");
    assert.deepEqual(problems, []);
  });

  // Only the project's files: the site's content (pages/, site.json, assets/) belongs to the user
  // and may contain any word. docs/propuneri/ holds private notes that git ignores (see .gitignore),
  // so they are never published with Blocks.
  test("the project's old name no longer appears in the project's files", () => {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name.startsWith(".") || ["node_modules", "dist", "data", "pages", "assets"].includes(name)) continue;
        if (dir === PROJECT_ROOT && name === "site.json") continue;
        if (dir === join(PROJECT_ROOT, "docs") && name === "propuneri") continue;
        const file = join(dir, name);
        if (statSync(file).isDirectory()) walk(file);
        else if (/\.(js|json|md|css|html)$/.test(name)) files.push(file);
      }
    };
    walk(PROJECT_ROOT);
    assert.ok(files.length > 30);
    const old = ["cara", "mid"].join(""); // split, so this file doesn't contain it either
    for (const file of files) {
      const text = fold(readFileSync(file, "utf8"));
      assert.ok(!text.includes(old), `${file} still contains the old name`);
    }
  });
});
