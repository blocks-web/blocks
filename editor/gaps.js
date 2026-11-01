// The gaps: the places between blocks where a dragged block (or one added with "+") can go. Only
// the geometry, without the DOM: the canvas (canvas.js) measures the rectangles, and this module
// gives the lines between blocks and picks the nearest gap. It also runs in Node (tests).
// A rectangle: { left, top, right, bottom, width, height }.

export const MAGNET = 8; // at nearly equal distances the deeper gap wins
export const HYSTERESIS = 6; // the target changes only if the new gap is at least this much closer

// A rectangle without a box (an empty wrapper, a hidden element).
export const isEmptyRect = (r) => !r || (r.width < 1 && r.height < 1);

// The smallest rectangle around all the ones that have a box; null if there are none.
export function union(rects) {
  const real = rects.filter((r) => !isEmptyRect(r));
  if (!real.length) return null;
  const left = Math.min(...real.map((r) => r.left));
  const right = Math.max(...real.map((r) => r.right));
  const top = Math.min(...real.map((r) => r.top));
  const bottom = Math.max(...real.map((r) => r.bottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

// How far the point is from the rectangle (0 inside).
export function distance(r, x, y) {
  const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
  const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
  return Math.hypot(dx, dy);
}

// Two blocks are on the same row if they overlap vertically (grids, flex rows).
export function sameRow(a, b) {
  if (!a || !b || isEmptyRect(a) || isEmptyRect(b)) return false;
  return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) * 0.5;
}

// The line of gap i in a slot whose children are `rects` (u = their union): { vertical, x, y, size }.
// Between two blocks on the same row, vertical; otherwise horizontal, across the whole slot.
// Children without a box are skipped.
export function gapLine(rects, i, u) {
  const a = i > 0 && !isEmptyRect(rects[i - 1]) ? rects[i - 1] : null;
  const b = i < rects.length && !isEmptyRect(rects[i]) ? rects[i] : null;
  if (a && b) {
    if (sameRow(a, b)) {
      const top = Math.min(a.top, b.top);
      return { vertical: true, x: (a.right + b.left) / 2, y: top, size: Math.max(a.bottom, b.bottom) - top };
    }
    return { vertical: false, x: u.left, y: (a.bottom + b.top) / 2, size: u.width };
  }
  if (b) {
    const c = rects[i + 1];
    if (c && !isEmptyRect(c) && sameRow(b, c)) return { vertical: true, x: b.left, y: b.top, size: b.height };
    return { vertical: false, x: u.left, y: b.top, size: u.width };
  }
  if (a) {
    const c = rects[i - 2];
    if (c && !isEmptyRect(c) && sameRow(c, a)) return { vertical: true, x: a.right, y: a.top, size: a.height };
    return { vertical: false, x: u.left, y: a.bottom, size: u.width };
  }
  return null;
}

// The rectangle of a line (a flat one), so the distance to it is measured as for any rectangle.
export function lineRect(line) {
  return line.vertical
    ? { left: line.x, right: line.x, top: line.y, bottom: line.y + line.size }
    : { left: line.x, right: line.x + line.size, top: line.y, bottom: line.y };
}

// Among the candidates ([{ slot, index, depth, rect }]), the gap for the point (x, y): the nearest,
// but at nearly equal distances (MAGNET) the deepest, so a container can also be targeted from its
// edge. `current` ({ slot, index }, looked up in `all`) stays unless the new one is closer by at least
// HYSTERESIS: no flicker when the cursor sits between two gaps.
export function pickGap(candidates, x, y, current = null, all = candidates) {
  if (!candidates.length) return null;
  const scored = candidates.map((g) => ({ g, d: distance(g.rect, x, y) })).sort((a, b) => a.d - b.d);
  let best = scored[0];
  for (const sc of scored) {
    if (sc.d > scored[0].d + MAGNET) break;
    if (sc.g.depth > best.g.depth) best = sc;
  }
  if (current) {
    const same = all.find((g) => g.slot === current.slot && g.index === current.index);
    if (same && same !== best.g && !(best.d <= distance(same.rect, x, y) - HYSTERESIS)) return same;
  }
  return best.g;
}
