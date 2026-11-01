// The link between the editor and a canvas (the iframe with the page): it sends the displays and
// the selection, and receives the clicks, the keys and the start of a drag.
//
// The canvas can be scaled down (transform: scale) when the chosen width doesn't fit, so every
// coordinate goes through fromFrame / toFrame.
//
// The editor can have several canvases (the page and the thumbnail in the palette): each one says
// it's ready with the "blocks-ready" event on its own iframe.
//
//   createCanvasHost(iframe, hooks, { around })
//     around – the element around the sheet (the cream space): a release a few pixels outside the
//              sheet, but still inside it, is still on the page (contains + dropAt bring the point onto the sheet).

import { safePlacement } from "../core/render.js";

const TOLERANCE = 24;

// A place on the canvas that came from the canvas: only the column and the row, valid integers.
function spot(a) {
  if (!a || typeof a !== "object") return null;
  const p = safePlacement({ x: a.x, y: a.y, w: 1 });
  return { x: p.x, y: p.y };
}

export function createCanvasHost(iframe, hooks, { around = null } = {}) {
  let canvas = null;
  let lastJson = null;
  let selected = null;
  let scale = 1; // how much the canvas is scaled down (transform: scale), so the bar and the handles grow back

  function attach() {
    let c = null;
    try {
      c = iframe.contentWindow?.blocksCanvas || null;
    } catch {
      c = null;
    }
    if (!c) return false;
    if (c === canvas) return true;
    canvas = c;
    c.connect(hooks);
    c.scale?.(scale);
    c.select(selected);
    if (lastJson) c.render(lastJson);
    return true;
  }

  // canvas.js says by itself when it's ready; the "load" event is the safety net
  // (and it catches the iframe being reloaded).
  iframe.addEventListener("blocks-ready", attach);
  iframe.addEventListener("load", attach);
  attach();

  const ratio = (r) => (iframe.offsetWidth ? r.width / iframe.offsetWidth : 1);

  function toFrame(px, py) {
    const r = iframe.getBoundingClientRect();
    const s = ratio(r) || 1;
    return { x: (px - r.left) / s, y: (py - r.top) / s };
  }

  function fromFrame(x, y) {
    const r = iframe.getBoundingClientRect();
    const s = ratio(r) || 1;
    return { x: r.left + x * s, y: r.top + y * s };
  }

  const inside = (r, px, py, pad = 0) => px >= r.left - pad && px < r.right + pad && py >= r.top - pad && py < r.bottom + pad;

  return {
    get document() {
      try {
        return iframe.contentDocument;
      } catch {
        return null;
      }
    },
    render(json) {
      lastJson = json;
      return canvas?.render(json);
    },
    // The page is shown scaled down by `s` (0–1): the canvas grows its tools back (the bar, the handles, the labels).
    scale(s) {
      scale = Number.isFinite(s) && s > 0 ? s : 1;
      canvas?.scale?.(scale);
    },
    select(id) {
      selected = id || null;
      canvas?.select(selected);
    },
    hover(id) {
      canvas?.hover(id || null);
    },
    scrollTo(id) {
      if (id) canvas?.scrollToBlock(id);
    },
    // `from`: the point that was pressed (in the editor's window), so the block on the canvas stays held from there.
    dragStart(id, from = null) {
      const p = from ? toFrame(from.x, from.y) : null;
      canvas?.dragStart(id || null, p ? Number(p.x) : NaN, p ? Number(p.y) : NaN);
    },
    // `keep`: the block was dropped (not canceled), so the box moved on the canvas doesn't jump back.
    dragEnd(keep = false) {
      canvas?.dragEnd(keep === true);
    },
    // The target under the point: { slot, index, label, free, at, ghost } or null. On a canvas (`free`),
    // `at` is the chosen place ({ x, y }) or null (at its end); `ghost: false` when the block itself moves
    // on the canvas, so the ghost next to the cursor isn't needed. A point a little outside the sheet is
    // brought onto its edge.
    dropAt(px, py) {
      if (!canvas) return null;
      const p = toFrame(px, py);
      const w = iframe.offsetWidth;
      const h = iframe.offsetHeight;
      p.x = Math.min(Math.max(p.x, 1), Math.max(w - 1, 1));
      p.y = Math.min(Math.max(p.y, 1), Math.max(h - 1, 1));
      const target = canvas.dropAt(p.x, p.y);
      if (!target) return null;
      const free = target.free === true;
      return {
        slot: String(target.slot),
        index: Number(target.index),
        label: String(target.label || ""),
        free,
        at: free ? spot(target.at) : null,
        ghost: target.ghost !== false,
      };
    },
    isStacked(id) {
      return Boolean(id && canvas?.isStacked?.(id));
    },
    clearDrop() {
      canvas?.clearDrop();
    },
    scrollBy(dy) {
      canvas?.scrollBy(dy);
    },
    suppressClick() {
      canvas?.suppressClick();
    },
    flash(id) {
      if (id) canvas?.flash(id);
    },
    rect() {
      return iframe.getBoundingClientRect();
    },
    // On the sheet, with a few pixels of tolerance around it (without leaving the space around it).
    contains(px, py) {
      if (!inside(iframe.getBoundingClientRect(), px, py, TOLERANCE)) return false;
      return !around || inside(around.getBoundingClientRect(), px, py);
    },
    toFrame,
    fromFrame,
  };
}
