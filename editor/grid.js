// The Free canvas: the math on the 12-column grid (docs/ARCHITECTURE.md, “The Free canvas”). No DOM, so it
// also runs in Node (for the tests); both the canvas (canvas.js) and the editor use it.
//
// Everything that comes out of here goes through safePlacement: only integers and shapes from the list.
// A "list" is the list of blocks of a free area, from the page's JSON.

import { COLUMNS, LIMITS, safePlacement } from "../core/render.js";
import { tn } from "./i18n.js";

export const DEFAULT_SIZE = { w: 4, h: 4 }; // a new cell: 4 columns × 4 rows
export const FREE_ROWS = 4; // in the editor, there are always this many empty rows under the last block
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]; // the corners and edges (north, east, south, west)
const Y_MAX = LIMITS.y;
const H_MAX = LIMITS.h;
const Z_MAX = LIMITS.z;
// The blocks that are a single image or a video arrive on the canvas filling their cell, like in a
// frame: the cell has exactly the size dragged with the handles, however big the image is (the
// checkbox can be turned off in "Placement").
const FILLS = new Set(["image", "video"]);
const KEYS = ["x", "y", "w", "h", "z", "shape", "fill"];

const clamp = (n, min, max) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));
const blocksOf = (list) => (Array.isArray(list) ? list : []).filter((b) => b && typeof b === "object");
const idOf = (b) => (b && typeof b === "object" ? String(b.id ?? "") : "");

// The placement `a` with the requested changes (only the known keys, read with care), repaired.
export function adjust(a, changes) {
  const out = { ...safePlacement(a) };
  for (const k of KEYS) {
    try {
      if (changes && typeof changes === "object" && Object.hasOwn(changes, k)) out[k] = changes[k];
    } catch {
      // a getter that throws: the key stays as it was
    }
  }
  return safePlacement(out);
}

// The cell sits at column x and row y, with its size: x stops where the cell still fits.
export function placeAt(a, x, y) {
  const b = safePlacement(a);
  const p = safePlacement({ x, y, w: 1 });
  return safePlacement({ ...b, x: Math.min(p.x, COLUMNS + 1 - b.w), y: p.y });
}

// The last row taken by the list's blocks (0 for an empty list).
export function bottomRow(list) {
  let r = 0;
  for (const b of blocksOf(list)) {
    const a = safePlacement(b.placement);
    r = Math.max(r, a.y + a.h - 1);
  }
  return r;
}

// The place of a block without a chosen place (from "+", Structure, the keyboard): on the left, under the last block.
export function belowLast(list, { w = DEFAULT_SIZE.w, h = DEFAULT_SIZE.h } = {}) {
  return safePlacement({ x: 1, y: bottomRow(list) + 1, w, h });
}

// Two placements share at least one square.
export function overlaps(a, b) {
  const p = safePlacement(a);
  const q = safePlacement(b);
  return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
}

// The order in which the cells are drawn, from the bottom up: by layer, then as on the page
// (row, column, place in the list) – exactly the core's order.
function drawOrder(list) {
  return blocksOf(list)
    .map((block, i) => ({ block, a: safePlacement(block.placement), i }))
    .sort((p, q) => p.a.z - q.a.z || p.a.y - q.a.y || p.a.x - q.a.x || p.i - q.i);
}

// The layer of a block arriving on the canvas: above the blocks it lands on (0 if it touches nothing).
export function zAbove(list, a, exceptId = null) {
  let z = -1;
  for (const b of blocksOf(list)) {
    if (exceptId !== null && idOf(b) === exceptId) continue;
    const q = safePlacement(b.placement);
    if (overlaps(a, q)) z = Math.max(z, q.z);
  }
  return Math.min(z + 1, Z_MAX);
}

// The placement of a block arriving on the canvas: at the requested place (`at`: { x, y }) or under
// the last block. The size, shape and fill come with it from another canvas (otherwise 4 × 4); it sits
// above what it touches.
export function placeArriving(list, block, at = null) {
  let old = null;
  try {
    old = block && typeof block === "object" && Object.hasOwn(block, "placement") ? safePlacement(block.placement) : null;
  } catch {
    old = null;
  }
  const size = { w: old?.w ?? DEFAULT_SIZE.w, h: old?.h ?? DEFAULT_SIZE.h };
  const others = blocksOf(list).filter((b) => b !== block);
  let a = belowLast(others, size);
  if (at && typeof at === "object") {
    const p = adjust({}, at);
    a = placeAt(a, p.x, p.y);
  }
  if (old) a = { ...a, shape: old.shape, fill: old.fill };
  else if (block && typeof block === "object" && FILLS.has(block.type)) a = { ...a, fill: true };
  return safePlacement({ ...a, z: zAbove(others, a) });
}

// Moving with the arrow keys: dx, dy cells; the cell stays whole on the grid.
export function moveBy(a, dx, dy) {
  const b = safePlacement(a);
  return safePlacement({ ...b, x: clamp(b.x + dx, 1, COLUMNS + 1 - b.w), y: clamp(b.y + dy, 1, Y_MAX) });
}

// Size with Shift + arrows: dw columns, dh rows (the top left corner stays put).
export function growBy(a, dw, dh) {
  const b = safePlacement(a);
  return safePlacement({ ...b, w: clamp(b.w + dw, 1, COLUMNS + 1 - b.x), h: clamp(b.h + dh, 1, H_MAX) });
}

// The place under the cursor, for a w × h cell. (u, v): the point on the grid, in cells with
// fractions (0 = the left / top edge). (pu, pv): where the cursor holds the cell, in cells (for a
// new block, the middle).
export function placeUnder(u, v, w, h, pu = w / 2, pv = h / 2) {
  const W = clamp(w, 1, COLUMNS);
  return {
    x: clamp(Math.round(u - pu) + 1, 1, COLUMNS + 1 - W),
    y: clamp(Math.round(v - pv) + 1, 1, Y_MAX),
  };
}

// Dragging a handle: the edges it holds snap to the nearest grid line, the opposite ones stay put.
// With `keepRatio` (Shift), the width / height ratio from the start stays (a square stays a square).
export function resize(a0, handle, u, v, keepRatio = false) {
  const a = safePlacement(a0);
  const m = HANDLES.includes(handle) ? handle : "se";
  const west = m.endsWith("w");
  const east = m.includes("e");
  const north = m.startsWith("n");
  const south = m.startsWith("s");
  // The edges, as grid lines: 0 … 12 across, 0 … downwards.
  let L = a.x - 1;
  let R = a.x - 1 + a.w;
  let T = a.y - 1;
  let B = a.y - 1 + a.h;
  if (east) R = clamp(u, L + 1, COLUMNS);
  if (west) L = clamp(u, 0, R - 1);
  if (south) B = clamp(v, T + 1, T + H_MAX);
  if (north) T = clamp(v, Math.max(0, B - H_MAX), Math.min(B - 1, Y_MAX - 1));
  if (keepRatio) {
    const r = a.w / a.h;
    const maxW = west ? R : COLUMNS - L;
    const maxH = north ? Math.min(B, H_MAX) : H_MAX;
    let w = R - L;
    let h = B - T;
    if ((west || east) && (north || south)) {
      // At a corner, the side dragged more leads (in proportion to the size at the start).
      const sw = w / a.w;
      const sh = h / a.h;
      const s = Math.abs(sw - 1) >= Math.abs(sh - 1) ? sw : sh;
      w = Math.max(1, Math.round(a.w * s));
      h = Math.max(1, Math.round(a.h * s));
    } else if (west || east) h = Math.max(1, Math.round(w / r));
    else w = Math.max(1, Math.round(h * r));
    if (w > maxW) {
      w = maxW;
      h = Math.max(1, Math.round(w / r));
    }
    if (h > maxH) {
      h = maxH;
      w = Math.min(maxW, Math.max(1, Math.round(h * r)));
    }
    // The dragged edge moves, the opposite one stays; at an edge without a corner, it grows to the right / down.
    if (west) L = R - w;
    else R = L + w;
    if (north) T = B - h;
    else B = T + h;
  }
  return safePlacement({ ...a, x: L + 1, y: T + 1, w: R - L, h: B - T });
}

// The position of a point on the grid, in cells with fractions. `geom`: { columns: [{ s, w }],
// rows: [{ s, w }], rowHeight } with the start (s) and size (w) of each column / row, in px, from the
// grid's corner. The gap between columns belongs to the line on its right; after the last measured
// row, rows go on every `rowHeight` px.
export function gridPoint(geom, px, py) {
  return { u: onTracks(geom?.columns, px, geom?.columns?.at?.(-1)?.w), v: onTracks(geom?.rows, py, geom?.rowHeight) };
}

function onTracks(tracks, p, extra) {
  const list = Array.isArray(tracks) ? tracks : [];
  const step = Number.isFinite(extra) && extra > 0 ? extra : 32;
  if (!list.length) return p / step;
  const first = list[0];
  if (p < first.s) return (p - first.s) / (first.w || step);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (p <= t.s + t.w) return i + (t.w > 0 ? (p - t.s) / t.w : 0);
    const next = list[i + 1];
    if (!next) return list.length + (p - (t.s + t.w)) / step;
    if (p < next.s) return i + 1;
  }
  return list.length;
}

// Where track `k` starts (0 = the start of the grid), also beyond the measured ones.
function trackStart(tracks, k, step) {
  const list = Array.isArray(tracks) ? tracks : [];
  if (!list.length) return k * step;
  if (k < list.length) return list[k].s;
  const last = list[list.length - 1];
  return last.s + last.w + (k - list.length) * step;
}

// The rectangle of cell `a` on the grid, in px from the grid's corner (for the ghost and the outlines).
export function cellRect(geom, a) {
  const b = safePlacement(a);
  const cols = geom?.columns || [];
  const step = geom?.rowHeight > 0 ? geom.rowHeight : 32;
  const left = cols[b.x - 1]?.s ?? 0;
  const lastCol = cols[b.x + b.w - 2];
  const right = lastCol ? lastCol.s + lastCol.w : left;
  const top = trackStart(geom?.rows, b.y - 1, step);
  const bottom = trackStart(geom?.rows, b.y + b.h - 1, step);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

// "Bring to front" / "Send to back": the block goes above / below all the others, and the others
// keep their order. The layers are renumbered with the smallest numbers that keep the order of any
// two overlapping blocks (a block on its own sits on 0): on a canvas with any number of blocks, the
// layer grows only with how many blocks sit on top of each other, not with how many there are.
// Changes the list; true if something changed.
export function changeLayer(list, id, side) {
  const order = drawOrder(list);
  const k = order.findIndex((o) => idOf(o.block) === String(id));
  if (k === -1 || (side !== "front" && side !== "back")) return false;
  const [me] = order.splice(k, 1);
  if (side === "front") order.push(me);
  else order.unshift(me);
  const z = new Map();
  order.forEach((o, i) => {
    let level = 0;
    for (let j = 0; j < i; j++) if (overlaps(o.a, order[j].a)) level = Math.max(level, z.get(order[j]) + 1);
    z.set(o, Math.min(level, Z_MAX));
  });
  let changed = false;
  for (const o of order) {
    if (o.a.z === z.get(o)) continue;
    o.block.placement = safePlacement({ ...o.a, z: z.get(o) });
    changed = true;
  }
  // Above 50 blocks on top of each other, the top layers become equal; on a tie the reading order
  // decides, then the place in the list, so the block moves to the end of the list (on a canvas, the
  // placement gives the place).
  const tie = order.some((o) => o !== me && z.get(o) === z.get(me) && overlaps(o.a, me.a));
  const i = list.indexOf(me.block);
  const end = side === "front" ? list.length - 1 : 0;
  if (tie && i !== -1 && i !== end) {
    list.splice(i, 1);
    if (side === "front") list.push(me.block);
    else list.unshift(me.block);
    changed = true;
  }
  return changed;
}

// What the layer buttons can do: to the front only if a block overlapping it is above it, to the back
// only if one is below it. Without an overlap, both are off.
export function layerMoves(list, id) {
  const order = drawOrder(list);
  const k = order.findIndex((o) => idOf(o.block) === String(id));
  if (k === -1) return { front: false, back: false };
  const me = order[k].a;
  return {
    front: order.slice(k + 1).some((o) => overlaps(me, o.a)),
    back: order.slice(0, k).some((o) => overlaps(me, o.a)),
  };
}

// "6 columns × 8 rows": the size of the cell, for the label shown while resizing.
export function sizeText(a) {
  const b = safePlacement(a);
  return `${tn(b.w, "{n} column", "{n} columns")} × ${tn(b.h, "{n} row", "{n} rows")}`;
}
