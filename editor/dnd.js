// Drag & drop with pointer events (not HTML5 drag & drop), from three places:
//   the palette   → a new block      source = { kind: "new", type }
//   the canvas    → moves a block    source = { kind: "move", id }
//   Structure     → moves a block    (the same source)
// The target is looked up on the canvas (canvas.js) or in the Structure tree: { slot, index, label }.
// The page shows a single indicator (the line or the lit empty area); where the block goes is written
// on the ghost's pill, next to the cursor. On a Free canvas the target also has { free, at }: a ghost
// box on the grid or, for a block already on it, the moved block itself (no ghost).
//
// Mouse / trackpad: the drag starts after 5 px. Touch / pen: hold for 250 ms without moving
// (otherwise it's the usual scrolling); after that the browser no longer scrolls (a non-passive
// touchmove) and the ghost sits above the finger.
//
// Chrome may keep sending the moves to the window where the press started (the iframe), so we
// listen in both documents and convert the coordinates.

import { h, isEditable } from "./util.js";
import { tile } from "./block-icons.js";

const THRESHOLD = { mouse: 5, touch: 8, pen: 8 }; // pixels of movement before the drag starts (or before it's scrolling, for touch)
const LONG_PRESS = 250; // ms of a long press, for touch
const EDGE = { mouse: 80, touch: 100 }; // near the canvas's top / bottom edge, the page scrolls by itself
const SPEED = [2, 28]; // px / frame, from the band's edge outwards (ease-in)
const BEYOND = 120; // the scrolling goes on outside the canvas, this far
const PANEL_DELAY = 300; // ms over the left panel until the Structure tab comes

export function createDnd({ host, tree, describe, valid, onDrop }) {
  let s = null;
  let justDragged = false;

  function begin(source, { x, y, pointerId, pointerType = "mouse", fromFrame = false, captureEl = null }) {
    if (s) end();
    const p = fromFrame ? host.fromFrame(x, y) : { x, y };
    s = {
      source,
      startX: p.x,
      startY: p.y,
      x: p.x,
      y: p.y,
      pointerId,
      pointerType: pointerType === "touch" || pointerType === "pen" ? pointerType : "mouse",
      touch: false,
      dragging: false,
      target: null,
      frameDoc: null,
      captureEl,
      ghost: null,
      where: null,
      shield: null,
      raf: 0,
      timer: null,
      needTarget: false,
      // Structure comes by itself once the ghost sits over the left panel; for a block from the palette
      // only after the cursor has left it once (otherwise it would come right at the start).
      panelSince: 0,
      leftPanel: source.kind !== "new",
      structureShown: false,
    };
    window.addEventListener("pointermove", onParentMove, true);
    window.addEventListener("pointerup", onParentUp, true);
    window.addEventListener("pointercancel", onCancelEvent, true);
    const doc = host.document;
    if (doc) {
      s.frameDoc = doc;
      doc.addEventListener("pointermove", onFrameMove, true);
      doc.addEventListener("pointerup", onFrameUp, true);
      doc.addEventListener("pointercancel", onCancelEvent, true);
    }
    if (s.pointerType !== "mouse") {
      s.timer = setTimeout(() => s && !s.dragging && startDragging(), LONG_PRESS);
      s.frameDoc?.addEventListener("contextmenu", onContextMenu, true);
    }
  }

  // Only the finger (or the mouse) that picked the block up: a second finger doesn't move it or drop it.
  const mine = (e) => s && (s.pointerId == null || e.pointerId === s.pointerId);
  const onParentMove = (e) => mine(e) && move(e.clientX, e.clientY, e);
  const onParentUp = (e) => mine(e) && up();
  const onFrameMove = (e) => {
    if (!mine(e)) return;
    const p = host.fromFrame(e.clientX, e.clientY);
    move(p.x, p.y, e);
  };
  const onFrameUp = (e) => mine(e) && up();
  const onCancelEvent = (e) => mine(e) && cancel();
  const onTouchMove = (e) => {
    if (s?.dragging) e.preventDefault();
  };
  // Otherwise the long press opens the browser's menu over the lifted block: during it (Android) or
  // right after you lift the finger (Windows). A right click with the mouse stays untouched.
  let menuUntil = 0;
  const onContextMenu = (e) => {
    if ((s && s.pointerType !== "mouse") || performance.now() < menuUntil) e.preventDefault();
  };
  window.addEventListener("contextmenu", onContextMenu, true);

  function move(x, y, e) {
    if (!s) return;
    // The button was released outside the window: we give up.
    if (e && e.pointerType === "mouse" && (e.buttons & 1) === 0) return cancel();
    s.x = x;
    s.y = y;
    if (!s.dragging) {
      const far = Math.hypot(x - s.startX, y - s.startY) >= THRESHOLD[s.pointerType];
      if (s.pointerType !== "mouse") {
        // The finger slid before it lifted the block: it's scrolling, not a drag.
        if (far) end();
        return;
      }
      if (!far) return;
      startDragging();
    }
    e?.preventDefault?.();
    s.needTarget = true;
    placeGhost();
  }

  function startDragging() {
    clearTimeout(s.timer);
    s.dragging = true;
    s.touch = s.pointerType !== "mouse";
    const d = describe(s.source);
    // The ghost: a small card (tile + name + summary) and, under it, the "where it goes" pill.
    s.where = h("span", { class: "ghost__where" });
    s.ghost = h(
      "div",
      { class: `ghost ${s.touch ? "ghost--touch" : ""}`, "aria-hidden": "true" },
      h(
        "div",
        { class: "ghost__card" },
        tile(d.icon),
        h("span", { class: "ghost__text" }, h("span", { class: "ghost__name" }, d.name), d.summary && h("span", { class: "ghost__summary" }, d.summary)),
      ),
      s.where,
    );
    s.shield = h("div", { class: "drag-shield" });
    s.shield.addEventListener("wheel", onWheel, { passive: false });
    document.body.append(s.shield, s.ghost);
    document.body.classList.add("dragging");
    if (isEditable(document.activeElement)) document.activeElement.blur();
    if (s.captureEl) {
      try {
        s.captureEl.setPointerCapture(s.pointerId);
      } catch {
        // the pointer is no longer active
      }
    }
    if (s.touch) {
      // While we hold the block, the page no longer scrolls under the finger.
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      s.frameDoc?.addEventListener("touchmove", onTouchMove, { passive: false });
      navigator.vibrate?.(10);
    }
    // The point that was pressed: on a canvas, the block stays held from exactly there.
    host.dragStart(s.source.kind === "move" ? s.source.id : null, { x: s.startX, y: s.startY });
    tree?.dragStart?.();
    s.needTarget = true;
    placeGhost();
    s.raf = requestAnimationFrame(frame);
  }

  // The ghost sits centered on the cursor, 16 px to its right (to the left, if it doesn't fit); for touch, above the finger.
  function placeGhost() {
    if (!s?.ghost) return;
    const w = s.ghost.offsetWidth;
    const hg = s.ghost.offsetHeight;
    let x;
    let y;
    if (s.touch) {
      x = s.x - w / 2;
      y = s.y - 56 - hg;
    } else {
      x = s.x + 16;
      y = s.y - hg / 2;
      if (x + w > window.innerWidth - 8) x = s.x - 16 - w;
    }
    s.ghost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  // The target is computed once per frame, not at every pointermove.
  function frame(now) {
    if (!s?.dragging) return;
    s.raf = requestAnimationFrame(frame);
    if (autoScroll()) s.needTarget = true;
    if (s.needTarget) {
      s.needTarget = false;
      updateTarget();
    }
    hoverPanel(now);
  }

  function updateTarget() {
    if (!s?.dragging) return;
    let target = null;
    if (host.contains(s.x, s.y)) {
      tree?.clearDrop();
      target = host.dropAt(s.x, s.y);
    } else {
      host.clearDrop();
      target = tree?.dropAt(s.x, s.y, s.source) || null;
    }
    if (target && !valid(s.source, target)) {
      target = null;
      host.clearDrop();
      tree?.clearDrop();
    }
    s.target = target;
    s.ghost.classList.toggle("ghost--blocked", !target);
    // On its own canvas, the block moves itself: the ghost next to the cursor would be one too many.
    s.ghost.classList.toggle("ghost--hidden", target?.ghost === false);
    const where = target?.label || "";
    if (s.where.textContent !== where) {
      s.where.textContent = where;
      placeGhost();
    }
  }

  // The mouse wheel still scrolls the canvas or the tree, during the drag too.
  function onWheel(e) {
    if (!s) return;
    e.preventDefault();
    if (host.contains(s.x, s.y)) host.scrollBy(e.deltaY);
    else tree?.scrollBy?.(s.x, s.y, e.deltaY);
    s.needTarget = true;
  }

  // The automatic scrolling: faster and faster toward the edge (ease-in), and beyond the canvas (the
  // top bar, the window's edge) up to BEYOND px. The same in the Structure panel. Returns true if it scrolled.
  function autoScroll() {
    const margin = s.touch ? EDGE.touch : EDGE.mouse;
    const speed = (k) => SPEED[0] + (SPEED[1] - SPEED[0]) * k * k * k;
    const dyFor = (r) => {
      if (s.y < r.top + margin && s.y > r.top - BEYOND) return -speed(Math.min(1, (r.top + margin - s.y) / margin));
      if (s.y > r.bottom - margin && s.y < r.bottom + BEYOND) return speed(Math.min(1, (s.y - (r.bottom - margin)) / margin));
      return 0;
    };
    const r = host.rect();
    if (s.x >= r.left && s.x <= r.right) {
      const dy = dyFor(r);
      if (dy) host.scrollBy(Math.round(dy));
      return dy !== 0;
    }
    const tr = tree?.rect?.();
    if (tr && s.x >= tr.left && s.x <= tr.right) {
      const dy = dyFor(tr);
      if (dy) tree.scrollPane?.(Math.round(dy));
      return dy !== 0;
    }
    return false;
  }

  // The ghost stays ≥ PANEL_DELAY ms over the left panel → the Structure tab comes (a long page, on one screen).
  function hoverPanel(now) {
    const pr = tree?.panelRect?.();
    const over = pr && s.x >= pr.left && s.x < pr.right && s.y >= pr.top && s.y < pr.bottom;
    if (!over) {
      s.panelSince = 0;
      s.leftPanel = true;
      return;
    }
    if (!s.leftPanel || s.structureShown) return;
    if (!s.panelSince) s.panelSince = now;
    else if (now - s.panelSince >= PANEL_DELAY) {
      s.structureShown = true;
      tree?.showStructure?.();
      s.needTarget = true;
    }
  }

  function up() {
    if (!s) return;
    // Released in the same frame as the last move: the target is computed now.
    if (s.dragging && s.needTarget) updateTarget();
    const { dragging, target, source, touch } = s;
    end(Boolean(target));
    if (!dragging) return; // it was a click: the usual click handles it
    markDragged();
    if (!target) return;
    onDrop(source, target);
    if (touch) navigator.vibrate?.(10);
  }

  // The click that comes after a drag (or after Esc) must not add or select anything.
  function markDragged() {
    justDragged = true;
    host.suppressClick();
    setTimeout(() => (justDragged = false), 0);
  }

  function cancel() {
    if (!s) return;
    const wasDragging = s.dragging;
    const frameDoc = s.frameDoc;
    end();
    if (!wasDragging) return;
    // The button is still pressed: we swallow the click on release.
    justDragged = true;
    // Only once: on release or, if the release never comes, after 4 seconds.
    let timer = null;
    const swallow = () => {
      clearTimeout(timer);
      window.removeEventListener("pointerup", swallow, true);
      frameDoc?.removeEventListener("pointerup", swallow, true);
      markDragged();
    };
    window.addEventListener("pointerup", swallow, true);
    frameDoc?.addEventListener("pointerup", swallow, true);
    timer = setTimeout(swallow, 4000);
  }

  // `dropped`: the drag ends with the block dropped on a target (not canceled).
  function end(dropped = false) {
    if (!s) return;
    clearTimeout(s.timer);
    cancelAnimationFrame(s.raf);
    window.removeEventListener("pointermove", onParentMove, true);
    window.removeEventListener("pointerup", onParentUp, true);
    window.removeEventListener("pointercancel", onCancelEvent, true);
    document.removeEventListener("touchmove", onTouchMove);
    if (s.frameDoc) {
      s.frameDoc.removeEventListener("pointermove", onFrameMove, true);
      s.frameDoc.removeEventListener("pointerup", onFrameUp, true);
      s.frameDoc.removeEventListener("pointercancel", onCancelEvent, true);
      s.frameDoc.removeEventListener("touchmove", onTouchMove);
    }
    if (s.captureEl) {
      try {
        s.captureEl.releasePointerCapture(s.pointerId);
      } catch {
        // already released
      }
    }
    const wasDragging = s.dragging;
    if (s.pointerType !== "mouse") menuUntil = performance.now() + 600;
    s.ghost?.remove();
    s.shield?.remove();
    s = null;
    if (wasDragging) {
      document.body.classList.remove("dragging");
      host.dragEnd(dropped);
      tree?.clearDrop();
      tree?.dragEnd?.();
    }
  }

  return {
    begin,
    cancel,
    // The page was displayed again during the drag (e.g. a component was reloaded): the target and
    // the indicator are recomputed at the next frame, on the new geometry.
    refresh() {
      if (s?.dragging) s.needTarget = true;
    },
    get active() {
      return Boolean(s?.dragging);
    },
    wasDragged: () => justDragged,
  };
}
