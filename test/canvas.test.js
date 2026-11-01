// Free canvas (docs/ARCHITECTURE.md, “The Free canvas”): safePlacement and the core's free area
// (ctx.slot(name, { free: true })). Freedom, but safety: only integers and values from a list
// reach the page, however odd the JSON is. The bundled "canvas" block is tested in canvas-block.test.js.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { html } from "../core/html.js";
import { GRID_CSS, LIMITS, renderPage, renderParts, safePlacement, SHAPES } from "../core/render.js";

const MODES = ["editor", "site", "static"];
const count = (text, part) => text.split(part).length - 1;
const cells = (body) => [...body.matchAll(/<div class="(b-cell[^"]*)" style="([^"]*)"( data-cell="([^"]*)")?>/g)];
const STYLE = /^grid-area:(\d+) \/ (\d+) \/ span (\d+) \/ span (\d+);z-index:(\d+)$/;

// Hostile or wrong values, from JSON written by hand or sent by someone else.
const HOSTILE = [
  "1;background:url(javascript:x)",
  '3"><script>alert(1)</script>',
  "calc(100% + 1px)",
  "",
  " ",
  "0x10",
  "1e3",
  -5,
  -0,
  0,
  2.7,
  -2.5,
  1e9,
  -1e9,
  Infinity,
  -Infinity,
  NaN,
  {},
  [],
  [5],
  null,
  undefined,
  true,
  false,
  { valueOf: () => 7 },
  { toString: () => "7" },
  () => 3,
];

function checkPlacement(a) {
  assert.deepEqual(Object.keys(a), ["x", "y", "w", "h", "z", "shape", "fill"]);
  for (const [key, min, max] of [["x", 1, 12], ["y", 1, 200], ["w", 1, 12], ["h", 1, 60], ["z", 0, 50]]) {
    assert.ok(Number.isInteger(a[key]) && a[key] >= min && a[key] <= max, `${key} = ${a[key]}`);
    assert.ok(!Object.is(a[key], -0), `${key} isn't -0`);
  }
  assert.ok(a.x + a.w - 1 <= 12, `x + w - 1 = ${a.x + a.w - 1}`);
  assert.ok(SHAPES.includes(a.shape));
  assert.equal(typeof a.fill, "boolean");
}

describe("safePlacement", () => {
  test("the limits live in one place: 12 columns, y ≤ 200, h ≤ 60, z ≤ 50, the phone below 640 px, 2rem rows", () => {
    assert.deepEqual({ ...LIMITS }, { columns: 12, y: 200, h: 60, z: 50, phone: 640, row: "2rem" });
    assert.ok(Object.isFrozen(LIMITS));
    assert.deepEqual(SHAPES, ["rect", "rounded", "circle"]);
  });

  test("missing or empty → the defaults from the spec", () => {
    const fallback = { x: 1, y: 1, w: 6, h: 4, z: 0, shape: "rect", fill: false };
    for (const a of [undefined, null, {}, [], "x:1", 5, true, () => {}, Symbol("a"), 10n]) assert.deepEqual(safePlacement(a), fallback);
  });

  test("good values pass unchanged", () => {
    const a = { x: 3, y: 17, w: 4, h: 9, z: 12, shape: "circle", fill: true };
    assert.deepEqual(safePlacement(a), a);
    assert.deepEqual(safePlacement({ x: 12, y: 200, w: 1, h: 60, z: 50, shape: "rounded" }), { x: 12, y: 200, w: 1, h: 60, z: 50, shape: "rounded", fill: false });
  });

  test("the values from the spec: text, negative, too large, fractions, NaN, objects → valid integers", () => {
    assert.deepEqual(safePlacement({ x: "1;background:url(javascript:x)", y: -5, w: 1e9, h: 2.7, z: NaN, shape: "star", fill: "true" }), {
      x: 1, y: 1, w: 12, h: 3, z: 0, shape: "rect", fill: false,
    });
    assert.deepEqual(safePlacement({ x: {}, y: null, w: [], h: -3, z: 1e9 }), { x: 1, y: 1, w: 6, h: 1, z: 50, shape: "rect", fill: false });
    assert.deepEqual(safePlacement({ x: 2.4, y: 2.5, w: "4", h: " 7 ", z: "-3" }), { x: 2, y: 3, w: 4, h: 7, z: 0, shape: "rect", fill: false });
    assert.deepEqual(safePlacement({ x: Infinity, y: -Infinity, h: JSON.parse("1e999") }), { x: 12, y: 1, w: 1, h: 60, z: 0, shape: "rect", fill: false });
  });

  test("the width shrinks so the block doesn't go past the 12 columns", () => {
    assert.equal(safePlacement({ x: 10, w: 6 }).w, 3);
    assert.equal(safePlacement({ x: 12 }).w, 1);
    assert.equal(safePlacement({ x: 7, w: 6 }).w, 6);
    const { x, w } = safePlacement({ x: 99, w: 99 });
    assert.deepEqual([x, w], [12, 1]);
  });

  test("the shape only from the list (exactly), fill only with true", () => {
    for (const shape of SHAPES) assert.equal(safePlacement({ shape }).shape, shape);
    for (const shape of ["Circle", " circle", "circle;", "rounded\"", "<b>", 1, null, {}, ["circle"], "rect rounded"]) {
      assert.equal(safePlacement({ shape }).shape, "rect", String(shape));
    }
    for (const fill of ["true", 1, "yes", {}, [true]]) assert.equal(safePlacement({ fill }).fill, false);
    assert.equal(safePlacement({ fill: true }).fill, true);
  });

  test("never throws: a getter that throws, a Proxy, a revoked Proxy; inherited fields are ignored", () => {
    const trap = { get x() { throw new Error("x"); }, y: 4 };
    assert.deepEqual(safePlacement(trap), { x: 1, y: 4, w: 6, h: 4, z: 0, shape: "rect", fill: false });
    const proxy = new Proxy({}, { get() { throw new Error("get"); }, getOwnPropertyDescriptor() { throw new Error("gopd"); }, has() { throw new Error("has"); } });
    checkPlacement(safePlacement(proxy));
    const { proxy: revoked, revoke } = Proxy.revocable({ x: 3 }, {});
    revoke();
    checkPlacement(safePlacement(revoked));
    assert.equal(safePlacement(Object.create({ x: 9, shape: "circle", fill: true })).x, 1);
    assert.equal(safePlacement(Object.create({ fill: true })).fill, false);
    // "__proto__" from JSON is an ordinary field; it changes nothing.
    checkPlacement(safePlacement(JSON.parse('{"__proto__": {"x": 5}, "y": 2}')));
  });

  test("always returns a new object, unconnected to the one it got", () => {
    const a = { x: 2, y: 2, w: 2, h: 2, z: 2, shape: "circle", fill: true };
    const b = safePlacement(a);
    const c = safePlacement(a);
    assert.notEqual(b, a);
    assert.notEqual(b, c);
    b.x = 999;
    assert.equal(c.x, 2);
    assert.equal(a.x, 2);
    assert.notEqual(safePlacement(), safePlacement());
  });

  test("any combination of hostile values gives a valid placement", () => {
    const keys = ["x", "y", "w", "h", "z", "shape", "fill"];
    let seed = 7;
    const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    for (let i = 0; i < 2000; i++) {
      const a = {};
      for (const key of keys) if (rand(4)) a[key] = HOSTILE[rand(HOSTILE.length)];
      checkPlacement(safePlacement(a));
    }
    for (const v of HOSTILE) for (const key of keys) checkPlacement(safePlacement({ [key]: v }));
  });
});

// Test components: a free area written by another programmer than the Free canvas block's.
const sample = {
  panel: {
    name: "Panel",
    slots: { area: "Area", other: "Other" },
    html: (p, ctx) => html`<div class="panel">${ctx.slot("area", { free: true })}</div>`,
    css: ".panel { padding: 1rem; }",
  },
  double: {
    name: "Double",
    slots: { area: "Area" },
    // free only with true; any other "yes" stays an ordinary area.
    html: (p, ctx) => html`<div class="double">${ctx.slot("area", { free: "yes" })}${ctx.slot("area", null)}</div>`,
  },
  heading: {
    name: "Heading",
    props: { text: { type: "text", default: "Hello" } },
    html: (p) => html`<h2 class="heading">${p.text}</h2>`,
    css: ".heading { color: red; }",
  },
  active: { name: "Active", html: () => html`<p>active</p>`, js() {} },
};

function pageWith(children, type = "panel", slot = "area") {
  return { blocks: [{ id: "g", type, props: {}, slots: { [slot]: children } }] };
}

describe("the core's free area: ctx.slot(name, { free: true })", () => {
  test("renders the grid with data-grid and every block in a cell with grid-area and z-index", () => {
    const { body } = renderParts({
      page: pageWith([{ id: "a", type: "heading", props: {}, placement: { x: 3, y: 2, w: 4, h: 5, z: 7, shape: "rounded", fill: true } }]),
      components: sample,
      mode: "site",
    });
    assert.ok(body.includes('<div class="panel"><div class="b-grid" data-grid="g:area">'));
    assert.ok(
      body.includes(
        '<div class="b-cell b-cell--rounded b-cell--fill" style="grid-area:2 / 3 / span 5 / span 4;z-index:7"><div class="c-heading" data-c="heading" data-id="a"><h2 class="heading">Hello</h2></div></div>',
      ),
    );
    assert.ok(!body.includes("b-slot\" data-slot=\"g:area"), "the grid isn't also an ordinary area");
  });

  test("the style attribute has only grid-area and z-index, with integers, however hostile the placement", () => {
    const children = [];
    for (let i = 0; i < HOSTILE.length; i++) {
      const v = HOSTILE[i];
      children.push({ id: `c${i}`, type: "heading", props: {}, placement: { x: v, y: v, w: v, h: v, z: v, shape: v, fill: v } });
    }
    children.push({ id: "s", type: "heading", props: {}, placement: '{"x":"1;color:red"}' });
    children.push({ id: "f", type: "heading", props: {}, placement: { shape: '"><script>alert(1)</script>', x: "2;}</style><script>" } });
    for (const mode of MODES) {
      const { body } = renderParts({ page: pageWith(children), components: sample, mode });
      const found = cells(body);
      assert.equal(found.length, children.length, mode);
      for (const [, cls, style] of found) {
        const m = style.match(STYLE);
        assert.ok(m, `style: ${style}`);
        const [x, y, w, h, z] = [m[2], m[1], m[4], m[3], m[5]].map(Number);
        checkPlacement({ x, y, w, h, z, shape: "rect", fill: false });
        assert.match(cls, /^b-cell b-cell--(rect|rounded|circle)( b-cell--fill)?( b-cell--over)?$/);
      }
      assert.ok(!body.includes("<script"), mode);
      assert.ok(!body.includes("javascript"), mode);
      assert.ok(!body.includes("color:red"), mode);
      assert.equal(count(body, "style="), children.length, `${mode}: only the cells have style`);
    }
  });

  test("the cells come in reading order: by row, then by column; on a tie, the page order", () => {
    const children = [
      { id: "bottom", type: "heading", placement: { x: 1, y: 9 } },
      { id: "right", type: "heading", placement: { x: 8, y: 1 } },
      { id: "none", type: "heading" },
      { id: "left", type: "heading", placement: { x: 2, y: 1 } },
      { id: "middle", type: "heading", placement: { x: 5, y: 4 } },
      { id: "top-too", type: "heading", placement: { x: 1, y: 1 } },
      { id: "bad", type: "heading", placement: { x: "x", y: "y" } },
    ];
    for (const mode of MODES) {
      const { body } = renderParts({ page: pageWith(children), components: sample, mode });
      const order = [...body.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== "g");
      assert.deepEqual(order, ["none", "top-too", "bad", "left", "right", "middle", "bottom"], mode);
    }
  });

  test("the grid CSS appears once per page, before the components' CSS; without a free area, not at all", () => {
    const page = {
      blocks: [
        { id: "g1", type: "panel", slots: { area: [{ id: "a", type: "heading" }, { id: "g2", type: "panel", slots: { area: [{ id: "b", type: "heading" }] } }] } },
        { id: "g3", type: "panel", slots: { area: [] } },
      ],
    };
    const zones = { header: { blocks: [{ id: "g4", type: "panel", slots: { area: [{ id: "c", type: "heading" }] } }] } };
    for (const mode of MODES) {
      const { css, body } = renderParts({ page, zones, components: sample, mode });
      assert.equal(count(css, GRID_CSS), 1, mode);
      assert.equal(count(css, "/* free grid */"), 1);
      assert.ok(css.startsWith(`/* free grid */\n${GRID_CSS}\n/* panel */`), "the grid first, then the components");
      assert.equal(count(css, ".panel {"), 1);
      assert.equal(count(body, 'class="b-grid"'), 4);
    }
    const without = renderParts({ page: { blocks: [{ id: "a", type: "heading", placement: { x: 3 } }] }, components: sample });
    assert.ok(!without.css.includes("b-grid"));
    assert.ok(!without.body.includes("b-cell"), "a placement outside a canvas is ignored");
    assert.ok(!without.body.includes("style="));
  });

  test("the grid CSS is on the page even with blocksStyles: false; it has the phone stacking and isolated layers", () => {
    const doc = renderPage({ page: pageWith([{ id: "a", type: "heading" }]), site: { blocksStyles: false }, components: sample });
    assert.ok(!doc.includes("/core/base.css"));
    assert.ok(doc.includes(GRID_CSS));
    assert.match(GRID_CSS, /@container b-grid \(width < 640px\)\{[^]*grid-column:1\/-1!important;grid-row-start:auto!important/);
    assert.match(GRID_CSS, /\.b-grid\{[^}]*grid-template-columns:repeat\(12,minmax\(0,1fr\)\)[^}]*isolation:isolate[^}]*container:b-grid\/inline-size/);
    assert.match(GRID_CSS, /grid-auto-rows:minmax\(2rem,auto\)/);
    for (const shape of SHAPES.filter((s) => s !== "rect")) assert.ok(GRID_CSS.includes(`.b-cell--${shape}{`), shape);
    assert.ok(GRID_CSS.includes(".b-cell--fill img,.b-cell--fill video{position:absolute;inset:0;"));
    assert.ok(GRID_CSS.includes("var(--radius,12px)"));
    assert.ok(!GRID_CSS.includes("</"), "it can't close <style>");
  });

  test("data-cell and the hint for an empty grid only in the editor (and not in the shared zones)", () => {
    const full = pageWith([{ id: "a", type: "heading" }, { id: "b", type: "heading", placement: { y: 3 } }]);
    const editor = renderParts({ page: full, components: sample, mode: "editor" }).body;
    assert.equal(count(editor, "data-cell="), 2);
    assert.ok(editor.includes('data-cell="a"><div class="c-heading" data-c="heading" data-id="a">'));
    assert.ok(!editor.includes("data-empty"), "a grid with blocks has no hint");
    for (const mode of ["site", "static"]) {
      const body = renderParts({ page: full, components: sample, mode }).body;
      assert.ok(!body.includes("data-cell") && !body.includes("data-empty") && !body.includes("data-slot"), mode);
      assert.ok(body.includes('data-grid="g:area"'), mode);
    }
    const empty = pageWith([]);
    const emptyEditor = renderParts({ page: empty, components: sample, mode: "editor" }).body;
    assert.ok(emptyEditor.includes('<div class="b-grid" data-grid="g:area"><div class="b-empty" data-empty>Drag a block here, then place it anywhere and drag its corners to make it bigger.</div></div>'));
    for (const mode of ["site", "static"]) {
      assert.ok(renderParts({ page: empty, components: sample, mode }).body.includes('<div class="b-grid" data-grid="g:area"></div>'), mode);
    }
    // In the header (a shared zone, not editable from the page): visible, but without handles and without the hint.
    const zone = renderParts({ page: {}, zones: { header: full }, components: sample, mode: "editor" }).body;
    assert.ok(zone.includes('data-zone="header"') && zone.includes("b-cell") && !zone.includes("data-cell"));
    assert.ok(renderParts({ page: {}, zones: { header: empty }, components: sample, mode: "editor" }).body.includes('<div class="b-grid" data-grid="g:area"></div>'));
  });

  test("only { free: true } makes the grid; a block without an id gets the same id on its cell and on itself", () => {
    const { body } = renderParts({ page: pageWith([{ id: "a", type: "heading" }], "double"), components: sample, mode: "editor" });
    assert.ok(!body.includes("b-grid"));
    assert.equal(count(body, 'data-slot="g:area"'), 2);
    const without = renderParts({ page: pageWith([{ type: "heading" }, { type: "heading", placement: { y: 2 } }]), components: sample, mode: "editor" }).body;
    const ids = cells(without).map((m) => m[4]);
    assert.deepEqual(ids, ["auto1", "auto2"]);
    for (const id of ids) assert.ok(without.includes(`data-cell="${id}"><div class="c-heading" data-c="heading" data-id="${id}">`));
  });

  test("broken blocks in the grid: missing → nothing on the site, a message in the editor; items that aren't objects are skipped", (t) => {
    t.mock.method(console, "error", () => {});
    const children = [null, 5, "text", { id: "x", type: "does-not-exist", placement: { x: 2 } }, { id: "a", type: "heading", placement: { x: 4 } }];
    const errors = [];
    const site = renderParts({ page: pageWith(children), components: sample, mode: "site", onError: (e) => errors.push(e.id) }).body;
    assert.equal(cells(site).length, 1);
    assert.deepEqual(errors, ["x"]);
    const editor = renderParts({ page: pageWith(children), components: sample, mode: "editor", onError: () => {} }).body;
    assert.equal(cells(editor).length, 2);
    assert.ok(editor.includes('data-cell="x"><div class="b-missing" data-c="does-not-exist" data-id="x">'));
  });

  test("a cell over a block with text gets the canvas background (b-cell--over); over an image that fills, it doesn't", () => {
    const cls = (children) => Object.fromEntries(cells(renderParts({ page: pageWith(children), components: sample, mode: "site" }).body).map(([, c], i) => [i, c]));
    const below = { id: "below", type: "heading", props: {}, placement: { x: 1, y: 1, w: 6, h: 4, z: 0 } };
    const above = { id: "above", type: "heading", props: {}, placement: { x: 3, y: 2, w: 6, h: 4, z: 1 } };
    const beside = { id: "beside", type: "heading", props: {}, placement: { x: 7, y: 1, w: 6, h: 4, z: 0 } };
    assert.deepEqual(cls([below, beside]), { 0: "b-cell b-cell--rect", 1: "b-cell b-cell--rect" }, "no overlap, no background");
    const over = cls([below, above]);
    assert.equal(over[0], "b-cell b-cell--rect");
    assert.equal(over[1], "b-cell b-cell--rect b-cell--over");
    // The layer decides who is on top, not the reading order.
    const reversed = cls([{ ...below, placement: { ...below.placement, z: 2 } }, above]);
    assert.equal(reversed[0], "b-cell b-cell--rect b-cell--over");
    assert.equal(reversed[1], "b-cell b-cell--rect");
    // A title over a photo that fills its cell stays transparent.
    const photo = cls([{ ...below, placement: { ...below.placement, fill: true } }, above]);
    assert.equal(photo[1], "b-cell b-cell--rect");
    assert.ok(GRID_CSS.includes(".b-cell--over{background:var(--b-grid-background,var(--background))}"));
  });

  test("blocks with js inside the grid start as anywhere else, once", () => {
    const { instances } = renderParts({ page: pageWith([{ id: "j", type: "active" }, { id: "k", type: "active", placement: { y: 5 } }]), components: sample });
    assert.deepEqual(instances.map((i) => i.id), ["j", "k"]);
  });
});
