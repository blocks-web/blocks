// All the bundled blocks together (components/): exactly the 37 of the glossary, each with an icon the
// editor draws, a palette category and a name of its own, and all of them on one page, in every mode,
// with no errors. What each block does on its own is tested in blocks-a.test.js and blocks-b.test.js.

import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createProject } from "../server/project.js";
import { renderPage } from "../core/render.js";
import { ICON_NAMES } from "../editor/block-icons.js";
import { PROJECT_ROOT } from "./helpers.js";

// The bundled blocks, by file id (the list in README.md, “What's inside”).
const IDS = [
  ..."button cards stats quote embed columns account members-only team hero events form contact-form gallery map image image-text cta signup".split(" "),
  ..."faq timeline list locations login navbar canvas press pricing hours social section logos spacer news footer text video".split(" "),
];

// The palette categories of the bundled blocks (“My blocks” is for the site owner's own blocks).
const CATEGORIES = ["Sections", "Text & images", "Lists", "Contact", "Members", "Page"];

// The blocks with a server part: the form and its alias.
const SERVER = ["contact-form", "form"];

let components;
before(async () => {
  components = await createProject(PROJECT_ROOT, { warn: assert.fail, error: assert.fail }).loadComponents();
});

describe("the bundled blocks, together", () => {
  test("there are exactly the 37 blocks of the glossary, and no file is left under another name", () => {
    assert.equal(IDS.length, 37);
    assert.deepEqual(Object.keys(components).sort(), [...IDS].sort());
    const files = readdirSync(join(PROJECT_ROOT, "components")).filter((f) => !f.startsWith("."));
    assert.deepEqual(files.filter((f) => f.endsWith(".server.js")).map((f) => f.slice(0, -10)).sort(), SERVER);
    assert.deepEqual(files.filter((f) => !f.endsWith(".server.js")).map((f) => f.slice(0, -3)).sort(), [...IDS].sort());
  });

  test("each has an icon the editor draws, a palette category and a name of its own", () => {
    const names = new Map();
    const icons = new Map();
    for (const [id, comp] of Object.entries(components)) {
      assert.ok(ICON_NAMES.includes(comp.icon), `${id}: the icon “${comp.icon}” isn't drawn in editor/block-icons.js`);
      assert.ok(CATEGORIES.includes(comp.category), `${id}: the category “${comp.category}” isn't in the palette`);
      assert.ok(!names.has(comp.name), `${id} and ${names.get(comp.name)} are both called “${comp.name}”`);
      names.set(comp.name, id);
      if (comp.alias) continue;
      assert.ok(!icons.has(comp.icon), `${id} and ${icons.get(comp.icon)} have the same icon “${comp.icon}”`);
      icons.set(comp.icon, id);
    }
    // Only an alias shares the icon of the block it stands for.
    const aliases = Object.entries(components).filter(([, c]) => c.alias);
    assert.deepEqual(aliases.map(([id, c]) => [id, c.alias]), [["contact-form", "form"]]);
    assert.equal(components["contact-form"].icon, components.form.icon);
  });

  test("all of them on one page render in every mode, for a visitor and for a member, on an English and a Romanian site", () => {
    const page = { title: "Every block", blocks: IDS.map((type, i) => ({ id: `b${i}`, type, props: {} })) };
    const member = { id: "u1", name: "Ana", email: "ana@example.com" };
    for (const lang of ["en", "ro"]) {
      const site = { name: "Luna Café", lang, loginPage: "/login" };
      for (const [mode, user] of [["editor", null], ["site", null], ["site", member], ["static", null]]) {
        const errors = [];
        const out = renderPage({ page, site, components, mode, user, path: "/", onError: (e) => errors.push(e) });
        assert.deepEqual(errors, [], `${lang} ${mode}${user ? " (member)" : ""}`);
        for (const [i, type] of IDS.entries()) {
          assert.ok(out.includes(`<div class="c-${type}" data-c="${type}" data-id="b${i}">`), `${type}: ${lang} ${mode}`);
        }
      }
    }
  });
});
