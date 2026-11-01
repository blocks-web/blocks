// editor/tree.js: the areas a container doesn't show, the links to a deleted page and the gaps
// (the places a block can go, the same for dragging, "+" and Alt+Up/Down).
// editor/format.js: the formatting marks. editor/block-icons.js: the icons by name.
// editor/registry.js: the order of the categories. editor/preview.js: the hover card's text and page.
// editor/grid.js and tree.js (moveTo, insertTo, freeSlots): the Free canvas, from the editor's side.

import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { html } from "../core/html.js";
import {
  freeSlots,
  hiddenSlots,
  insertTo,
  linksTo,
  linksToPath,
  move,
  moveStep,
  moveTo,
  positionIndex,
  positions,
  removeLinksTo,
  shownSlots,
  summaryOf,
} from "../editor/tree.js";
import * as grid from "../editor/grid.js";
import { renderParts, safePlacement } from "../core/render.js";
import { applyMark, stripMarks } from "../editor/format.js";
import { ICON_NAMES, iconSvg, isIcon, svgFor } from "../editor/block-icons.js";
import { PATHS as UI_ICONS, svgUi } from "../editor/ui-icons.js";
import { cardNote, cardText, FILLERS, previewPage } from "../editor/preview.js";
import { categoryOf, compareBlocks, compareCategories, ORDER } from "../editor/registry.js";
import { itemTitle } from "../editor/fields.js";
import { blockFields, setLang } from "../editor/i18n.js";
import * as gaps from "../editor/gaps.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "./helpers.js";

// Some tests switch the editor to Romanian; the others expect English.
after(() => setLang("en"));

// Test components, written right here as objects.
const components = {
  columns: {
    name: "Columns",
    props: { count: { type: "choice", options: ["2", "3"], default: "2" } },
    slots: { c1: "Column 1", c2: "Column 2", c3: "Column 3" },
    html(p, ctx) {
      const cols = [];
      for (let i = 1; i <= Number(p.count); i++) cols.push(html`<div>${ctx.slot(`c${i}`)}</div>`);
      return html`<div class="columns">${cols}</div>`;
    },
  },
  box: {
    name: "Box",
    slots: { content: "Content" },
    html: (p, ctx) => html`<section>${ctx.slot("content")}</section>`,
  },
  broken: {
    name: "Broken",
    slots: { a: "A" },
    html() {
      throw new Error("broken");
    },
  },
  navbar: {
    name: "Navbar",
    props: {
      links: {
        type: "list",
        fields: { text: { type: "text" }, link: { type: "link", default: "/" } },
        default: [
          { text: "Home", link: "/" },
          { text: "About", link: "/about" },
        ],
      },
      buttonLink: { type: "link", default: "/contact" },
    },
    html: () => "",
  },
  cards: {
    name: "Cards",
    props: {
      cards: {
        type: "list",
        fields: { title: { type: "text" }, image: { type: "image" }, link: { type: "link" } },
      },
    },
    html: () => "",
  },
};
const get = (type) => components[type] || null;

describe("shownSlots / hiddenSlots", () => {
  test("Columns with 2 columns doesn't show “Column 3”", () => {
    assert.deepEqual(shownSlots({ props: {} }, components.columns), ["c1", "c2"]);
    assert.deepEqual(shownSlots({ props: { count: "3" } }, components.columns), ["c1", "c2", "c3"]);
  });

  test("a component that throws has all its slots shown", () => {
    assert.deepEqual(shownSlots({ props: {} }, components.broken), ["a"]);
  });

  test("what's in a hidden slot is hidden, however deep", () => {
    const doc = {
      blocks: [
        {
          id: "k",
          type: "columns",
          props: { count: "2" },
          slots: { c1: [], c3: [{ id: "x", type: "box", props: {}, slots: { content: [] } }] },
        },
        { id: "y", type: "box", props: {} },
      ],
    };
    assert.deepEqual([...hiddenSlots(doc, get)].sort(), ["k:c3", "x:content"]);
  });
});

// A document with a container: [t1, box(content: [t2, t3]), t4]
const docWithBox = () => ({
  blocks: [
    { id: "t1", type: "text", props: {} },
    { id: "c", type: "box", props: {}, slots: { content: [{ id: "t2", type: "text", props: {} }, { id: "t3", type: "text", props: {} }] } },
    { id: "t4", type: "text", props: {} },
  ],
});
const order = (doc) => doc.blocks.map((b) => (b.slots ? `${b.id}[${b.slots.content.map((k) => k.id).join(",")}]` : b.id)).join(" ");

describe("the gaps (positions / moveStep / a move in place)", () => {
  test("positions: the document's order, with the container's gaps between “before” and “after” it", () => {
    assert.deepEqual(positions(docWithBox(), get), [
      { slot: "root", index: 0 },
      { slot: "root", index: 1 },
      { slot: "c:content", index: 0 },
      { slot: "c:content", index: 1 },
      { slot: "c:content", index: 2 },
      { slot: "root", index: 2 },
      { slot: "root", index: 3 },
    ]);
  });

  test("positions: skips hidden areas and the moved block's subtree; the gaps around it are a single one", () => {
    const doc = {
      blocks: [
        { id: "k", type: "columns", props: { count: "2" }, slots: { c1: [], c2: [{ id: "x", type: "box", props: {}, slots: { content: [] } }], c3: [{ id: "y", type: "text", props: {} }] } },
        { id: "z", type: "text", props: {} },
      ],
    };
    // c3 is hidden (2 columns), so neither it nor “y” has gaps.
    assert.deepEqual(positions(doc, get), [
      { slot: "root", index: 0 },
      { slot: "k:c1", index: 0 },
      { slot: "k:c2", index: 0 },
      { slot: "x:content", index: 0 },
      { slot: "k:c2", index: 1 },
      { slot: "root", index: 1 },
      { slot: "root", index: 2 },
    ]);
    // We move “x”: it doesn't go into itself, and “before x” and “after x” are the same gap.
    assert.deepEqual(positions(doc, get, {}, { except: "x" }), [
      { slot: "root", index: 0 },
      { slot: "k:c1", index: 0 },
      { slot: "k:c2", index: 0 },
      { slot: "root", index: 1 },
      { slot: "root", index: 2 },
    ]);
  });

  test("moveStep goes into a container, through it and out of it", () => {
    const doc = docWithBox();
    assert.ok(moveStep(doc, "t1", 1, get));
    assert.equal(order(doc), "c[t1,t2,t3] t4");
    assert.ok(moveStep(doc, "t1", 1, get));
    assert.equal(order(doc), "c[t2,t1,t3] t4");
    assert.ok(moveStep(doc, "t1", 1, get));
    assert.equal(order(doc), "c[t2,t3,t1] t4");
    assert.ok(moveStep(doc, "t1", 1, get));
    assert.equal(order(doc), "c[t2,t3] t1 t4");
    assert.ok(moveStep(doc, "t1", 1, get));
    assert.equal(order(doc), "c[t2,t3] t4 t1");
    // The end of the page: there's no gap left.
    assert.equal(moveStep(doc, "t1", 1, get), false);
    assert.equal(order(doc), "c[t2,t3] t4 t1");
    // And back, to the start.
    for (let i = 0; i < 5; i++) assert.ok(moveStep(doc, "t1", -1, get));
    assert.equal(order(doc), "t1 c[t2,t3] t4");
    assert.equal(moveStep(doc, "t1", -1, get), false);
  });

  test("moveStep doesn't put a container into itself and skips hidden areas", () => {
    const doc = docWithBox();
    assert.ok(moveStep(doc, "c", 1, get));
    assert.equal(order(doc), "t1 t4 c[t2,t3]");
    const withHidden = {
      blocks: [
        { id: "a", type: "text", props: {} },
        { id: "k", type: "columns", props: { count: "2" }, slots: { c1: [], c2: [], c3: [{ id: "y", type: "text", props: {} }] } },
      ],
    };
    assert.ok(moveStep(withHidden, "a", 1, get));
    assert.deepEqual(withHidden.blocks[0].slots.c1.map((b) => b.id), ["a"]);
    // A block in a hidden area has no gaps: it stays in its list.
    assert.equal(moveStep(withHidden, "y", 1, get), false);
    assert.equal(moveStep(withHidden, "y", -1, get), false);
  });

  test("a move in place returns false (no step in the history)", () => {
    const doc = docWithBox();
    assert.equal(move(doc, "t1", "root", 0), false);
    assert.equal(move(doc, "t1", "root", 1), false);
    assert.equal(move(doc, "t3", "c:content", 2), false);
    assert.equal(order(doc), "t1 c[t2,t3] t4");
    assert.ok(move(doc, "t1", "root", 2));
    assert.equal(order(doc), "c[t2,t3] t1 t4");
    assert.ok(move(doc, "t1", "c:content", 0));
    assert.equal(order(doc), "c[t1,t2,t3] t4");
    // Into itself: no.
    assert.equal(move(doc, "c", "c:content", 0), false);
  });
});

describe("the links to a page", () => {
  test("linksToPath ignores a “/” at the end, ?… and #…", () => {
    assert.ok(linksToPath("/about", "/about"));
    assert.ok(linksToPath(" /about/ ", "/about"));
    assert.ok(linksToPath("/about?x=1#top", "/about"));
    assert.ok(!linksToPath("/about-us", "/about"));
    assert.ok(!linksToPath("", "/about"));
  });

  test("finds the links, also the ones that come from the default values", () => {
    const doc = { blocks: [{ id: "m", type: "navbar", props: {} }, { id: "c", type: "box", props: {}, slots: { content: [{ id: "n", type: "navbar", props: { links: [] } }] } }] };
    const found = linksTo(doc, get, "/contact").map((f) => [f.block.id, f.key]);
    assert.deepEqual(found, [["m", "buttonLink"], ["n", "buttonLink"]]);
    assert.equal(linksTo(doc, get, "/about").length, 1);
  });

  test("takes out the navbar entries and empties the link in the cards", () => {
    const doc = {
      blocks: [
        { id: "m", type: "navbar", props: { links: [{ text: "A", link: "/about" }, { text: "B", link: "/" }, { text: "C", link: "/about#x" }] } },
        { id: "c", type: "cards", props: { cards: [{ title: "Card", image: "/a.svg", link: "/about" }] } },
      ],
    };
    assert.equal(removeLinksTo(doc, get, "/about"), 3);
    assert.deepEqual(doc.blocks[0].props.links, [{ text: "B", link: "/" }]);
    assert.deepEqual(doc.blocks[1].props.cards, [{ title: "Card", image: "/a.svg", link: "" }]);
    assert.equal(linksTo(doc, get, "/about").length, 0);
  });
});

describe("the formatting marks (editor/format.js)", () => {
  test("bold and italic wrap the selection and keep it selected", () => {
    assert.deepEqual(applyMark("Hello world", 0, 5, "b"), { text: "**Hello** world", start: 2, end: 7 });
    assert.deepEqual(applyMark("Hello world", 6, 11, "i"), { text: "Hello *world*", start: 7, end: 12 });
  });

  test("without a selection it puts the marks in and leaves the cursor between them", () => {
    assert.deepEqual(applyMark("abc", 3, 3, "b"), { text: "abc****", start: 5, end: 5 });
    assert.deepEqual(applyMark("abc", 1, 1, "link"), { text: "a[](https://)bc", start: 2, end: 2 });
  });

  test("link: [selection](https://) with the address selected, so you type over it", () => {
    const r = applyMark("see the menu", 8, 12, "link");
    assert.equal(r.text, "see the [menu](https://)");
    assert.equal(r.text.slice(r.start, r.end), "https://");
  });

  test("a reversed selection or one outside the text is brought back; an unknown kind changes nothing", () => {
    assert.deepEqual(applyMark("abc", 3, 1, "i"), { text: "a*bc*", start: 2, end: 4 });
    assert.deepEqual(applyMark("abc", 0, 99, "b"), { text: "**abc**", start: 2, end: 5 });
    assert.deepEqual(applyMark("abc", 1, 2, "x"), { text: "abc", start: 1, end: 2 });
  });

  test("stripMarks takes the marks out of summaries", () => {
    assert.equal(stripMarks("**Coffee** *good*, [see](/products) today"), "Coffee good, see today");
    assert.equal(stripMarks("no marks, ăîșț"), "no marks, ăîșț");
    assert.equal(stripMarks("2 * 3 = 6"), "2 * 3 = 6");
  });

  test("summaryOf shows the text without marks", () => {
    const comp = { props: { title: { type: "text" } }, html: () => "" };
    assert.equal(summaryOf({ props: { title: "**Good** coffee" } }, comp), "Good coffee");
  });
});

// The icon names (docs/DESIGN.md, “Icons”): the bundled blocks' ids, plus the generic ones.
const KNOWN_ICONS = [
  "text", "heading", "image", "gallery", "video", "button", "cards", "columns", "section", "spacer", "navbar", "footer",
  "hero", "faq", "quote", "form", "login", "signup", "account", "members", "list", "link", "star", "calendar", "code",
  "block", "stats", "timeline", "logos", "press", "locations", "pricing", "hours", "team", "events", "cta", "image-text",
  "map", "social", "canvas",
];

describe("the icons by name (editor/block-icons.js)", () => {
  test("every known name has an icon, with a 1.75 line on a 24 square", () => {
    assert.equal(KNOWN_ICONS.length, 40);
    for (const name of KNOWN_ICONS) {
      assert.ok(isIcon(name), `the “${name}” icon is missing`);
      const svg = iconSvg(name, 20);
      assert.match(svg, /viewBox="0 0 24 24"/);
      assert.match(svg, /stroke-width="1.75"/);
      assert.match(svg, /fill="none"/);
      assert.match(svg, /width="20" height="20"/);
      // No fill other than "none": the drawing is made of lines only.
      assert.doesNotMatch(svg, /fill="(?!none")/, `the “${name}” icon has a fill`);
      assert.ok(svg.includes("<path") || svg.includes("<rect") || svg.includes("<circle"), `the “${name}” icon is empty`);
    }
    assert.deepEqual([...ICON_NAMES].sort(), [...KNOWN_ICONS].sort());
  });

  // The list also lives in docs/DESIGN.md, so the docs and the editor don't drift apart.
  test("docs/DESIGN.md lists exactly these names", () => {
    const design = readFileSync(join(PROJECT_ROOT, "docs", "DESIGN.md"), "utf8");
    const listed = /Known icon names: `([^`]+)`/.exec(design)?.[1].split(", ");
    assert.deepEqual([...(listed || [])].sort(), [...KNOWN_ICONS].sort());
  });

  test("an emoji or an unknown name has no SVG (the editor shows it as text)", () => {
    assert.equal(iconSvg("🧱"), null);
    assert.equal(iconSvg("constructor"), null);
    assert.equal(iconSvg(""), null);
    assert.ok(!isIcon("toString"));
  });

  test("every bundled block has a drawn icon (a name from the list)", async () => {
    const dir = join(PROJECT_ROOT, "components");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".js") && !f.endsWith(".server.js"))) {
      const comp = (await import(join(dir, file))).default;
      assert.ok(isIcon(comp.icon), `components/${file}: the “${comp.icon}” icon isn't drawn`);
    }
  });

  test("the tile: an unknown word gets the “block” icon; an emoji or a character stay text", () => {
    assert.equal(svgFor("text", 16), iconSvg("text", 16));
    assert.equal(svgFor("pizza"), iconSvg("block"));
    assert.equal(svgFor(" Big-Image "), iconSvg("block"));
    assert.equal(svgFor("🧱"), null);
    assert.equal(svgFor("★"), null);
    assert.equal(svgFor("ab"), null);
    assert.equal(svgFor(""), null);
    assert.equal(svgFor(null), null);
    assert.equal(svgFor('<img src=x onerror="alert(1)">'), null);
  });
});

// An icon drawing's box (without the line's width): the points on the outline, with the arcs and
// curves sampled. Enough for the <path>, <rect> and <circle> in block-icons.js.
function iconBox(svg) {
  const pts = [];
  const num = (s) => (s.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
  for (const [, x, y, w, hh] of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    pts.push([+x, +y], [+x + +w, +y + +hh]);
  }
  for (const [, cx, cy, r] of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) {
    pts.push([+cx - +r, +cy - +r], [+cx + +r, +cy + +r]);
  }
  for (const [, d] of svg.matchAll(/<path d="([^"]+)"/g)) {
    let x = 0, y = 0, sx = 0, sy = 0;
    for (const [, cmd, args] of d.matchAll(/([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g)) {
      const n = num(args);
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const step = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 }[C];
      if (C === "Z") { x = sx; y = sy; continue; }
      for (let i = 0; i + step <= n.length; i += step) {
        const a = n.slice(i, i + step);
        const ox = rel ? x : 0, oy = rel ? y : 0;
        if (C === "H") x = ox + a[0];
        else if (C === "V") y = oy + a[0];
        else if (C === "A") {
          // The arc: its center from the endpoint form (SVG, appendix F.6), then 32 points on it.
          const [rx0, ry0, , large, sweep] = a;
          const x2 = ox + a[5], y2 = oy + a[6];
          const dx = (x - x2) / 2, dy = (y - y2) / 2;
          let rx = Math.abs(rx0), ry = Math.abs(ry0);
          const lam = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
          if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
          const sgn = large === sweep ? -1 : 1;
          const k = sgn * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx) / (rx * rx * dy * dy + ry * ry * dx * dx)));
          const cx = (k * rx * dy) / ry + (x + x2) / 2, cy = (-k * ry * dx) / rx + (y + y2) / 2;
          const t1 = Math.atan2((y - cy) / ry, (x - cx) / rx);
          let dt = Math.atan2((y2 - cy) / ry, (x2 - cx) / rx) - t1;
          if (sweep && dt < 0) dt += 2 * Math.PI;
          if (!sweep && dt > 0) dt -= 2 * Math.PI;
          for (let j = 1; j <= 32; j++) pts.push([cx + rx * Math.cos(t1 + (dt * j) / 32), cy + ry * Math.sin(t1 + (dt * j) / 32)]);
          x = x2; y = y2;
        } else if (C === "C" || C === "S" || C === "Q") {
          // The curves stay inside the box of their control points: a covering bound, enough here.
          for (let j = 0; j < a.length; j += 2) pts.push([ox + a[j], oy + a[j + 1]]);
          x = ox + a.at(-2); y = oy + a.at(-1);
        } else {
          x = ox + a[0]; y = oy + a[1];
          if (C === "M" && i === 0) { sx = x; sy = y; }
        }
        pts.push([x, y]);
      }
    }
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

describe("the icons, drawn by the same hand (docs/DESIGN.md)", () => {
  test("every drawing sits between 3 and 21 and has its center close to (12, 12)", () => {
    for (const name of ICON_NAMES) {
      const { x0, y0, x1, y1 } = iconBox(iconSvg(name));
      const where = `the “${name}” icon: ${[x0, y0, x1, y1].map((v) => v.toFixed(2)).join(" ")}`;
      assert.ok(x0 >= 2.9 && y0 >= 2.9 && x1 <= 21.1 && y1 <= 21.1, `${where} goes out of the 3–21 square`);
      assert.ok(Math.abs((x0 + x1) / 2 - 12) <= 0.75 && Math.abs((y0 + y1) / 2 - 12) <= 0.75, `${where} isn't centered`);
      // Not too small either: at least one side of 12 (otherwise it looks weaker than the others in the tile).
      assert.ok(Math.max(x1 - x0, y1 - y0) >= 12, `${where} is too small`);
    }
  });

  test("the interface icons (ui-icons.js): only lines, in the 24 square; the canvas uses the same ones", () => {
    for (const [name, d] of Object.entries(UI_ICONS)) {
      const svg = svgUi(name, 16);
      assert.match(svg, /viewBox="0 0 24 24" width="16" height="16" fill="none"/);
      assert.doesNotMatch(d, /fill=/, name);
      const { x0, y0, x1, y1 } = iconBox(d);
      assert.ok(x0 >= 0.5 && y0 >= 0.5 && x1 <= 23.5 && y1 <= 23.5, `“${name}” goes out of the square`);
    }
    assert.equal(svgUi("constructor"), svgUi("no-such-icon"), "an unknown name draws nothing");
    const canvas = readFileSync(join(PROJECT_ROOT, "editor", "canvas.js"), "utf8");
    assert.ok(canvas.includes('from "/_editor/ui-icons.js"') && !canvas.includes("<path d="), "the canvas has no copy of the drawings");
  });

  test("the shapes of a cell on the canvas have icons with the same names as in the core", () => {
    for (const shape of ["rect", "rounded", "circle"]) assert.ok(Object.hasOwn(UI_ICONS, shape), shape);
  });

  test("“Bring to front”, “Send to back” and “Duplicate” have different drawings (not just a dashed line)", () => {
    const [front, back, duplicate] = ["front", "back", "duplicate"].map((n) => UI_ICONS[n].replace(/ stroke-dasharray="[^"]*"/g, ""));
    assert.ok(front !== back && front !== duplicate && back !== duplicate);
    for (const name of ["front", "back"]) {
      assert.ok(!UI_ICONS[name].includes("stroke-dasharray"), name);
      const { x0, y0, x1, y1 } = iconBox(UI_ICONS[name]);
      assert.ok(x0 >= 2.9 && y0 >= 2.9 && x1 <= 21.1 && y1 <= 21.1, name);
      assert.ok(Math.abs((x0 + x1) / 2 - 12) <= 0.75 && Math.abs((y0 + y1) / 2 - 12) <= 0.75, `${name} isn't centered`);
    }
  });

  test("iconBox measures an arc, a rectangle and a circle right", () => {
    assert.deepEqual(iconBox('<path d="M4 12a8 8 0 0 1 16 0"/>'), { x0: 4, y0: 4, x1: 20, y1: 12 });
    assert.deepEqual(iconBox('<rect x="3" y="5" width="18" height="14" rx="2"/>'), { x0: 3, y0: 5, x1: 21, y1: 19 });
    assert.deepEqual(iconBox('<circle cx="12" cy="12" r="9"/>'), { x0: 3, y0: 3, x1: 21, y1: 21 });
    assert.deepEqual(iconBox('<path d="M4 7h16v10H4z"/>'), { x0: 4, y0: 7, x1: 20, y1: 17 });
  });
});

describe("the palette's categories (editor/registry.js)", () => {
  test("the 7 categories, in the contract's order; an unknown one comes right after “My blocks”", () => {
    assert.deepEqual(ORDER, ["My blocks", "Sections", "Text & images", "Lists", "Contact", "Members", "Page"]);
    const mixed = ["Page", "Acme Studio", "Text & images", "Members", "My blocks", "Atelier", "Lists", "Contact", "Sections"];
    assert.deepEqual([...mixed].sort(compareCategories), [
      "My blocks",
      "Acme Studio",
      "Atelier",
      "Sections",
      "Text & images",
      "Lists",
      "Contact",
      "Members",
      "Page",
    ]);
  });

  test("categoryOf: capitals and accents don't matter; no category, or the template's old name, is “My blocks”", () => {
    assert.equal(categoryOf({ category: "sections" }), "Sections");
    assert.equal(categoryOf({ category: " TEXT & IMAGES " }), "Text & images");
    assert.ok(compareCategories(categoryOf({ category: "sections" }), "Lists") < 0);
    for (const category of [undefined, "", "  ", "Componentele mele", "Blocurile mele", "BLOCURILE MELE", "my blocks"]) {
      assert.equal(categoryOf({ category }), "My blocks", String(category));
    }
    assert.equal(categoryOf({ category: "Acme Studio" }), "Acme Studio");
    assert.equal(categoryOf(null), "My blocks");
  });

  test("in a category: Hero first, the programmer's blocks after the bundled ones, Embed last", () => {
    const page = [
      { id: "embed", name: "Embed" },
      { id: "spacer", name: "Spacer" },
      { id: "my-strip", name: "Strip" },
      { id: "navbar", name: "Navbar" },
      { id: "columns", name: "Columns" },
      { id: "other-block", name: "Another one" },
    ];
    assert.deepEqual([...page].sort(compareBlocks).map((b) => b.id), ["navbar", "columns", "spacer", "other-block", "my-strip", "embed"]);
    const sections = ["logos", "cards", "stats", "hero", "cta", "image-text"].map((id) => ({ id, name: id }));
    assert.deepEqual([...sections].sort(compareBlocks).map((b) => b.id), ["hero", "image-text", "cards", "cta", "stats", "logos"]);
  });
});

describe("the gaps between blocks (editor/gaps.js)", () => {
  const R = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

  test("blocks one under another: horizontal lines across the slot; a block without a box is skipped", () => {
    const rects = [R(0, 0, 300, 100), R(0, 120, 300, 80), R(0, 0, 0, 0), R(0, 220, 200, 50)];
    const u = gaps.union(rects);
    assert.deepEqual(u, R(0, 0, 300, 270));
    assert.deepEqual(gaps.gapLine(rects, 0, u), { vertical: false, x: 0, y: 0, size: 300 });
    assert.deepEqual(gaps.gapLine(rects, 1, u), { vertical: false, x: 0, y: 110, size: 300 });
    assert.deepEqual(gaps.gapLine(rects, 4, u), { vertical: false, x: 0, y: 270, size: 300 });
    // Next to a block without a box, the line sits on the edge of the neighbor that has one.
    assert.deepEqual(gaps.gapLine(rects, 2, u), { vertical: false, x: 0, y: 200, size: 300 });
    assert.deepEqual(gaps.gapLine(rects, 3, u), { vertical: false, x: 0, y: 220, size: 300 });
    assert.equal(gaps.gapLine([R(0, 0, 0, 0)], 0, R(0, 0, 10, 10)), null, "without neighbors with a box, no line");
  });

  test("blocks on the same row (columns, grids): vertical lines between them and at the ends", () => {
    const rects = [R(0, 0, 100, 200), R(120, 10, 100, 180), R(240, 0, 100, 150)];
    const u = gaps.union(rects);
    assert.ok(gaps.sameRow(rects[0], rects[1]));
    assert.ok(!gaps.sameRow(R(0, 0, 100, 100), R(0, 120, 100, 100)));
    assert.deepEqual(gaps.gapLine(rects, 0, u), { vertical: true, x: 0, y: 0, size: 200 });
    assert.deepEqual(gaps.gapLine(rects, 1, u), { vertical: true, x: 110, y: 0, size: 200 });
    assert.deepEqual(gaps.gapLine(rects, 3, u), { vertical: true, x: 340, y: 0, size: 150 });
    assert.deepEqual(gaps.lineRect({ vertical: true, x: 110, y: 0, size: 200 }), { left: 110, right: 110, top: 0, bottom: 200 });
  });

  test("pickGap: the nearest; at nearly equal distances the deepest; hysteresis without flicker", () => {
    const page = { slot: "root", index: 1, depth: 0, rect: { left: 0, right: 300, top: 100, bottom: 100 } };
    const inSection = { slot: "s:c", index: 0, depth: 1, rect: { left: 20, right: 280, top: 106, bottom: 106 } };
    const far = { slot: "root", index: 2, depth: 0, rect: { left: 0, right: 300, top: 400, bottom: 400 } };
    const all = [page, inSection, far];
    assert.equal(gaps.pickGap(all, 150, 101), inSection, "at 1 px and at 5 px: the deeper area wins (magnet)");
    assert.equal(gaps.pickGap(all, 150, 390), far);
    assert.equal(gaps.pickGap([], 0, 0), null);
    // The previous target stays until another one is clearly closer.
    assert.equal(gaps.pickGap([page, far], 150, 247, { slot: "root", index: 1 }), page);
    assert.equal(gaps.pickGap([page, far], 150, 260, { slot: "root", index: 1 }), far);
    assert.equal(gaps.distance(R(0, 0, 10, 10), 13, 14), 5);
    assert.equal(gaps.distance(R(0, 0, 10, 10), 5, 5), 0);
  });
});

describe("the list cards in Settings (editor/fields.js)", () => {
  const events = { time: { type: "text" }, title: { type: "text" }, text: { type: "longtext" } };
  const social = {
    network: { type: "choice", options: [{ value: "facebook", label: "Facebook" }, { value: "instagram", label: "Instagram" }] },
    link: { type: "link" },
  };
  const formFields = { label: { type: "text" }, type: { type: "choice", options: [{ value: "text", label: "Short text" }, { value: "phone", label: "Phone" }] } };

  test("the title: first a title field, then the choice (its label), then the first text; otherwise “Item N”", () => {
    assert.equal(itemTitle({ time: "19:00", title: "A **jazz** evening" }, events, 0), "A jazz evening");
    assert.equal(itemTitle({ network: "facebook", link: "https://www.facebook.com/x" }, social, 0), "Facebook");
    assert.equal(itemTitle({ label: "Phone number", type: "phone" }, formFields, 0), "Phone number");
    assert.equal(itemTitle({ type: "phone" }, formFields, 0), "Phone");
    assert.equal(itemTitle({ time: "18:00" }, events, 1), "18:00");
    assert.equal(itemTitle({}, social, 2), "Item 3");
    assert.equal(itemTitle({ network: "constructor" }, social, 0), "Item 1");
  });

  test("in Romanian: the choice's label from the component's i18n.ro, and “Element N”", () => {
    const comp = { props: { links: { type: "list", label: "Networks", fields: social } }, i18n: { ro: { props: { links: { label: "Rețele", fields: { network: { label: "Rețea", options: { facebook: "Facebook (pagina)" } } } } } } } };
    setLang("ro");
    try {
      const fields = blockFields(comp).links.fields;
      assert.equal(itemTitle({ network: "facebook" }, fields, 0), "Facebook (pagina)");
      assert.equal(itemTitle({ network: "instagram" }, fields, 0), "Instagram", "an option without a Romanian label stays English");
      assert.equal(itemTitle({}, fields, 4), "Element 5");
    } finally {
      setLang("en");
    }
  });

  test("every list of a bundled block gets a title for its items, without errors", async () => {
    const dir = join(PROJECT_ROOT, "components");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".js") && !f.endsWith(".server.js"))) {
      const comp = (await import(join(dir, file))).default;
      for (const [key, field] of Object.entries(comp.props || {})) {
        if (field?.type !== "list") continue;
        const items = Array.isArray(field.default) ? field.default : [{}];
        items.forEach((item, i) => {
          const title = itemTitle(item, field.fields || {}, i);
          assert.ok(typeof title === "string" && title.length, `components/${file}: ${key}[${i}]`);
        });
      }
    }
  });
});

describe("the preview card (editor/preview.js)", () => {
  test("cardText: the description + the tip and the first 4 labels of the settings, then “+N”", () => {
    const comp = {
      tip: "A tip.",
      props: { a: { label: "Title" }, b: { label: "Subtitle" }, c: { label: "Button" }, d: { label: "Image" }, e: {}, f: {}, g: {} },
    };
    assert.deepEqual(cardText({ description: "A description.", tip: "A tip." }, comp), {
      description: "A description.",
      tip: "A tip.",
      settings: "Title · Subtitle · Button · Image +3",
    });
    assert.deepEqual(cardText({ description: "" }, { props: { x: { label: "X" } } }), { description: "", tip: "", settings: "X" });
    assert.deepEqual(cardText({}, {}), { description: "", tip: "", settings: "" });
  });

  test("cardText in Romanian: the labels from i18n.ro, English where it has none", () => {
    const comp = { props: { a: { label: "Title" }, b: { label: "Image" } }, i18n: { ro: { props: { a: { label: "Titlu" } } } } };
    setLang("ro");
    try {
      assert.equal(cardText({}, comp).settings, "Titlu · Image");
    } finally {
      setLang("en");
    }
  });

  test("cardNote: what a click does, by the place the card comes from", () => {
    assert.equal(cardNote("palette", { selected: true }), "Drag it onto the page or click: it goes after the selected block.");
    assert.equal(cardNote("palette", { selected: false }), "Drag it onto the page or click: it goes at the end of the page.");
    assert.equal(cardNote("palette", { kind: "header" }), "Drag it onto the page or click: it goes at the end of the header.");
    assert.equal(cardNote("palette", { kind: "footer" }), "Drag it onto the page or click: it goes at the end of the footer.");
    assert.equal(cardNote("palette"), "Drag it onto the page or click: it goes at the end of the page.");
    assert.equal(cardNote("menu", { selected: true }), "Click or press Enter: it goes where you pressed +.");
    setLang("ro");
    try {
      assert.equal(cardNote("palette", { selected: true }), "Trage-l în pagină sau dă clic: intră după blocul selectat.");
      assert.equal(cardNote("palette", { kind: "header" }), "Trage-l în pagină sau dă clic: intră la sfârșitul antetului.");
    } finally {
      setLang("en");
    }
  });

  test("previewPage: a single block, with fillers only from types that exist", () => {
    assert.deepEqual(previewPage("text"), { blocks: [{ id: "preview", type: "text", props: {}, slots: {} }] });
    const p = previewPage("columns", (type) => type === "text");
    assert.deepEqual(p.blocks[0].slots, { c1: [], c2: [{ id: "u2", type: "text", props: {} }] });
  });

  test("the FILLERS fit the bundled containers: their areas exist", async () => {
    for (const [type, slots] of Object.entries(FILLERS)) {
      const file = join(PROJECT_ROOT, "components", `${type}.js`);
      if (!existsSync(file)) continue; // the container doesn't exist (yet)
      const comp = (await import(file)).default;
      for (const name of Object.keys(slots)) assert.ok(Object.hasOwn(comp.slots || {}, name), `components/${type}.js has no “${name}” area`);
    }
  });

  test("the FILLERS display in editor mode without errors, with the bundled components", async () => {
    for (const [type, slots] of Object.entries(FILLERS)) {
      const types = [type, ...Object.values(slots).flat().map((k) => k.type)];
      const comps = {};
      for (const t of types) {
        const file = join(PROJECT_ROOT, "components", `${t}.js`);
        if (existsSync(file)) comps[t] = (await import(file)).default;
      }
      if (!comps[type]) continue; // the container doesn't exist (yet)
      const parts = renderParts({ page: previewPage(type, (t) => Boolean(comps[t])), site: {}, components: comps, mode: "editor" });
      assert.doesNotMatch(parts.body, /b-error|b-missing/, `the filler for “${type}” doesn't display cleanly`);
      assert.ok(parts.body.includes('data-id="preview"'));
    }
  });
});

// ---- The Free canvas, from the editor's side (docs/ARCHITECTURE.md, “The Free canvas”) ----

const canvasComp = {
  name: "Canvas",
  slots: { content: "Content" },
  html: (p, ctx) => html`<div>${ctx.slot("content", { free: true })}</div>`,
};
const getC = (type) => (type === "canvas" ? canvasComp : components[type] || null);
const A = (x, y, w, h, extra = {}) => ({ x, y, w, h, z: 0, shape: "rect", fill: false, ...extra });
// A placement is "clean" if safePlacement has nothing left to repair in it.
const clean = (a) => assert.deepEqual(safePlacement(a), a, `placement not repaired: ${JSON.stringify(a)}`);
const HOSTILE = ["1;background:url(javascript:x)", -5, 1e9, 2.7, NaN, Infinity, {}, null, undefined, "</style><script>", [], true];

describe("the grid: the place on the canvas (editor/grid.js)", () => {
  test("adjust takes only the known keys and repairs any hostile value", () => {
    for (const v of HOSTILE) {
      const a = grid.adjust(A(3, 2, 4, 4), { x: v, y: v, w: v, h: v, z: v, shape: v, fill: v, style: "color:red", __proto__: { x: 99 } });
      clean(a);
      assert.ok(a.x + a.w - 1 <= 12);
      assert.ok(["rect", "rounded", "circle"].includes(a.shape));
      assert.equal(typeof a.fill, "boolean");
      assert.equal(Object.keys(a).length, 7);
    }
    // A getter that throws breaks nothing: the key stays as it was.
    const bad = Object.defineProperty({}, "x", { enumerable: true, get() { throw new Error("x"); } });
    assert.deepEqual(grid.adjust(A(3, 2, 4, 4), bad), A(3, 2, 4, 4));
    assert.deepEqual(grid.adjust(A(3, 2, 4, 4), null), A(3, 2, 4, 4));
    assert.deepEqual(grid.adjust(A(3, 2, 4, 4), { shape: "circle", fill: true, w: "5" }), A(3, 2, 5, 4, { shape: "circle", fill: true }));
  });

  test("placeUnder: the cell snapped to the grid, under the cursor, whole on the 12 columns", () => {
    assert.deepEqual(grid.placeUnder(5.3, 3.1, 4, 4), { x: 4, y: 2 }); // the middle of the cell under the cursor
    assert.deepEqual(grid.placeUnder(5.3, 3.1, 4, 4, 0.5, 0.5), { x: 6, y: 4 }); // held by its corner
    assert.deepEqual(grid.placeUnder(-3, -9, 4, 4), { x: 1, y: 1 });
    assert.deepEqual(grid.placeUnder(20, 999, 4, 4), { x: 9, y: 200 });
    assert.deepEqual(grid.placeUnder(20, 3, 12, 2), { x: 1, y: 3 }); // 12 columns: the whole row
    assert.deepEqual(grid.placeUnder(NaN, Infinity, 4, 4), { x: 1, y: 1 });
  });

  test("resize: each handle moves only its edges and snaps to the grid", () => {
    const a = A(3, 2, 4, 4); // columns 3–6, rows 2–5
    const r = (m, u, v, shift) => {
      const out = grid.resize(a, m, u, v, shift);
      return [out.x, out.y, out.w, out.h];
    };
    assert.deepEqual(r("e", 8.4, 0), [3, 2, 6, 4]);
    assert.deepEqual(r("w", 0.6, 99), [2, 2, 5, 4]);
    assert.deepEqual(r("s", 0, 7.2), [3, 2, 4, 6]);
    assert.deepEqual(r("n", 99, 0.4), [3, 1, 4, 5]);
    assert.deepEqual(r("se", 9.2, 9.6), [3, 2, 7, 9]);
    assert.deepEqual(r("nw", 1, 0), [2, 1, 5, 5]);
    assert.deepEqual(r("ne", 9.2, 9.6), [3, 5, 7, 1]); // past the opposite edge: at least one cell
    assert.deepEqual(r("sw", 9.2, 9.6), [6, 2, 1, 9]);
    // It doesn't leave the grid and doesn't go past 60 rows.
    assert.deepEqual(r("e", 40, 0), [3, 2, 10, 4]);
    assert.deepEqual(r("w", -40, 0), [1, 2, 6, 4]);
    assert.deepEqual(r("s", 0, 500), [3, 2, 4, 60]);
    // An unknown handle is treated as "se", it doesn't throw.
    assert.deepEqual(r("<script>", 9.2, 9.6), [3, 2, 7, 9]);
  });

  test("resize with Shift: the proportions stay (a square stays a square), also near the edges", () => {
    const p = (a, m, u, v) => {
      const out = grid.resize(a, m, u, v, true);
      return [out.x, out.y, out.w, out.h];
    };
    assert.deepEqual(p(A(3, 2, 4, 4), "se", 9.2, 9.6), [3, 2, 9, 9]); // the side dragged more (down) leads
    assert.deepEqual(p(A(3, 2, 4, 4), "e", 8.4, 0), [3, 2, 6, 6]);
    assert.deepEqual(p(A(3, 2, 4, 4), "s", 0, 7.2), [3, 2, 6, 6]);
    assert.deepEqual(p(A(3, 2, 4, 4), "ne", 9.2, 9.6), [3, 1, 5, 5]); // the top stops at the first row
    assert.deepEqual(p(A(3, 2, 4, 4), "sw", 9.2, 9.6), [1, 2, 6, 6]); // the left stops at the first column
    assert.deepEqual(p(A(5, 7, 7, 10), "se", 13, 16), [5, 7, 8, 11]); // only to the right: 7 × 10 stays ~0.7
    assert.deepEqual(p(A(1, 1, 6, 3), "se", 40, 40), [1, 1, 12, 6]); // 2:1 against the right edge
    for (const m of grid.HANDLES) {
      for (const [u, v] of [[0, 0], [12, 200], [-50, -50], [6.5, 33.3], [NaN, NaN]]) {
        const out = grid.resize(A(4, 9, 5, 3), m, u, v, true);
        clean(out);
        assert.ok(out.x + out.w - 1 <= 12 && out.h <= 60 && out.w >= 1 && out.h >= 1);
      }
    }
  });

  test("moveBy and growBy (the arrow keys): one cell, always on the grid", () => {
    assert.deepEqual(grid.moveBy(A(3, 2, 4, 4), 1, 0), A(4, 2, 4, 4));
    assert.deepEqual(grid.moveBy(A(9, 1, 4, 4), 1, -1), A(9, 1, 4, 4)); // at the edge it goes no further
    assert.deepEqual(grid.moveBy(A(1, 200, 4, 4), -1, 1), A(1, 200, 4, 4));
    assert.deepEqual(grid.growBy(A(3, 2, 4, 4), 1, 1), A(3, 2, 5, 5));
    assert.deepEqual(grid.growBy(A(9, 2, 4, 1), 1, -1), A(9, 2, 4, 1)); // 12 columns, at least one row
    assert.deepEqual(grid.growBy(A(1, 2, 4, 60), 0, 1), A(1, 2, 4, 60));
    clean(grid.moveBy({ x: "1;x", y: -5 }, 1, 1));
  });

  test("gridPoint: the point in cells, with the gap between columns and the rows after the measured ones", () => {
    const geom = {
      columns: Array.from({ length: 12 }, (_, i) => ({ s: i * 96, w: 80 })),
      rows: [{ s: 0, w: 32 }, { s: 32, w: 50 }, { s: 82, w: 32 }],
      rowHeight: 32,
    };
    assert.deepEqual(grid.gridPoint(geom, 0, 0), { u: 0, v: 0 });
    assert.deepEqual(grid.gridPoint(geom, 40, 57), { u: 0.5, v: 1.5 }); // the grown row (50 px)
    assert.equal(grid.gridPoint(geom, 90, 0).u, 1); // in the gap between columns: the line on its right
    assert.equal(grid.gridPoint(geom, 0, 114 + 48).v, 4.5); // after the measured rows: 32 px each
    assert.equal(grid.gridPoint(geom, 1136 + 40, 0).u, 12.5);
    assert.equal(grid.gridPoint(geom, -40, -16).u, -0.5);
    assert.deepEqual(grid.gridPoint({}, 64, 64), { u: 2, v: 2 });
    assert.deepEqual(grid.cellRect(geom, A(2, 2, 2, 3)), { left: 96, top: 32, width: 176, height: 114 });
    assert.deepEqual(grid.cellRect(geom, A(1, 5, 1, 2)), { left: 0, top: 146, width: 80, height: 64 });
  });

  test("layers: “Bring to front” / “Send to back” only when they overlap; the others keep their order", () => {
    const list = [
      { id: "a", placement: A(1, 1, 6, 6) },
      { id: "b", placement: A(4, 4, 6, 6, { z: 1 }) },
      { id: "c", placement: A(11, 20, 2, 2) },
    ];
    assert.deepEqual(grid.layerMoves(list, "a"), { front: true, back: false });
    assert.deepEqual(grid.layerMoves(list, "b"), { front: false, back: true });
    assert.deepEqual(grid.layerMoves(list, "c"), { front: false, back: false }); // it touches nobody
    assert.deepEqual(grid.layerMoves(list, "no-such-block"), { front: false, back: false });
    assert.equal(grid.changeLayer(list, "a", "front"), true);
    assert.deepEqual(list.map((b) => b.placement.z), [1, 0, 0]); // a above b; c touches nobody
    assert.deepEqual(grid.layerMoves(list, "a"), { front: false, back: true });
    assert.equal(grid.changeLayer(list, "a", "front"), false); // already on top
    assert.equal(grid.changeLayer(list, "a", "back"), true);
    assert.deepEqual(list.map((b) => b.placement.z), [0, 1, 0]); // b above a
    assert.equal(grid.changeLayer(list, "a", "<script>"), false);
    for (const b of list) clean(b.placement);
    // Without z: the same rule as in the core (the row, the column, the order in the list) decides who's on top.
    const equal = [{ id: "x", placement: A(1, 2, 4, 4) }, { id: "y", placement: A(2, 1, 4, 4) }];
    assert.deepEqual(grid.layerMoves(equal, "x"), { front: false, back: true });
  });

  test("layers on a big canvas: 60 blocks (55 on top of each other) — “Bring to front” really brings the block on top", () => {
    const list = Array.from({ length: 55 }, (_, i) => ({ id: `b${i}`, placement: A(1, 1, 4, 4) }));
    for (let i = 0; i < 5; i++) list.push({ id: `s${i}`, placement: A(1, 10 + i * 5, 4, 4) });
    const top = () => grid.layerMoves(list, "b0");
    assert.deepEqual(top(), { front: true, back: false });
    assert.equal(grid.changeLayer(list, "b0", "front"), true);
    assert.deepEqual(top(), { front: false, back: true }, "b0 is above all the ones it sits on");
    assert.equal(grid.changeLayer(list, "b0", "front"), false);
    // The blocks on their own stay on layer 0; the layer doesn't go past 50.
    for (let i = 0; i < 5; i++) assert.equal(list.find((b) => b.id === `s${i}`).placement.z, 0);
    for (const b of list) clean(b.placement);
    // 60 blocks that don't touch: "Bring to front" has nothing to do.
    const apart = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, placement: A(1 + (i % 3) * 4, 1 + Math.floor(i / 3) * 4, 4, 4) }));
    assert.deepEqual(grid.layerMoves(apart, "p59"), { front: false, back: false });
  });

  test("placeArriving: 4 × 4 under the last block or at the chosen place, above what it touches; from another canvas it keeps its size", () => {
    const list = [{ id: "a", placement: A(1, 1, 6, 5, { z: 3 }) }];
    assert.equal(grid.bottomRow(list), 5);
    assert.equal(grid.bottomRow([]), 0);
    assert.deepEqual(grid.placeArriving(list, { id: "n" }), A(1, 6, 4, 4));
    assert.deepEqual(grid.placeArriving(list, { id: "n" }, { x: 3, y: 2 }), A(3, 2, 4, 4, { z: 4 }));
    assert.deepEqual(grid.placeArriving(list, { id: "n" }, { x: 12, y: "3" }), A(9, 3, 4, 4));
    const old = { id: "m", placement: A(2, 9, 3, 7, { z: 9, shape: "circle", fill: true }) };
    assert.deepEqual(grid.placeArriving(list, old, { x: 11, y: 1 }), A(10, 1, 3, 7, { shape: "circle", fill: true }));
    for (const v of HOSTILE) clean(grid.placeArriving(list, { id: "n", placement: v }, { x: v, y: v }));
    // An image or a video arrive filling their cell (the handles give exactly the size); from another canvas, as they were.
    assert.equal(grid.placeArriving(list, { id: "n", type: "image" }).fill, true);
    assert.equal(grid.placeArriving(list, { id: "n", type: "video" }).fill, true);
    assert.equal(grid.placeArriving(list, { id: "n", type: "text" }).fill, false);
    assert.equal(grid.placeArriving(list, { id: "n", type: "image", placement: { fill: false } }).fill, false);
  });

  test("sizeText: the label shown while resizing, in English or in Romanian", () => {
    assert.equal(grid.sizeText(A(1, 1, 1, 1)), "1 column × 1 row");
    assert.equal(grid.sizeText(A(1, 1, 6, 8)), "6 columns × 8 rows");
    setLang("ro");
    try {
      assert.equal(grid.sizeText(A(1, 1, 1, 1)), "1 coloană × 1 rând");
      assert.equal(grid.sizeText(A(1, 1, 6, 8)), "6 coloane × 8 rânduri");
      assert.equal(grid.sizeText(A(1, 1, 12, 25)), "12 coloane × 25 de rânduri");
    } finally {
      setLang("en");
    }
  });

  test("fuzz: any gesture gives a clean placement, whole on the grid", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const val = () => [rnd() * 40 - 10, Math.round(rnd() * 300) - 50, HOSTILE[Math.floor(rnd() * HOSTILE.length)]][Math.floor(rnd() * 3)];
    for (let i = 0; i < 1500; i++) {
      const a = { x: val(), y: val(), w: val(), h: val(), z: val() };
      const outs = [
        grid.resize(a, grid.HANDLES[i % 8], val(), val(), i % 2 === 0),
        grid.moveBy(a, Math.round(rnd() * 4 - 2), Math.round(rnd() * 4 - 2)),
        grid.growBy(a, Math.round(rnd() * 4 - 2), Math.round(rnd() * 4 - 2)),
        grid.adjust(a, { x: val(), w: val() }),
        grid.placeAt(a, val(), val()),
      ];
      for (const o of outs) {
        clean(o);
        assert.ok(o.x + o.w - 1 <= 12);
      }
    }
  });
});

describe("the Free canvas in the tree (freeSlots, positions, moveTo, insertTo)", () => {
  const docCanvas = () => ({
    blocks: [
      { id: "t", type: "text", props: {} },
      { id: "p", type: "canvas", props: {}, slots: { content: [{ id: "a", type: "text", placement: A(1, 1, 6, 5) }, { id: "b", type: "text", placement: A(5, 3, 4, 4, { z: 1 }) }] } },
      { id: "u", type: "text", props: {} },
      { id: "q", type: "canvas", props: {}, slots: { content: [] } },
    ],
  });

  test("freeSlots: only the areas displayed with { free: true }, not the hidden ones or those of a broken component", () => {
    assert.deepEqual([...freeSlots(docCanvas(), getC)].sort(), ["p:content", "q:content"]);
    const hidden = { blocks: [{ id: "k", type: "columns", props: { count: "2" }, slots: { c3: [{ id: "p", type: "canvas", props: {} }] } }] };
    assert.deepEqual([...freeSlots(hidden, getC)], []);
    const broken = { name: "R", slots: { z: "Z" }, html: () => { throw new Error("x"); } };
    assert.deepEqual([...freeSlots({ blocks: [{ id: "r", type: "r", props: {} }] }, () => broken)], []);
    // Only `free === true` counts, as in the core.
    const almost = { slots: { z: "Z" }, html: (p, ctx) => html`${ctx.slot("z", { free: "true" })}` };
    assert.deepEqual([...freeSlots({ blocks: [{ id: "r", type: "r", props: {} }] }, () => almost)], []);
  });

  test("positions: a canvas is a single gap; the blocks on it have no gaps between them", () => {
    const all = positions(docCanvas(), getC);
    assert.deepEqual(all.filter((g) => g.slot === "p:content"), [{ slot: "p:content", index: 2, free: true }]);
    assert.deepEqual(all.filter((g) => g.slot === "q:content"), [{ slot: "q:content", index: 0, free: true }]);
    const doc = docCanvas();
    const loc = { key: "p:content", index: 1 };
    assert.equal(all[positionIndex(all, loc)].slot, "p:content");
    assert.equal(positionIndex(positions(doc, getC, {}, { except: "b" }), loc), 2);
  });

  test("Alt+Up/Down: goes onto the canvas under the last block and off it without a placement", () => {
    const doc = docCanvas();
    assert.ok(moveStep(doc, "t", 1, getC));
    const arrived = doc.blocks[0].slots.content.find((b) => b.id === "t");
    assert.deepEqual(arrived.placement, A(1, 7, 4, 4)); // under “a” (rows 1–5) and “b” (3–6)
    assert.ok(moveStep(doc, "t", 1, getC)); // it leaves, after the canvas
    assert.deepEqual(doc.blocks.map((b) => b.id), ["p", "t", "u", "q"]);
    assert.equal("placement" in doc.blocks[1], false);
    assert.ok(moveStep(doc, "t", -1, getC)); // back onto the canvas
    assert.ok(moveStep(doc, "t", -1, getC)); // and off it, above it
    assert.deepEqual(doc.blocks.map((b) => b.id), ["t", "p", "u", "q"]);
    assert.equal("placement" in doc.blocks[0], false);
    // A block on the canvas leaves with Alt+Up, above it.
    assert.ok(moveStep(doc, "a", -1, getC));
    assert.deepEqual(doc.blocks.map((b) => b.id), ["t", "a", "p", "u", "q"]);
    assert.equal("placement" in doc.blocks[1], false);
  });

  test("moveTo on the same canvas: only the place changes, the size and the layer stay; in place = nothing", () => {
    const doc = docCanvas();
    assert.ok(moveTo(doc, "b", "p:content", 0, { free: true, at: { x: 11, y: "9" } }));
    const b = doc.blocks[1].slots.content[1];
    assert.deepEqual(b.placement, A(9, 9, 4, 4, { z: 1 })); // x stopped so the 4 columns fit
    assert.deepEqual(doc.blocks[1].slots.content.map((k) => k.id), ["a", "b"]); // the order doesn't matter
    assert.equal(moveTo(doc, "b", "p:content", 0, { free: true, at: { x: 9, y: 9 } }), false);
    assert.equal(moveTo(doc, "b", "p:content", 0, { free: true }), false);
    for (const v of HOSTILE) {
      moveTo(doc, "b", "p:content", 0, { free: true, at: { x: v, y: v } });
      clean(b.placement);
      assert.equal(b.placement.w, 4);
    }
  });

  test("moveTo: from one canvas to another it keeps its size; on the page the placement is removed; it doesn't go into itself", () => {
    const doc = docCanvas();
    assert.ok(moveTo(doc, "a", "q:content", 0, { free: true, at: { x: 2, y: 3 } }));
    assert.deepEqual(doc.blocks[3].slots.content[0].placement, A(2, 3, 6, 5));
    assert.ok(moveTo(doc, "a", "root", 1, { free: false }));
    assert.deepEqual(doc.blocks.map((b) => b.id), ["t", "a", "p", "u", "q"]);
    assert.equal("placement" in doc.blocks[1], false);
    // A canvas can't be put on itself.
    assert.equal(moveTo(doc, "p", "p:content", 0, { free: true, at: { x: 1, y: 1 } }), false);
  });

  test("insertTo: a new block on a canvas gets a placement (under the last one or at the chosen place), elsewhere it has none", () => {
    const doc = docCanvas();
    const fresh = { id: "n", type: "text", props: {}, placement: { x: 1 } };
    assert.ok(insertTo(doc, "root", 0, fresh));
    assert.equal("placement" in fresh, false);
    const onIt = { id: "m", type: "text", props: {} };
    assert.ok(insertTo(doc, "q:content", 0, onIt, { free: true }));
    assert.deepEqual(onIt.placement, A(1, 1, 4, 4));
    const over = { id: "o", type: "text", props: {} };
    assert.ok(insertTo(doc, "p:content", 0, over, { free: true, at: { x: 4, y: 2 } }));
    assert.deepEqual(over.placement, A(4, 2, 4, 4, { z: 2 })); // above “a” and “b”
    assert.equal(doc.blocks[2].slots.content.at(-1), over);
  });
});
