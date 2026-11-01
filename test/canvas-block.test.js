// The bundled "canvas" block (Free canvas), on top of the core's free area (see canvas.test.js):
// its settings, the classes and the row count it writes, and a canvas holding every bundled block.

import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { GRID_CSS, renderPage, renderParts, SHAPES } from "../core/render.js";
import { createProject } from "../server/project.js";
import { PROJECT_ROOT } from "./helpers.js";

const MODES = ["editor", "site", "static"];
const count = (text, part) => text.split(part).length - 1;
const cells = (body) => [...body.matchAll(/<div class="(b-cell[^"]*)" style="([^"]*)"( data-cell="([^"]*)")?>/g)];
const STYLE = /^grid-area:(\d+) \/ (\d+) \/ span (\d+) \/ span (\d+);z-index:(\d+)$/;

describe("the Free canvas block", () => {
  let components;
  before(async () => {
    components = await createProject(PROJECT_ROOT, { warn: assert.fail, error: assert.fail }).loadComponents();
  });

  // Renders a canvas and returns the page body (without render errors).
  function render(props, mode, children = [], extra = {}) {
    const errors = [];
    const { body, css } = renderParts({
      page: { blocks: [{ id: "p", type: "canvas", props, slots: { content: children } }] },
      site: { name: "Luna Café", loginPage: "/login" },
      components,
      mode,
      user: mode === "site" ? { id: "u", name: "Ana", email: "ana@example.com" } : null,
      onError: (e) => errors.push(`${e.type}#${e.id}: ${e.error?.message}`),
      ...extra,
    });
    assert.deepEqual(errors, [], mode);
    return { body, css };
  }

  test("it is in “Sections”, with the “canvas” icon, the settings from the spec and a “Content” area", () => {
    const canvas = components.canvas;
    assert.equal(canvas.name, "Free canvas");
    assert.equal(canvas.category, "Sections");
    assert.equal(canvas.icon, "canvas");
    assert.deepEqual(canvas.slots, { content: "Content" });
    const { minRows, spacing, background, width } = canvas.props;
    assert.deepEqual([minRows.type, minRows.min, minRows.max, minRows.default], ["number", 6, 60, 12]);
    const values = (field) => field.options.map((o) => o.value);
    assert.deepEqual(values(spacing), ["small", "medium", "large"]);
    assert.deepEqual(values(background), ["none", "surface", "primary"]);
    assert.deepEqual(values(width), ["normal", "full"]);
    assert.deepEqual(Object.keys(canvas.props), ["minRows", "spacing", "background", "width"]);
  });

  test("with the defaults: the grid in a normal container, 12 rows; empty, it has a hint in the editor and leaves no gap on the site", () => {
    for (const mode of MODES) {
      const { body, css } = render({}, mode);
      assert.ok(body.includes('<section class="b-block canvas canvas--none canvas--medium canvas--normal" style="--canvas-rows:12">'), mode);
      assert.ok(body.includes('<div class="b-container canvas__inner"><div class="b-grid" data-grid="p:content">'), mode);
      assert.equal(body.includes("Drag a block here"), mode === "editor", mode);
      assert.ok(css.includes(GRID_CSS));
      assert.ok(css.includes(".canvas:not(:has(.b-cell, .b-empty)) { display: none; }"));
    }
  });

  test("empty or hostile settings: only classes from the list and an integer between 6 and 60", () => {
    const hostile = [
      { minRows: "12;}</style><script>alert(1)</script>", spacing: '" onmouseover="x', background: "<script>", width: {} },
      { minRows: -5, spacing: "huge", background: "custom", width: "full\"" },
      { minRows: 1e9, spacing: ["small"], background: null, width: 0 },
      { minRows: NaN, spacing: "", background: "", width: "" },
      { minRows: {}, spacing: null },
      { minRows: "40" },
      { minRows: 7.6 },
      { minRows: "" },
    ];
    const expected = [12, 6, 60, 12, 12, 40, 8, 12];
    for (const mode of MODES) {
      hostile.forEach((props, i) => {
        const { body } = render(props, mode, [{ id: "t", type: "text", props: { title: "<img src=x onerror=alert(1)>" } }]);
        const m = body.match(/<section class="b-block canvas canvas--(\w+) canvas--(\w+) canvas--(\w+)" style="--canvas-rows:(\d+)">/);
        assert.ok(m, `${mode} #${i}`);
        assert.ok(["none", "surface", "primary"].includes(m[1]));
        assert.ok(["small", "medium", "large"].includes(m[2]));
        assert.ok(["normal", "full"].includes(m[3]));
        assert.equal(Number(m[4]), expected[i], `${mode} #${i}`);
        assert.ok(!body.includes("<script") && !body.includes("<img src=x") && !body.includes("onmouseover"), `${mode} #${i}`);
      });
    }
    // "Full width" doesn't use the 1100 px container.
    assert.ok(render({ width: "full" }, "site").body.includes('<div class="canvas__inner"><div class="b-grid"'));
  });

  test("a canvas with every bundled block, each in its own cell, in the editor, on the site and in the export", () => {
    const types = Object.keys(components).sort();
    const children = types.map((type, i) => ({
      id: `b${i}`,
      type,
      props: {},
      placement: { x: (i % 3) * 4 + 1, y: Math.floor(i / 3) * 6 + 1, w: 4, h: 6, z: i % 5, shape: SHAPES[i % 3], fill: i % 2 === 0 },
    }));
    for (const mode of MODES) {
      const { body, css } = render({}, mode, children);
      const found = cells(body);
      // On the site, the blocks with nothing to show with their defaults stay, empty, in their cell.
      assert.equal(found.length, types.length, mode);
      for (const [, , style] of found) assert.match(style, STYLE);
      for (const [i, type] of types.entries()) {
        assert.ok(body.includes(`<div class="c-${type}" data-c="${type}" data-id="b${i}">`), `${type} (${mode})`);
        if (components[type].css) assert.ok(css.includes(`/* ${type} */`), `${type}: CSS (${mode})`);
      }
      assert.equal(count(css, GRID_CSS), 1);
      assert.equal(count(body, "data-cell="), mode === "editor" ? types.length : 0);
      // Reading order: b0, b1, b2 on the first row, then the next ones.
      const order = found.map((m) => Number(m[2].match(STYLE)[1]) * 100 + Number(m[2].match(STYLE)[2]));
      assert.deepEqual(order, [...order].sort((a, b) => a - b), mode);
    }
  });

  test("a canvas inside a canvas has its own grid; the full document has the grid CSS only once", () => {
    const children = [{ id: "q", type: "canvas", props: { background: "primary" }, placement: { x: 2, w: 10, h: 8 }, slots: { content: [{ id: "b", type: "button", props: {}, placement: { x: 3 } }] } }];
    const doc = renderPage({
      page: { blocks: [{ id: "p", type: "canvas", props: {}, slots: { content: children } }] },
      site: { name: "Luna Café" },
      components,
    });
    assert.equal(count(doc, GRID_CSS), 1);
    assert.ok(doc.includes('data-grid="p:content"') && doc.includes('data-grid="q:content"'));
    assert.ok(doc.includes('style="grid-area:1 / 2 / span 8 / span 10;z-index:0"'));
  });
});
