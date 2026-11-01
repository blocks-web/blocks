// The editor's canvas. It runs in the iframe, with its own window and document, so the components'
// js(el, p, api) see the page exactly as on the site.
//
// The editor (the parent window) uses it through window.blocksCanvas:
//   connect(hooks)              gets back: select, zone, action, insert, pointerDown, keydown, hover,
//                               dblclick, rendered, placement (a resized cell, at the end)
//   render(json)                displays { page, zones, site, comps: { id: url }, broken: { id: message }, path, emptyTitle, kind }
//   select(id) / hover(id)      the outline of the selected block / of the one under the mouse
//   dragStart(id) / dropAt(x, y) → { slot, index, label, free, at, ghost } / clearDrop() / dragEnd(keep)
//   scrollToBlock(id) / scrollBy(dy) / suppressClick() / flash(id) / isStacked(id) / scale(s)
//
// The data passes between the windows as JSON text, so we don't mix objects from different realms.
// When it's ready, the canvas fires the "blocks-ready" event on its own iframe (window.frameElement),
// not through a global variable: the editor can have several canvases (e.g. the palette's thumbnail).

import { COLUMNS, ESSENTIAL_CSS, LIMITS, renderParts, safePlacement, siteFiles, themeCss } from "/core/render.js";
import { escape as escapeHtml } from "/core/html.js";
import { start } from "/core/runtime.js";
import { svgFor } from "/_editor/block-icons.js";
import { svgUi } from "/_editor/ui-icons.js";
import { gapLine, isEmptyRect, lineRect, pickGap, union } from "/_editor/gaps.js";
import { bottomRow, cellRect, DEFAULT_SIZE, FREE_ROWS, gridPoint, HANDLES, layerMoves, placeUnder, resize, sizeText } from "/_editor/grid.js";
import { blockText, slotLabel, t, translateStatic } from "/_editor/i18n.js";

translateStatic(document);

const themeEl = document.getElementById("b-theme");
const cssEl = document.getElementById("b-css");

let hooks = {};
let runtime = null; // the api start() returned, stopped before every display
const loaded = new Map(); // id → { url, comp }
let components = {};
let index = new Map(); // id → the block's wrapper (only the document's blocks, not the zones')
let selectedId = null;
let hoverId = null;
let hoverZone = null;
let dragId = null;
let dragging = false;
let activeEmpty = null;
let pendingScroll = null;
let suppress = false;
let emptyTitle = t("The page is empty."); // the title of the page's empty state (the editor says if it's a page or a zone)
let kind = "page"; // what is being edited: "page" | "header" | "footer" (for the "At the start of the page" pill)
let plusTarget = null; // { slot, index } for the "+" under the mouse
let flashId = null; // the block that flashes briefly (just put on the page)
let flashStart = null;
let uiZoom = 1; // how much the tools grow (the bar, the handles, the labels) when the page is shown scaled down

// ---- The icons for the selected block's bar: the same as in the editor (ui-icons.js) ----
const SVG = (name) => svgUi(name);

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

// The block's name as the editor shows it (in the editor's language).
const nameOf = (type) => (components[type] && blockText(components[type], "name")) || String(type || "") || t("Block");

// ---- The outlines layer (it takes no clicks, except for the selected block's bar and "+") ----
const ui = el("div");
ui.id = "b-ui";
ui.setAttribute("aria-hidden", "true");
const hoverBox = el("div", "b-ui-box b-ui-hover");
const hoverTag = el("span", "b-ui-tag");
hoverBox.append(hoverTag);
const selBox = el("div", "b-ui-box b-ui-sel");
const bar = el("div", "b-ui-bar");
const grip = el("span", "b-ui-grip");
grip.title = t("Drag to move the block");
// On a canvas, "Move up / down" make room for the layer buttons (the block moves there by dragging or with the arrows).
//   [action, icon, title]
const TOOLS = [
  ["parent", "parent", t("Select the block it's in")],
  ["up", "up", t("Move up (Alt+↑; also into and out of other blocks)")],
  ["down", "down", t("Move down (Alt+↓; also into and out of other blocks)")],
  ["front", "front", t("Bring to front")],
  ["back", "back", t("Send to back")],
  ["duplicate", "duplicate", t("Duplicate")],
  ["remove", "trash", t("Delete")],
];
bar.append(grip, el("span", "b-ui-sep"));
for (const [name, ic, title] of TOOLS) {
  const b = el("button", "", SVG(ic));
  b.type = "button";
  b.title = title;
  b.setAttribute("aria-label", title);
  b.dataset.tool = name;
  bar.append(b);
}
selBox.append(bar);
// The 8 handles of a block on a canvas (corners and edges) and the label with its size, while resizing.
for (const m of HANDLES) {
  const handle = el("span", `b-ui-handle b-ui-handle--${m}`);
  handle.dataset.handle = m;
  selBox.append(handle);
}
const sizeTag = el("span", "b-ui-position b-ui-size");
selBox.append(sizeTag);
const zoneBox = el("div", "b-ui-box b-ui-zone");
const zoneLabel = el("span", "b-ui-zone-label");
zoneBox.append(zoneLabel);
const line = el("div", "b-ui-line");
const flashBox = el("div", "b-ui-box b-ui-flash");
const plusBox = el("div", "b-ui-plus");
const plusBtn = el("button", "", SVG("plus"));
plusBtn.type = "button";
plusBtn.title = t("Add a block here");
plusBtn.setAttribute("aria-label", t("Add a block here"));
plusBtn.dataset.plus = "1";
plusBox.append(plusBtn);
// The canvas during a drag: the grid's lines (barely visible) and the target box, with its place.
const gridBox = el("div", "b-ui-grid");
const targetBox = el("div", "b-ui-box b-ui-target");
const targetTag = el("span", "b-ui-position");
targetBox.append(targetTag);
ui.append(gridBox, zoneBox, flashBox, hoverBox, plusBox, targetBox, selBox, line);
const notes = []; // the "On a phone, …" note above each stacked canvas

// ---- Geometry ----
// The wrappers have display: contents (no box). A Range on them would measure only the text when
// the direct child is a wrapper too (zone → slot → block), so we go down through the wrappers to the
// first elements with a box and join their rectangles.
const EMPTY = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

function collectRects(node, out) {
  if (node.nodeType === 3) {
    if (!node.data.trim()) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    out.push(range.getBoundingClientRect());
    return;
  }
  if (node.nodeType !== 1) return;
  const display = getComputedStyle(node).display;
  if (display === "none") return;
  if (display !== "contents") {
    out.push(node.getBoundingClientRect());
    return;
  }
  for (const child of node.childNodes) collectRects(child, out);
}

function rectOf(node) {
  const rects = [];
  collectRects(node, rects);
  return union(rects) || EMPTY;
}

// On a canvas, the block's outline is its cell (the handles pull on it), not only the content in it.
function boxOf(node) {
  const cell = cellOf(node);
  if (cell) {
    const r = cell.getBoundingClientRect();
    if (!isEmptyRect(r)) return r;
  }
  return rectOf(node);
}

// The cell of a block on an editable canvas (its direct parent), or null.
function cellOf(node) {
  const cell = node?.parentElement;
  return cell && cell.dataset?.cell !== undefined && cell.dataset.cell === node.dataset?.id ? cell : null;
}

function place(box, r, base) {
  if (isEmptyRect(r)) {
    if (box.style.display !== "none") box.style.display = "none";
    box._key = "";
    return;
  }
  const x = Math.round(r.left - base.left);
  const y = Math.round(r.top - base.top);
  const w = Math.max(Math.round(r.width), 4);
  const hgt = Math.max(Math.round(r.height), 4);
  const key = `${x},${y},${w},${hgt}`;
  if (box._key === key) return;
  box._key = key;
  box.style.display = "block";
  box.style.transform = `translate(${x}px, ${y}px)`;
  box.style.width = `${w}px`;
  box.style.height = `${hgt}px`;
  // Near the top edge, or right under the shared header, there's no room for a label or a bar
  // above (it would cover the site's menu): we put them inside.
  const above = 42 * uiZoom;
  box.classList.toggle("b-ui-inside", y < above || y - above < headerBottom);
}

// The bottom edge of the shared header, from the origin; measured at every frame in tick().
let headerBottom = 0;

const isBlock = (node) => node?.nodeType === 1 && node.hasAttribute("data-c") && index.get(node.dataset.id) === node;
const blocksOf = (slotEl) => [...slotEl.children].filter(isBlock);

// ---- Drawing, at every frame (it follows scrolling, resizing, images that load) ----
let quiet = false; // nothing to draw: the frames go by without measuring the page
function tick() {
  requestAnimationFrame(tick);
  if (!ui.isConnected) return;
  const toDraw = selectedId || hoverId || hoverZone || flashId || dragging || rz || gridTarget || stacked.length;
  if (!toDraw) {
    if (quiet) return;
    quiet = true; // one last frame hides what was drawn
  } else quiet = false;
  const base = ui.getBoundingClientRect();
  const header = document.querySelector('.b-zone[data-zone="header"]');
  const hr = header ? rectOf(header) : null;
  headerBottom = hr && !isEmptyRect(hr) ? hr.bottom - base.top : 0;
  const sel = !dragging && selectedId ? index.get(selectedId) : null;
  const sr = sel ? boxOf(sel) : null;
  place(selBox, sr, base);
  if (sr) {
    // On a small cell, the handles on the edges would cover the corners: only the corners stay.
    selBox.classList.toggle("b-ui-narrow", sr.width < 44);
    selBox.classList.toggle("b-ui-short", sr.height < 44);
  }
  const hov = !dragging && hoverId && hoverId !== selectedId ? index.get(hoverId) : null;
  place(hoverBox, hov ? boxOf(hov) : null, base);
  tickGrid(base);
  const zone = !dragging && hoverZone ? document.querySelector(`.b-zone[data-zone="${hoverZone}"]`) : null;
  const zr = zone ? rectOf(zone) : null;
  place(zoneBox, zr, base);
  if (zr && !isEmptyRect(zr)) {
    // The label sits in the middle of the zone's visible part.
    const top = Math.max(zr.top, 0);
    const bottom = Math.min(zr.bottom, window.innerHeight);
    const mid = `${Math.round(((top + bottom) / 2 - zr.top) / uiZoom)}px`; // the label is enlarged by uiZoom (canvas.html)
    if (zoneLabel.style.top !== mid) zoneLabel.style.top = mid;
  }
  // The flash of the block just put down: we follow it for ~500 ms, then it's done.
  const fl = flashId ? index.get(flashId) : null;
  if (fl) {
    const now = performance.now();
    if (flashStart === null) flashStart = now;
    if (now - flashStart > 520) {
      flashId = null;
      flashStart = null;
      place(flashBox, null, base);
    } else place(flashBox, boxOf(fl), base);
  } else place(flashBox, null, base);
}
requestAnimationFrame(tick);

function tileHtml(type) {
  const ic = String(components[type]?.icon ?? "").trim();
  const svg = svgFor(ic, 15);
  return `<span class="b-ui-tile">${svg || escapeHtml(ic || "▢")}</span>`;
}

function updateLabels() {
  const sel = selectedId ? index.get(selectedId) : null;
  if (sel) {
    grip.innerHTML = `${SVG("grip")}${tileHtml(sel.dataset.c)}`;
    grip.append(document.createTextNode(nameOf(sel.dataset.c)));
    const cell = cellOf(sel);
    const nested = cell || (sel.parentElement?.dataset?.slot && sel.parentElement.dataset.slot !== "root");
    const tool = (name) => bar.querySelector(`[data-tool="${name}"]`);
    tool("parent").style.display = nested ? "" : "none";
    tool("up").style.display = cell ? "none" : "";
    tool("down").style.display = cell ? "none" : "";
    tool("front").style.display = cell ? "" : "none";
    tool("back").style.display = cell ? "" : "none";
    if (cell) {
      // The layer buttons work only when an overlapping block is above / below.
      const moves = layerMoves(grids.get(gridOf.get(selectedId)) || [], selectedId);
      for (const [name, isOn] of [["front", moves.front], ["back", moves.back]]) {
        const b = tool(name);
        b.disabled = !isOn;
        b.title = isOn ? (name === "front" ? t("Bring to front") : t("Send to back")) : t("It doesn't overlap another block");
      }
    }
  }
  // The handles: only on a block on a canvas laid out on the grid (not stacked, as on a phone).
  const cell = sel ? cellOf(sel) : null;
  selBox.classList.toggle("b-ui-free", Boolean(cell && !isStacked(cell.parentElement)));
  const hov = hoverId ? index.get(hoverId) : null;
  if (hov) hoverTag.textContent = nameOf(hov.dataset.c);
  if (hoverZone) {
    zoneLabel.textContent = hoverZone === "header" ? t("Shared header — click to edit it") : t("Shared footer — click to edit it");
  }
}

// ---- Displaying ----

async function loadComponents(comps = {}, broken = {}) {
  const out = {};
  await Promise.all(
    Object.entries(comps).map(async ([id, url]) => {
      const have = loaded.get(id);
      if (have && have.url === url) {
        out[id] = have.comp;
        return;
      }
      try {
        const mod = await import(url);
        if (!mod?.default || typeof mod.default.html !== "function") throw new Error("it doesn't export a component");
        loaded.set(id, { url, comp: mod.default });
        out[id] = mod.default;
      } catch (err) {
        // We keep the version that worked; the editor has already reported the error.
        console.warn(`[blocks] Couldn't reload components/${id}.js:`, err?.message);
        if (have) out[id] = have.comp;
      }
    }),
  );
  // A component that doesn't load at all shows as an error, not as "doesn't exist".
  for (const [id, message] of Object.entries(broken || {})) {
    if (out[id]) continue;
    const text = t("The “{id}” block couldn't load: {error}. It doesn't show on the site until you fix the file.", { id, error: message });
    out[id] = { name: id, html: () => `<div class="b-error">${escapeHtml(text)}</div>` };
  }
  for (const id of [...loaded.keys()]) if (!(id in comps)) loaded.delete(id);
  return out;
}

// The core's editor texts, in the editor's language; a broken block named as the editor names it.
function coreText(text, values = {}) {
  const comp = values.type !== undefined && Object.hasOwn(components, values.type) ? components[values.type] : null;
  return t(text, comp && values.name !== undefined ? { ...values, name: blockText(comp, "name") || values.name } : values);
}

function rebuildIndex() {
  index = new Map();
  for (const node of document.querySelectorAll("[data-c][data-id]")) {
    if (node.closest(".b-zone") || node.closest("#b-ui")) continue;
    if (!index.has(node.dataset.id)) index.set(node.dataset.id, node);
  }
}

// The area's name ("Content") from its key ("blockId:content"), in the editor's language.
function areaName(key) {
  if (!key || key === "root") return "";
  const i = key.lastIndexOf(":");
  const owner = index.get(key.slice(0, i));
  return slotLabel(components[owner?.dataset.c], key.slice(i + 1));
}

// The empty areas get a "+" and a friendly text: on the page "The page is empty.", in blocks
// "Drag a block into “Content” or press +", on an empty canvas how to work on it.
function dressEmpty() {
  for (const empty of document.querySelectorAll(".b-empty")) {
    const parent = empty.parentElement;
    if (parent?.closest(".b-zone")) continue;
    const key = parent?.dataset?.slot || parent?.dataset?.grid;
    if (!key) continue;
    const btn = el("button", "b-empty-plus", SVG("plus"));
    btn.type = "button";
    btn.title = t("Add a block");
    btn.setAttribute("aria-label", t("Add a block"));
    empty.replaceChildren(btn);
    if (parent.dataset.grid) {
      const text = el("span", "b-empty-text");
      text.textContent = t("Drag a block here or press +. Then move it anywhere and drag its corners to make it bigger.");
      empty.append(text);
    } else if (key === "root") {
      const title = el("strong", "b-empty-title");
      const text = el("span", "b-empty-text");
      title.textContent = emptyTitle;
      text.textContent = t("Drag a block from the left or press +");
      empty.append(title, text);
    } else {
      const text = el("span", "b-empty-text");
      text.textContent = t("Drag a block into “{area}” or press +", { area: areaName(key) });
      empty.append(text);
    }
  }
}

// The site's styles (site.json → "styles", or the page's) and, if the site has its own design,
// without base.css. The site's scripts don't run in the editor.
const baseLink = document.querySelector('link[href="/core/base.css"]');
let siteLinks = [];
let essential = null;
function applySiteCss(page, site) {
  const wanted = siteFiles(page, site, "styles");
  if (wanted.join("\n") !== siteLinks.map((l) => l.getAttribute("href")).join("\n")) {
    for (const l of siteLinks) l.remove();
    siteLinks = wanted.map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      cssEl.before(link);
      return link;
    });
  }
  const own = site.blocksStyles === false;
  if (baseLink) baseLink.disabled = own;
  if (own && !essential) {
    essential = document.createElement("style");
    essential.textContent = ESSENTIAL_CSS;
    themeEl.before(essential);
  } else if (!own && essential) {
    essential.remove();
    essential = null;
  }
}

async function doRender(json) {
  const { page, zones, site, comps, broken, path, emptyTitle: title, kind: docKind } = JSON.parse(json);
  const next = await loadComponents(comps, broken);
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  try {
    runtime?.stop();
  } catch (err) {
    console.error("[blocks] Error while stopping:", err);
  }
  runtime = null;
  components = next;
  if (title) emptyTitle = String(title);
  if (docKind) kind = String(docKind);
  let parts;
  try {
    parts = renderParts({ page, site, components, mode: "editor", zones: zones || {}, path: path || null, t: coreText });
  } catch (err) {
    document.body.innerHTML = `<div class="b-canvas-error">${escapeHtml(t("The page couldn't be displayed: {error}", { error: err?.message || err }))}</div>`;
    document.body.append(ui);
    index = new Map();
    readGrids(null);
    return;
  }
  document.documentElement.lang = String(site?.lang || "en");
  themeEl.textContent = themeCss(site || {});
  applySiteCss(page, site || {});
  cssEl.textContent = parts.css;
  activeEmpty = null;
  hidePlus();
  document.body.innerHTML = parts.body;
  forgetGaps();
  document.body.append(ui);
  rebuildIndex();
  dressEmpty();
  readGrids(page);
  if (dragging && dragId) index.get(dragId)?.classList.add("b-lifted");
  afterRender();
  if (hoverId && !index.has(hoverId)) hoverId = null;
  if (flashId && !index.has(flashId)) flashId = null;
  updateLabels();
  window.scrollTo(scrollX, scrollY);
  runtime = await start(parts.instances, {
    mode: "editor",
    root: document,
    load: async (type) => ({ default: components[type] }),
  });
  if (pendingScroll && index.has(pendingScroll)) {
    const id = pendingScroll;
    pendingScroll = null;
    scrollToBlock(id);
  }
  hooks.rendered?.();
}

// The displays happen one at a time; if several come in the meantime, only the last one counts.
let latest = null;
let chain = Promise.resolve();
function render(json) {
  latest = json;
  chain = chain.then(async () => {
    if (latest === null) return;
    const current = latest;
    latest = null;
    try {
      await doRender(current);
    } catch (err) {
      console.error("[blocks] Error while displaying:", err);
    }
  });
  return chain;
}

// ---- The gaps: all the places a block can go ----
// A single geometry, for the drop, for "+" and (through tree.js → positions) for the keyboard; the
// math without the DOM (the lines, picking the nearest one) is in gaps.js, with tests.
// A gap: { slot, index, depth, slotEl, line, empty, rect, kids }
//   line   – { x, y, size, vertical }: the segment between two neighbors (horizontal) or between two
//            blocks on the same row (vertical); null for an empty area
//   empty  – the .b-empty element, when the slot has no blocks (its only gap)
//   rect   – the gap's rectangle (flat, a line), for the distance
//   kids   – the union of the slot's children's rectangles ("+" shows only above them)

// "At the start / end of …": where a dropped block goes in the main list.
function whereInList(end) {
  if (kind === "header") return end ? t("At the end of the header") : t("At the start of the header");
  if (kind === "footer") return end ? t("At the end of the footer") : t("At the start of the footer");
  return end ? t("At the end of the page") : t("At the start of the page");
}

function depthOf(slotEl) {
  let d = 0;
  for (let n = slotEl.parentElement; n; n = n.parentElement) if (n.dataset?.slot) d++;
  return d;
}

function gaps() {
  const dragEl = dragId ? index.get(dragId) : null;
  const out = [];
  for (const slotEl of document.querySelectorAll("[data-slot]")) {
    // Not in the shared zones and not in the dragged block (you can't move into yourself).
    if (slotEl.closest(".b-zone") || (dragEl && dragEl.contains(slotEl))) continue;
    const slot = slotEl.dataset.slot;
    const depth = depthOf(slotEl);
    const kids = blocksOf(slotEl);
    const rects = kids.map(rectOf);
    const u = union(rects);
    if (!u) {
      const empty = slotEl.querySelector(":scope > .b-empty");
      const rect = empty ? rectOf(empty) : null;
      if (!isEmptyRect(rect)) out.push({ slot, index: kids.length, depth, slotEl, line: null, empty, rect, kids: rect });
      continue;
    }
    for (let i = 0; i <= kids.length; i++) {
      // The gap after the dragged block is the same as the one before it ("stays here"): only once.
      if (kids[i - 1] === dragEl) continue;
      const gl = gapLine(rects, i, u);
      if (!gl) continue;
      out.push({ slot, index: i, depth, slotEl, line: gl, empty: null, rect: lineRect(gl), kids: u });
    }
  }
  return out;
}

// The gap nearest to the point. Over a block, the candidates are only the gaps before and after it
// and the ones in its areas (above its middle → before, below → after; in a container → inside).
// Over nothing (the page's background, the space between columns): all the gaps. Over the shared
// header or footer: the start / end of the main list. `current` ({ slot, index }) is the target
// from before, kept if the new one isn't clearly closer (no flicker in the middle of the block).
function closestGap(x, y, current) {
  const all = gaps();
  if (!all.length) return null;
  const dragEl = dragId ? index.get(dragId) : null;
  let node = document.elementFromPoint(x, y);
  const zone = node?.closest?.(".b-zone");
  if (zone) {
    const root = all.filter((g) => g.slot === "root");
    return (zone.dataset.zone === "header" ? root[0] : root[root.length - 1]) || null;
  }
  if (dragEl && node && dragEl.contains(node)) node = dragEl.parentElement;
  let over = blockFrom(node);
  // A block on a canvas has no gaps around it: what counts are the areas in it or, without them, its canvas.
  while (over && cellOf(over) && !all.some((g) => over.contains(g.slotEl))) over = blockFrom(cellOf(over).parentElement);
  let candidates = all;
  if (over) {
    const slotEl = over.parentElement;
    const key = slotEl?.dataset?.slot;
    const i = blocksOf(slotEl).indexOf(over);
    let before = null;
    let after = null;
    for (const g of all) {
      if (g.slot !== key) continue;
      if (g.index <= i && (!before || g.index > before.index)) before = g;
      if (g.index >= i + 1 && (!after || g.index < after.index)) after = g;
    }
    candidates = all.filter((g) => over.contains(g.slotEl));
    if (before) candidates.push(before);
    if (after) candidates.push(after);
    if (!candidates.length) candidates = all;
  }
  return pickGap(candidates, x, y, current, all);
}

// What the ghost's pill says: where the block goes.
function gapLabel(g) {
  if (!g) return "";
  const dragEl = dragId ? index.get(dragId) : null;
  if (dragEl && dragEl.parentElement === g.slotEl && blocksOf(g.slotEl).indexOf(dragEl) === g.index) return t("Stays here");
  if (g.slot === "root") {
    const n = blocksOf(g.slotEl).length;
    if (!n) return "";
    return g.index === 0 ? whereInList(false) : g.index >= n ? whereInList(true) : "";
  }
  const owner = index.get(g.slot.slice(0, g.slot.lastIndexOf(":")));
  return owner ? t("In “{area}” · {block}", { area: areaName(g.slot), block: nameOf(owner.dataset.c) }) : "";
}

// A single indicator: the coral line (which slides between positions) or the lit empty area.
let lineShown = false;
function showTarget(g) {
  const empty = g?.empty || null;
  if (activeEmpty && activeEmpty !== empty) activeEmpty.classList.remove("b-empty--target");
  activeEmpty = empty;
  activeEmpty?.classList.add("b-empty--target");
  if (!g?.line) {
    hideLine();
    return;
  }
  const base = ui.getBoundingClientRect();
  const gl = g.line;
  const inset = g.slot === "root" ? 0 : 8; // in a container, the line is drawn a little inside
  let tx;
  let ty;
  let w = "";
  let hgt = "";
  if (gl.vertical) {
    tx = gl.x - base.left - 1.5;
    ty = gl.y - base.top + inset;
    hgt = `${Math.max(Math.round(gl.size - inset * 2), 12)}px`;
  } else {
    const docH = document.documentElement.scrollHeight;
    // The line doesn't touch the window's edges, so the dots at its ends show whole.
    const vw = document.documentElement.clientWidth;
    const left = Math.max(gl.x + inset, 6);
    const right = Math.min(gl.x + gl.size - inset, vw - 6);
    tx = left - base.left;
    ty = Math.min(Math.max(gl.y - base.top - 1.5, 2), docH - 5);
    w = `${Math.max(Math.round(right - left), 24)}px`;
  }
  // It shows on the spot (also when it changes direction); otherwise it slides to the new position.
  const fresh = !lineShown || line.classList.contains("b-ui-vertical") !== gl.vertical;
  line.classList.toggle("b-ui-vertical", gl.vertical);
  line.classList.toggle("b-ui-instant", fresh);
  line.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
  line.style.width = w;
  line.style.height = hgt;
  line.style.display = "block";
  lineShown = true;
}

function hideLine() {
  line.style.display = "none";
  lineShown = false;
}

let currentGap = null; // the last target ({ slot, index }), for the hysteresis

function clearDrop() {
  activeEmpty?.classList.remove("b-empty--target");
  activeEmpty = null;
  hideLine();
  currentGap = null;
  closeTarget();
}

function dropAt(x, y) {
  const g = gridUnder(x, y);
  if (g) {
    currentGap = null;
    return targetOnGrid(g, x, y);
  }
  closeTarget();
  const gap = closestGap(x, y, currentGap);
  currentGap = gap ? { slot: gap.slot, index: gap.index } : null;
  showTarget(gap);
  return gap ? { slot: String(gap.slot), index: Number(gap.index), label: gapLabel(gap) } : null;
}

// ---- The Free canvas: blocks placed anywhere on a grid (docs/ARCHITECTURE.md, “The Free canvas”) ----
//
// On a canvas there are no gaps. A new block shows as a ghost box snapped to the grid, under the
// cursor; one already on the canvas moves itself, in real time; the selected block has 8 handles.
// The place under the cursor is computed on the grid's geometry from the start of the gesture: rows
// can grow with the text, and the moved box must not move the grid under the cursor. The editor
// gets only the place (x, y) or the size, at the end, and repairs them with safePlacement: a single
// undo step for each gesture.

let gridEls = new Map(); // key ("blockId:slot") → the editable grid on the page
let grids = new Map(); // key → its blocks, from the page's JSON
let gridOf = new Map(); // id → the key of the grid the block sits on
let placements = new Map(); // id → the block's placement, repaired as in the core
let gridTarget = null; // a drag over a grid: { grid, key, geom, a, live: { cell, area, z } | null }
let held = null; // where the cursor holds the block moved on its own canvas: { id, pu, pv }, in cells
let rz = null; // the resize in progress (a handle being dragged)
let stacked = []; // the editable grids laid out one under another right now (on a phone), for the note

const area = (a) => `${a.y} / ${a.x} / span ${a.h} / span ${a.w}`;

function readGrids(page) {
  gridEls = new Map();
  grids = new Map();
  gridOf = new Map();
  placements = new Map();
  for (const g of document.querySelectorAll(".b-grid[data-grid]")) {
    if (!g.closest(".b-zone") && !gridEls.has(g.dataset.grid)) gridEls.set(g.dataset.grid, g);
  }
  const visit = (list) => {
    for (const b of Array.isArray(list) ? list : []) {
      if (!b || typeof b !== "object" || !b.slots || typeof b.slots !== "object") continue;
      for (const [name, kids] of Object.entries(b.slots)) {
        const key = `${b.id}:${name}`;
        if (gridEls.has(key)) {
          const blocks = (Array.isArray(kids) ? kids : []).filter((k) => k && typeof k === "object");
          grids.set(key, blocks);
          for (const k of blocks) {
            placements.set(String(k.id), safePlacement(k.placement));
            gridOf.set(String(k.id), key);
          }
        }
        visit(kids);
      }
    }
  };
  visit(page?.blocks);
  for (const key of gridEls.keys()) if (!grids.has(key)) grids.set(key, []);
}

// After every display: the free rows under the last block and what's stacked right now.
function afterRender() {
  gridTarget = null; // the cells are new; the target is recomputed at the next frame
  for (const [key, g] of gridEls) reserve(g, bottomRow(grids.get(key)) + FREE_ROWS);
  stacked = [...gridEls.values()].filter(isStacked);
  if (rz) {
    // The page was displayed again during the resize: the handle gets its pointer back.
    try {
      rz.handle.setPointerCapture(rz.pointerId);
    } catch {
      // the pointer is no longer pressed
    }
    moveResize();
  }
}

// The canvas grows by itself: under the last block there are always FREE_ROWS rows. Only in the
// editor: an invisible element on the last wanted row (new rows have the grid's size); stacked, it
// doesn't show (canvas.html).
function reserve(g, rows) {
  let r = g.querySelector(":scope > .b-reserve");
  if (!r) {
    r = el("div", "b-reserve");
    r.setAttribute("aria-hidden", "true");
    g.append(r);
  }
  const n = String(Math.max(1, Math.min(Math.round(rows) || 1, 300)));
  if (r.style.gridRowStart !== n) {
    r.style.gridRowStart = n;
    r.style.gridColumnStart = "1";
  }
}

// Under LIMITS.phone px of width, the cells sit one under another (as on a phone): the same rule as in GRID_CSS.
function isStacked(g) {
  if (!g?.isConnected) return false;
  const cs = getComputedStyle(g);
  return g.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) < LIMITS.phone;
}

// The grid's geometry, from its corner (in px): each column and each row, as in grid-template-*.
// With `without` (the cell being moved or resized), the rows are as they'd be without its content: a
// row grown only by its text or image shrinks back when you move or enlarge it, so the geometry from
// the start would send the dragged edge far from the cursor. We measure with the cell "without size"
// (contain: size) and put it back before drawing, so nothing shows.
function measure(g, without = null) {
  const old = without ? without.style.contain : "";
  if (without) without.style.contain = "size";
  try {
    return measureNow(g);
  } finally {
    if (without) without.style.contain = old;
  }
}

function measureNow(g) {
  const cs = getComputedStyle(g);
  const tracks = (s) => String(s || "").trim().split(/\s+/).map(parseFloat).filter((n) => Number.isFinite(n) && n >= 0);
  const widths = tracks(cs.gridTemplateColumns);
  if (widths.length !== COLUMNS) return null;
  const gapX = parseFloat(cs.columnGap) || 0;
  const gapY = parseFloat(cs.rowGap) || 0;
  let s = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
  const columns = widths.map((w) => {
    const c = { s, w };
    s += w + gapX;
    return c;
  });
  s = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0);
  const rows = tracks(cs.gridTemplateRows).map((w) => {
    const r = { s, w };
    s += w + gapY;
    return r;
  });
  const rowHeight = parseFloat(LIMITS.row) * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16); // "2rem"
  return { columns, rows, rowHeight };
}

function pointIn(g, geom, x, y) {
  const r = g.getBoundingClientRect();
  return gridPoint(geom, x - r.left, y - r.top);
}

// The grid the dragged block would land on: its own, while the cursor is on it (you move it over
// other blocks too, without it falling into one); otherwise the one under the cursor, if there's
// nothing deeper there (an ordinary area of a block on the canvas, e.g. a Section: the gaps go there).
function gridUnder(x, y) {
  const dragEl = dragId ? index.get(dragId) : null;
  let node = document.elementFromPoint(x, y);
  if (!node || node.closest?.(".b-zone")) return null;
  const own = dragId ? gridEls.get(gridOf.get(dragId)) : null;
  if (own?.isConnected) {
    const r = own.getBoundingClientRect();
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return own;
  }
  if (dragEl && dragEl.contains(node)) node = dragEl.parentElement;
  const slot = node?.closest?.("[data-slot]");
  for (let g = node?.closest?.(".b-grid[data-grid]"); g; g = g.parentElement?.closest(".b-grid[data-grid]")) {
    if (dragEl?.contains(g)) continue; // you can't move onto a canvas inside yourself
    if (gridEls.get(g.dataset.grid) !== g) return null;
    return slot && g.contains(slot) ? null : g;
  }
  return null;
}

// Where the moved block is held from (in cells, from its corner), from the pressed point, with the
// grid's geometry at that moment. Null if the point isn't on its cell (e.g. a drag started in Structure).
function heldBy(id, x, y) {
  const node = index.get(id);
  const cell = node ? cellOf(node) : null;
  const old = placements.get(id);
  if (!cell || !old || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const r = cell.getBoundingClientRect();
  const g = cell.parentElement;
  if (x < r.left || x > r.right || y < r.top || y > r.bottom || isStacked(g)) return null;
  const geom = measure(g, cell);
  if (!geom) return null;
  const p = pointIn(g, geom, x, y);
  const pu = Math.min(Math.max(p.u - (old.x - 1), 0), old.w);
  const pv = Math.min(Math.max(p.v - (old.y - 1), 0), old.h);
  return { id, pu, pv, grid: g, geom };
}

function targetOnGrid(g, x, y) {
  const key = g.dataset.grid;
  const list = grids.get(key) || [];
  const owner = index.get(key.slice(0, key.lastIndexOf(":")));
  if (isStacked(g)) {
    // Stacked (on a phone), the canvas is a list: the block goes at its end, and the editor gives it a place under the last block.
    closeTarget();
    const r = g.getBoundingClientRect();
    showTarget({ slot: key, empty: null, line: { vertical: false, x: r.left, y: r.bottom, size: r.width } });
    const here = Boolean(dragId) && gridOf.get(dragId) === key;
    return { slot: key, index: list.length, free: true, at: null, label: here ? t("Stays here") : t("At the end of the canvas"), ghost: true };
  }
  showTarget(null);
  const own = Boolean(dragId) && gridOf.get(dragId) === key;
  if (!gridTarget || gridTarget.grid !== g) {
    closeTarget();
    // On its own canvas, the geometry from the press (before anything moved); otherwise the current one.
    const geom = held?.grid === g ? held.geom : measure(g);
    if (!geom) return null;
    gridTarget = { grid: g, key, geom, a: null, live: null };
  }
  // A block from another canvas keeps its size; a new one (or one from the page) is 4 × 4.
  const old = dragId ? placements.get(dragId) : null;
  const w = old?.w ?? DEFAULT_SIZE.w;
  const h = old?.h ?? DEFAULT_SIZE.h;
  const p = pointIn(g, gridTarget.geom, x, y);
  if (own && held?.id !== dragId) {
    held = { id: dragId, pu: Math.min(Math.max(p.u - (old.x - 1), 0), w), pv: Math.min(Math.max(p.v - (old.y - 1), 0), h) };
  }
  const grab = own ? held : { pu: w / 2, pv: h / 2 };
  const a = { ...(old || safePlacement({ w, h })), ...placeUnder(p.u, p.v, w, h, grab.pu, grab.pv) };
  gridTarget.a = a;
  if (own) {
    const sel = index.get(dragId);
    const cell = sel ? cellOf(sel) : null;
    if (cell && !gridTarget.live) {
      gridTarget.live = { cell, area: cell.style.gridArea, z: cell.style.zIndex };
      sel.classList.remove("b-lifted");
    }
    if (gridTarget.live) {
      gridTarget.live.cell.style.gridArea = area(a);
      gridTarget.live.cell.style.zIndex = String(LIMITS.z + 10); // while you move it, it sits above every layer
    }
  }
  reserve(g, Math.max(bottomRow(list.filter((b) => String(b.id) !== dragId)), a.y + a.h - 1) + FREE_ROWS);
  const text = t("Column {x} · row {y}", { x: a.x, y: a.y });
  if (targetTag.textContent !== text) targetTag.textContent = text;
  return {
    slot: key,
    index: list.length,
    free: true,
    at: { x: a.x, y: a.y },
    label: own ? "" : t("On “{block}”", { block: nameOf(owner?.dataset.c) }),
    ghost: !own,
  };
}

// The target on the grid goes away: the moved cell goes back to its place (or, with `keep`, stays where
// you dropped it until the next display, so it doesn't jump back for a moment).
function closeTarget(keep = false) {
  if (!gridTarget) return;
  const target = gridTarget;
  gridTarget = null;
  if (target.live?.cell.isConnected) {
    if (!keep) target.live.cell.style.gridArea = target.live.area;
    target.live.cell.style.zIndex = target.live.z;
  }
  if (!keep && target.grid.isConnected) reserve(target.grid, bottomRow(grids.get(target.key)) + FREE_ROWS);
  if (target.live && dragging && dragId && !keep) index.get(dragId)?.classList.add("b-lifted");
}

// At every frame: the active grid's lines, the target box and the notes on a phone.
let linesKey = "";
function tickGrid(base) {
  const g = gridTarget?.grid || (rz ? rz.grid : null);
  if (g?.isConnected) drawLines(g, base);
  else if (gridBox.style.display !== "none") {
    gridBox.style.display = "none";
    linesKey = "";
  }
  let tr = null;
  if (gridTarget?.a && gridTarget.grid.isConnected) {
    if (gridTarget.live?.cell.isConnected) tr = gridTarget.live.cell.getBoundingClientRect();
    else {
      const gr = gridTarget.grid.getBoundingClientRect();
      const d = cellRect(gridTarget.geom, gridTarget.a);
      tr = { left: gr.left + d.left, top: gr.top + d.top, width: d.width, height: d.height };
    }
  }
  place(targetBox, tr, base);
  targetBox.classList.toggle("b-ui-target--ghost", Boolean(gridTarget && !gridTarget.live));
  placeNotes(base);
}

// The grid's barely visible lines: the 12 columns and the rows, measured again (rows grow with the text).
function drawLines(g, base) {
  const r = g.getBoundingClientRect();
  const geom = measure(g);
  if (!geom || isEmptyRect(r)) {
    gridBox.style.display = "none";
    return;
  }
  const ys = geom.rows.map((row) => row.s);
  const last = geom.rows[geom.rows.length - 1];
  for (let y = last ? last.s + last.w : 0; y < r.height - 1; y += geom.rowHeight) ys.push(y);
  const key = `${Math.round(r.width)}|${Math.round(r.height)}|${geom.columns.map((c) => c.s.toFixed(1))}|${ys.map((y) => y.toFixed(1))}`;
  if (key !== linesKey) {
    linesKey = key;
    let html = "";
    for (const c of geom.columns) html += `<i class="b-ui-grid-col" style="left:${c.s.toFixed(1)}px;width:${c.w.toFixed(1)}px"></i>`;
    for (const y of ys.slice(1)) html += `<i class="b-ui-grid-row" style="top:${y.toFixed(1)}px"></i>`;
    gridBox.innerHTML = html;
  }
  gridBox.style.display = "block";
  gridBox.style.transform = `translate(${Math.round(r.left - base.left)}px, ${Math.round(r.top - base.top)}px)`;
  gridBox.style.width = `${Math.round(r.width)}px`;
  gridBox.style.height = `${Math.round(r.height)}px`;
}

// Above each stacked canvas: why it looks different than on a computer.
function placeNotes(base) {
  while (notes.length < stacked.length) {
    const n = el("div", "b-ui-note", SVG("phone"));
    n.append(el("span"));
    ui.append(n);
    notes.push(n);
  }
  const text =
    window.innerWidth < LIMITS.phone
      ? t("On a phone, the blocks stack one under the other, in reading order.")
      : t("The canvas is narrow here, so the blocks stack one under the other, in reading order.");
  notes.forEach((n, i) => {
    const g = stacked[i];
    const gr = g?.isConnected ? g.getBoundingClientRect() : null;
    if (!gr || isEmptyRect(gr)) {
      if (n.style.display !== "none") n.style.display = "none";
      return;
    }
    // We write only what changed; the note's height is measured once, not at every frame (after
    // writes, a read would force the browser to lay out the page again).
    const width = `${Math.round(gr.width)}px`;
    if (n.lastChild.textContent !== text || n.style.maxWidth !== width || n.style.display !== "flex") {
      n.lastChild.textContent = text;
      n.style.maxWidth = width;
      n.style.display = "flex";
      n._h = null;
    }
    n._h ??= n.offsetHeight;
    let top = gr.top - base.top - n._h - 8;
    if (top < headerBottom + 4) top = gr.top - base.top + 8; // no room above: it sits on the canvas
    const where = `translate(${Math.round(gr.left - base.left)}px, ${Math.round(top)}px)`;
    if (n.style.transform !== where) n.style.transform = where;
  });
}

// ---- The handles: resizing on the grid ----

function startResize(e, handleName) {
  const sel = selectedId ? index.get(selectedId) : null;
  const cell = sel ? cellOf(sel) : null;
  const g = cell?.parentElement;
  const a0 = placements.get(selectedId);
  if (!cell || !g || !a0 || isStacked(g) || !HANDLES.includes(handleName)) return;
  const geom = measure(g, cell);
  if (!geom) return;
  e.preventDefault();
  e.stopPropagation();
  const handle = e.target.closest("[data-handle]");
  // How far from the dragged edge the handle was grabbed: the edge doesn't jump at the first move. At
  // most half a cell: a cell grown by its content is bigger than its rows, and the dragged edge must
  // stay under the cursor, not at the distance from the start.
  const p0 = pointIn(g, geom, e.clientX, e.clientY);
  const edgeU = handleName.endsWith("w") ? a0.x - 1 : handleName.includes("e") ? a0.x - 1 + a0.w : p0.u;
  const edgeV = handleName.startsWith("n") ? a0.y - 1 : handleName.startsWith("s") ? a0.y - 1 + a0.h : p0.v;
  const half = (d) => Math.max(-0.5, Math.min(0.5, d));
  rz = {
    id: selectedId,
    handleName,
    a0,
    a: a0,
    geom,
    grid: g,
    key: g.dataset.grid,
    area: cell.style.gridArea,
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    du: half(p0.u - edgeU),
    dv: half(p0.v - edgeV),
    shift: e.shiftKey,
    handle,
  };
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // the pointer is no longer active
  }
  const cursor =
    handleName === "n" || handleName === "s" ? "ns" : handleName === "e" || handleName === "w" ? "ew" : handleName === "nw" || handleName === "se" ? "nwse" : "nesw";
  document.documentElement.classList.add("b-resizing", `b-resizing--${cursor}`);
  hidePlus();
  sizeTag.textContent = sizeText(a0);
}

function moveResize() {
  if (!rz) return;
  const sel = index.get(rz.id);
  const cell = sel ? cellOf(sel) : null;
  if (!cell) return;
  const g = cell.parentElement;
  if (g !== rz.grid) {
    // The page was displayed again: the cell and the grid are new ones.
    rz.grid = g;
    rz.area = cell.style.gridArea;
    rz.geom = measure(g, cell) || rz.geom;
  }
  const p = pointIn(g, rz.geom, rz.x, rz.y);
  const a = resize(rz.a0, rz.handleName, p.u - rz.du, p.v - rz.dv, rz.shift);
  rz.a = a;
  const next = area(a);
  if (cell.style.gridArea !== next) cell.style.gridArea = next;
  reserve(g, Math.max(bottomRow((grids.get(rz.key) || []).filter((b) => String(b.id) !== rz.id)), a.y + a.h - 1) + FREE_ROWS);
  const text = sizeText(a);
  if (sizeTag.textContent !== text) sizeTag.textContent = text;
}

// At the end: the editor gets the new placement (a single undo step). Esc or a canceled pointer
// put the cell back.
function endResize(ok) {
  if (!rz) return;
  const r = rz;
  rz = null;
  try {
    r.handle.releasePointerCapture(r.pointerId);
  } catch {
    // already released
  }
  document.documentElement.classList.remove("b-resizing", "b-resizing--ns", "b-resizing--ew", "b-resizing--nwse", "b-resizing--nesw");
  sizeTag.textContent = "";
  suppress = true; // the click on release doesn't change the selection
  setTimeout(() => (suppress = false), 0);
  const sel = index.get(r.id);
  const cell = sel ? cellOf(sel) : null;
  if (ok && ["x", "y", "w", "h"].some((k) => r.a[k] !== r.a0[k])) {
    hooks.placement?.(r.id, { x: r.a.x, y: r.a.y, w: r.a.w, h: r.a.h });
    return; // the cell stays where you left it until the next display
  }
  if (cell) cell.style.gridArea = r.area;
  if (cell?.parentElement) reserve(cell.parentElement, bottomRow(grids.get(r.key)) + FREE_ROWS);
}

document.addEventListener(
  "pointermove",
  (e) => {
    if (!rz || e.pointerId !== rz.pointerId) return;
    rz.x = e.clientX;
    rz.y = e.clientY;
    rz.shift = e.shiftKey;
    moveResize();
  },
  true,
);
document.addEventListener("pointerup", (e) => rz && e.pointerId === rz.pointerId && endResize(true), true);
document.addEventListener("pointercancel", (e) => rz && e.pointerId === rz.pointerId && endResize(false), true);
document.addEventListener(
  "keyup",
  (e) => {
    if (rz && e.key === "Shift") {
      rz.shift = false;
      moveResize();
    }
  },
  true,
);
// The canvas's width changed (e.g. the "Phone" button): what's stacked now, and the handles.
window.addEventListener("resize", () => {
  forgetGaps();
  stacked = [...gridEls.values()].filter(isStacked);
  updateLabels();
});

// ---- "+" between blocks ----
// The same gaps, only the horizontal ones; the line shows when the mouse is at most PLUS_RANGE px
// from one and above its blocks. On a tie the deeper area wins (it comes later in the document).
const PLUS_RANGE = 10;

// The gaps for "+", kept between mouse moves: measuring them reads every block on the page. They're
// remade after a display, on scrolling, on resizing and when the page changes size (an image that
// loads); while you drag a block, they're measured again at every step (then they really move).
let gapCache = null;
const forgetGaps = () => (gapCache = null);
new ResizeObserver(forgetGaps).observe(document.documentElement);

function nearestGap(x, y) {
  let best = null;
  let bestD = PLUS_RANGE + 0.001;
  gapCache ??= gaps();
  for (const g of gapCache) {
    if (!g.line || g.line.vertical) continue;
    if (x < g.kids.left - 8 || x > g.kids.right + 8) continue;
    const d = Math.abs(y - g.line.y);
    if (d <= bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

function showPlus(g) {
  const base = ui.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const gl = g.line;
  const left = Math.max(gl.x, 4);
  const right = Math.min(gl.x + gl.size, vw - 4);
  plusTarget = { slot: g.slot, index: g.index };
  plusBox.style.transform = `translate(${Math.round(left - base.left)}px, ${Math.round(gl.y - base.top - 1)}px)`;
  plusBox.style.width = `${Math.max(Math.round(right - left), 24)}px`;
  plusBox.style.display = "block";
}

function hidePlus() {
  plusTarget = null;
  plusBox.style.display = "none";
}

function updatePlus(x, y, target) {
  if (dragging) return hidePlus();
  if (target?.closest?.(".b-ui-plus")) return; // on the button: it stays
  const g = nearestGap(x, y);
  if (g) showPlus(g);
  else hidePlus();
}

let plusAt = null; // the mouse's last position, for "+" (once per frame)
let plusFrame = 0;

// The button's center (on the canvas): the editor opens the blocks menu next to it.
function insertFrom(btn, target) {
  const r = btn.getBoundingClientRect();
  hooks.insert?.({ ...target, x: r.left + r.width / 2, y: r.top + r.height / 2 });
}

// ---- Scrolling ----

function scrollToBlock(id, smooth = true) {
  const node = index.get(id);
  if (!node) {
    pendingScroll = id;
    return;
  }
  const r = boxOf(node);
  if (isEmptyRect(r)) return;
  const vh = window.innerHeight;
  if (r.top >= 8 && r.bottom <= vh - 8) return;
  const top = r.height < vh - 120 ? window.scrollY + r.top - (vh - r.height) / 2 : window.scrollY + r.top - 60;
  window.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}

// ---- Events on the canvas ----

const blockFrom = (target) => {
  const b = target?.closest?.("[data-c][data-id]");
  // On a cell, outside the content of the block in it: the cell's block, not the canvas.
  const cell = target?.closest?.("[data-cell]");
  if (cell && (!b || b.contains(cell))) {
    const inner = index.get(cell.dataset.cell);
    if (inner && cellOf(inner) === cell) return inner;
  }
  return b && isBlock(b) ? b : null;
};

document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button !== 0 || e.target === document.documentElement) return;
    const target = e.target;
    const handle = target.closest?.("[data-handle]");
    if (handle) {
      startResize(e, handle.dataset.handle);
      return;
    }
    if (rz || target.closest?.("[data-tool], [data-plus], .b-empty-plus")) return;
    let id = null;
    if (target.closest?.(".b-ui-grip")) id = selectedId;
    else if (!target.closest?.("#b-ui") && !target.closest?.(".b-zone")) id = blockFrom(target)?.dataset.id || null;
    if (id) hooks.pointerDown?.({ id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, pointerType: e.pointerType });
  },
  true,
);

// No focus on the page's fields and links, so the editor's shortcuts keep working.
// The canvas still takes the focus (otherwise Delete would land, e.g., in the palette's search).
document.addEventListener(
  "mousedown",
  (e) => {
    if (
      e.target?.closest?.("a, input, textarea, select, button, label, summary, [contenteditable], [tabindex], #b-ui, video, audio")
    ) {
      e.preventDefault();
      window.focus();
    }
  },
  true,
);

document.addEventListener(
  "click",
  (e) => {
    const target = e.target;
    e.preventDefault();
    e.stopPropagation();
    const tool = target?.closest?.("[data-tool]");
    if (tool) {
      if (selectedId) hooks.action?.(tool.dataset.tool, selectedId);
      return;
    }
    const plus = target?.closest?.("[data-plus]");
    if (plus) {
      if (plusTarget) insertFrom(plus, plusTarget);
      return;
    }
    const emptyPlus = target?.closest?.(".b-empty-plus");
    if (emptyPlus) {
      const parent = emptyPlus.closest(".b-empty")?.parentElement;
      const key = parent?.dataset?.slot || parent?.dataset?.grid;
      if (key) insertFrom(emptyPlus, { slot: key, index: 0 });
      return;
    }
    if (suppress || target?.closest?.("#b-ui")) return;
    const zone = target?.closest?.(".b-zone");
    if (zone) {
      hooks.zone?.(zone.dataset.zone);
      return;
    }
    hooks.select?.(blockFrom(target)?.dataset.id || null);
  },
  true,
);

document.addEventListener(
  "dblclick",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    const b = blockFrom(e.target);
    if (b && !e.target.closest?.("#b-ui, .b-empty-plus")) hooks.dblclick?.(b.dataset.id);
  },
  true,
);

for (const type of ["auxclick", "submit", "dragstart", "selectstart"]) {
  document.addEventListener(
    type,
    (e) => {
      e.preventDefault();
      if (type !== "selectstart") e.stopPropagation();
    },
    true,
  );
}

document.addEventListener(
  "focusin",
  (e) => {
    if (e.target?.matches?.("input, textarea, select, [contenteditable]")) e.target.blur();
  },
  true,
);

document.addEventListener(
  "keydown",
  (e) => {
    if (rz) {
      // During a resize: Esc cancels it, Shift keeps the proportions; everything else waits.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") endResize(false);
      else if (e.key === "Shift") {
        rz.shift = true;
        moveResize();
      }
      return;
    }
    hooks.keydown?.(e);
  },
  true,
);

document.addEventListener(
  "pointermove",
  (e) => {
    if (dragging || rz) return;
    const target = e.target;
    let id = null;
    let zone = null;
    if (!target?.closest?.("#b-ui")) {
      const z = target?.closest?.(".b-zone");
      if (z) zone = z.dataset.zone;
      else id = blockFrom(target)?.dataset.id || null;
    } else if (target.closest(".b-ui-sel, .b-ui-plus")) {
      id = hoverId; // on the selected block's bar or on "+" we keep what was there
      zone = hoverZone;
    }
    if (id !== hoverId || zone !== hoverZone) {
      hoverId = id;
      hoverZone = zone;
      updateLabels();
      hooks.hover?.(id);
    }
    // "+" is looked for once per frame, not at every mouse event.
    plusAt = { x: e.clientX, y: e.clientY, target };
    plusFrame ||= requestAnimationFrame(() => {
      plusFrame = 0;
      if (plusAt) updatePlus(plusAt.x, plusAt.y, plusAt.target);
    });
  },
  { passive: true },
);

document.documentElement.addEventListener("mouseleave", () => {
  plusAt = null;
  hidePlus();
  if (hoverId || hoverZone) {
    hoverId = null;
    hoverZone = null;
    hooks.hover?.(null);
  }
});

// After scrolling, the space under the mouse is a different one.
window.addEventListener(
  "scroll",
  () => {
    forgetGaps();
    hidePlus();
  },
  { passive: true },
);

// ---- What the editor sees ----

window.blocksCanvas = {
  connect(h) {
    hooks = h || {};
  },
  render,
  // The page is shown scaled down by `s`: the canvas's tools grow back (--b-ui, in canvas.html), so on
  // screen they have the size from docs/DESIGN.md (nothing under 12 px). The positions stay the page's.
  scale(s) {
    const z = Number.isFinite(s) && s > 0 && s < 1 ? Math.min(1 / s, 3) : 1;
    uiZoom = Math.round(z * 1000) / 1000;
    document.documentElement.style.setProperty("--b-ui", String(uiZoom));
    for (const box of [selBox, hoverBox, flashBox, zoneBox]) box._key = "";
    for (const n of notes) n._h = null;
  },
  select(id) {
    selectedId = id || null;
    selBox._key = "";
    updateLabels();
  },
  hover(id) {
    hoverId = id && index.has(id) ? id : null;
    hoverZone = null;
    updateLabels();
  },
  // The dragged block "lifts" off the page (b-lifted); its place stays empty, with no other sign.
  // (x, y): where the block was pressed, if known (not for a row in Structure).
  dragStart(id, x, y) {
    endResize(false);
    dragging = true;
    dragId = id || null;
    held = dragId ? heldBy(dragId, x, y) : null;
    hoverId = null;
    hoverZone = null;
    hidePlus();
    if (dragId) index.get(dragId)?.classList.add("b-lifted");
    document.documentElement.classList.add("b-dragging");
  },
  // `keep`: the block was dropped on the canvas; the moved cell stays there until the next display.
  dragEnd(keep = false) {
    closeTarget(keep === true);
    dragging = false;
    dragId = null;
    held = null;
    clearDrop();
    for (const n of document.querySelectorAll(".b-lifted")) n.classList.remove("b-lifted");
    document.documentElement.classList.remove("b-dragging");
  },
  dropAt,
  clearDrop,
  scrollToBlock,
  scrollBy(dy) {
    window.scrollBy(0, dy);
  },
  // A short flash on the block just put down (also if it shows only at the next display).
  flash(id) {
    flashId = id || null;
    flashStart = null;
    flashBox._key = "";
    flashBox.style.display = "none";
  },
  // The click that comes right after a drag must not change the selection.
  suppressClick() {
    suppress = true;
    setTimeout(() => (suppress = false), 0);
  },
  // The block sits on a canvas that's stacked right now (as on a phone): no handles, the arrows don't move it.
  isStacked(id) {
    const node = id ? index.get(String(id)) : null;
    const cell = node ? cellOf(node) : null;
    return Boolean(cell && isStacked(cell.parentElement));
  },
};

// We tell the editor the canvas is ready, on its own iframe (there may be several canvases).
try {
  window.frameElement?.dispatchEvent(new Event("blocks-ready"));
} catch {
  // the canvas is open on its own, not in the editor
}
