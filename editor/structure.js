// The "Structure" panel: the document's block tree, with the slots as subgroups.
// A click selects (and scrolls the canvas to the block); blocks can be dragged from here too.
//
// From the keyboard it's a single stop in the Tab order (the selected row or the first one):
// ↑ ↓ Home End go from one block to another and select it, → ← open and close the containers
// (or go to the child / parent), Alt + ↑ ↓ move the block to the previous / next gap (into and out
// of containers, as on the canvas).

import { safePlacement } from "../core/render.js";
import * as registry from "./registry.js";
import { on, state } from "./store.js";
import { canDrop, countBlocks, locate, parseSlotKey, slotInfo, summaryOf } from "./tree.js";
import { h } from "./util.js";
import { icon } from "./ui.js";
import { tile } from "./block-icons.js";
import { slotLabel, t, tn } from "./i18n.js";

// "At the start / end of …": where a dropped block goes in the main list.
function whereInList(kind, end) {
  if (kind === "header") return end ? t("At the end of the header") : t("At the start of the header");
  if (kind === "footer") return end ? t("At the end of the footer") : t("At the start of the footer");
  return end ? t("At the end of the page") : t("At the start of the page");
}

export function initStructure({ root, pane, dnd, actions, isVisible }) {
  const collapsed = new Set();
  const marker = h("div", { class: "tree__line", "aria-hidden": "true" });
  // The "+" at the end of the tree: opens the blocks menu and adds at the end of the page.
  const addBtn = h(
    "button",
    { type: "button", class: "tree__add", "aria-haspopup": "dialog", "aria-expanded": "false" },
    icon("plus", 16),
    t("Add a block"),
  );
  addBtn.addEventListener("click", () => {
    addBtn.setAttribute("aria-expanded", "true");
    actions.pickBlock({
      anchor: addBtn,
      slot: "root",
      index: state.doc?.blocks.length ?? 0,
      onClose: () => addBtn.setAttribute("aria-expanded", "false"),
    });
  });
  let highlighted = null;
  let target = null;
  let scheduled = false;
  let lastSelected = null;
  let hidden = new Set(); // the slots that don't show on the page (you can't drag into them)
  let free = new Set(); // the canvases: their blocks show in reading order, as on the site
  let stale = false; // while hidden, the panel isn't rebuilt at every key; it is when it shows

  function schedule() {
    if (!isVisible()) {
      stale = true;
      return;
    }
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      render();
    });
  }

  function render() {
    const doc = state.doc;
    if (!doc) {
      root.replaceChildren();
      return;
    }
    // The focus is on a row that gets rebuilt: we put it back on the same block.
    const focused = root.contains(document.activeElement) ? document.activeElement.closest(".tree__row") : null;
    stale = false;
    ({ hidden, free } = slotInfo(doc, registry.get, { page: doc, site: state.site || {} }));
    const zonesShown = state.kind === "page" && doc.zones !== false;
    const rows = [];
    if (zonesShown) rows.push(zoneRow("header"));
    if (doc.blocks.length) rows.push(...doc.blocks.map((b, i) => node(b, "root", i, 0)));
    else {
      const title = state.kind === "zone" ? (state.name === "header" ? t("The header is empty") : t("The footer is empty")) : t("The page is empty");
      rows.push(
        h(
          "div",
          { class: "empty-pane empty-pane--tree", dataset: { drop: "slot", slotkey: "root" } },
          icon("layers", 22),
          h("p", { class: "empty-pane__title" }, title),
          h("p", null, t("Drag a block from “Blocks” or press +.")),
        ),
      );
    }
    if (zonesShown) rows.push(zoneRow("footer"));
    root.replaceChildren(...rows, addBtn, marker);
    target = null;
    const active = rowOf(state.selected) || root.querySelector(".tree__row");
    if (active) active.tabIndex = 0;
    if (focused) (rowOf(focused.dataset.id) || active)?.focus({ preventScroll: true });
    if (highlighted) setHighlight(highlighted);
    // The block selected on the canvas becomes visible in the tree too.
    if (state.selected !== lastSelected) {
      lastSelected = state.selected;
      if (lastSelected && isVisible()) {
        rowOf(lastSelected)?.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function zoneRow(name) {
    const blocks = state.zones?.[name]?.blocks || [];
    const count = countBlocks(blocks);
    return h(
      "button",
      {
        type: "button",
        class: "tree__zone",
        title: name === "header" ? t("Edit the shared header (it shows on every page)") : t("Edit the shared footer (it shows on every page)"),
        onclick: () => actions.openDoc("zone", name),
      },
      icon(name, 15),
      h("span", { class: "tree__zone-name" }, name === "header" ? t("Shared header") : t("Shared footer")),
      h("span", { class: "tree__zone-info" }, blocks.length ? tn(count, "{n} block", "{n} blocks") : t("empty")),
      icon("chevron-right", 14),
    );
  }

  const rowOf = (id) => (id ? root.querySelector(`.tree__row[data-id="${CSS.escape(id)}"]`) : null);

  function toggle(id) {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    render();
  }

  function node(block, slot, index, depth) {
    const comp = registry.get(block.type);
    const m = registry.meta(block.type);
    const isCollapsed = collapsed.has(block.id);
    const summary = summaryOf(block, comp);

    // The areas that the component doesn't show right now (e.g. "Column 3" with 2 columns) don't
    // show at all when they're empty; with blocks in them, they show marked, so the blocks can be moved.
    const groups = [];
    for (const name of Object.keys(comp?.slots || {})) {
      const key = `${block.id}:${name}`;
      const kids = Array.isArray(block.slots?.[name]) ? block.slots[name] : [];
      const off = hidden.has(key);
      if (off && !kids.length) continue;
      groups.push({ key, name, label: slotLabel(comp, name), kids, off });
    }
    const expandable = groups.length > 0;

    const row = h(
      "div",
      {
        class: `tree__row ${state.selected === block.id ? "tree__row--selected" : ""} ${m.exists ? "" : "tree__row--missing"}`,
        role: "treeitem",
        tabindex: "-1",
        "aria-level": String(depth + 1),
        "aria-selected": state.selected === block.id ? "true" : "false",
        "aria-expanded": expandable ? String(!isCollapsed) : null,
        style: { "--level": depth },
        dataset: { drop: "row", id: block.id, slot, index: String(index) },
      },
      expandable
        ? h(
            "button",
            {
              type: "button",
              class: `tree__toggle ${isCollapsed ? "" : "tree__toggle--open"}`,
              tabindex: "-1",
              "aria-label": isCollapsed ? t("Show what's inside") : t("Hide what's inside"),
              onclick: (e) => {
                e.stopPropagation();
                toggle(block.id);
              },
            },
            icon("chevron-right", 12),
          )
        : h("span", { class: "tree__toggle tree__toggle--none" }),
      tile(m.icon, "tile--small"),
      h("span", { class: "tree__name" }, m.exists ? m.name : t("{type} (missing)", { type: block.type })),
      summary && h("span", { class: "tree__summary" }, summary),
    );
    row.addEventListener("click", () => {
      if (dnd.wasDragged()) return;
      actions.select(block.id, { scroll: true });
    });
    row.addEventListener("keydown", (e) => onRowKey(e, row, { id: block.id, slot, expandable, isCollapsed }));
    row.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".tree__toggle")) return;
      dnd.begin(
        { kind: "move", id: block.id },
        { x: e.clientX, y: e.clientY, pointerId: e.pointerId, pointerType: e.pointerType, captureEl: row },
      );
    });
    row.addEventListener("pointerenter", () => actions.hoverBlock(block.id));
    row.addEventListener("pointerleave", () => actions.hoverBlock(null));

    if (!expandable || isCollapsed) return h("div", { class: "tree__node", role: "none" }, row);

    const children = groups.map(({ key, label, kids, off }) =>
      h(
        "div",
        { class: `tree__group ${off ? "tree__group--hidden" : ""}`, role: "group", style: { "--level": depth + 1 } },
        off
          ? h(
              "div",
              {
                class: "tree__slot tree__slot--hidden",
                title: t("“{block}” doesn't show “{area}” right now (see the block's settings), so the blocks here don't show on the page. Move them somewhere else.", {
                  block: m.name,
                  area: label,
                }),
              },
              icon("alert", 12),
              label,
              h("span", { class: "tree__hidden" }, t("not on the page")),
            )
          : h("div", { class: "tree__slot", dataset: { drop: "slot", slotkey: key } }, icon("slot", 12), label),
        kids.length
          ? readingOrder(key, kids).map(({ k, i }) => node(k, key, i, depth + 1))
          : h("div", { class: "tree__empty", dataset: { drop: "slot", slotkey: key } }, t("Empty — drag here")),
      ),
    );
    return h("div", { class: "tree__node", role: "none" }, row, ...children);
  }

  // The children of an area, with their place in the list. On a canvas, in reading order (row,
  // column, list), as in the core: that's how a visitor sees them and how a screen reader reads them.
  function readingOrder(key, kids) {
    const out = kids.map((k, i) => ({ k, i })).filter(({ k }) => k && typeof k === "object");
    if (!free.has(key)) return out;
    const a = new Map(out.map(({ k }) => [k, safePlacement(k.placement)]));
    return out.sort((p, q) => a.get(p.k).y - a.get(q.k).y || a.get(p.k).x - a.get(q.k).x || p.i - q.i);
  }

  // ---- The keyboard ----

  function focusRow(row) {
    if (!row) return;
    for (const r of root.querySelectorAll('.tree__row[tabindex="0"]')) r.tabIndex = -1;
    row.tabIndex = 0;
    row.focus();
    actions.select(row.dataset.id, { scroll: true });
  }

  function onRowKey(e, row, { id, slot, expandable, isCollapsed }) {
    if (e.metaKey || e.ctrlKey) return;
    const all = [...root.querySelectorAll(".tree__row")];
    const i = all.indexOf(row);
    let next = null;
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        actions.select(id, { scroll: true });
        return;
      case "ArrowDown":
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) {
          // The move rebuilds the tree before the key reaches the window: we stop it here, otherwise
          // the window's shortcut (Alt+↑↓ from the canvas) would move the block once more.
          e.stopPropagation();
          actions.moveBy(id, e.key === "ArrowUp" ? -1 : 1);
          return;
        }
        next = all[i + (e.key === "ArrowDown" ? 1 : -1)];
        break;
      case "Home":
        next = all[0];
        break;
      case "End":
        next = all[all.length - 1];
        break;
      case "ArrowRight":
        if (expandable && isCollapsed) toggle(id);
        // The first child, if the container has blocks in it.
        else if (expandable && all[i + 1] && row.parentElement.contains(all[i + 1])) next = all[i + 1];
        break;
      case "ArrowLeft":
        if (expandable && !isCollapsed) toggle(id);
        else next = rowOf(parseSlotKey(slot).owner);
        break;
      default:
        return;
    }
    e.preventDefault();
    focusRow(next);
  }

  function setHighlight(id) {
    highlighted = id;
    for (const r of root.querySelectorAll(".tree__row--hover")) r.classList.remove("tree__row--hover");
    rowOf(id)?.classList.add("tree__row--hover");
  }

  // ---- The drag & drop target, from the rows' geometry ----

  // What the ghost's pill says: where the block goes.
  function labelOf(target, source) {
    if (source?.kind === "move") {
      const loc = locate(state.doc, source.id);
      // On its own canvas, the order in the list doesn't matter (the placement gives the place): anywhere on it, it stays.
      if (loc && loc.key === target.slot && (free.has(target.slot) || target.index === loc.index || target.index === loc.index + 1)) return t("Stays here");
    }
    if (target.slot === "root") {
      const n = state.doc?.blocks.length || 0;
      const kind = state.kind === "zone" ? state.name : "page";
      return !n ? "" : target.index === 0 ? whereInList(kind, false) : target.index >= n ? whereInList(kind, true) : "";
    }
    const { owner, name } = parseSlotKey(target.slot);
    const block = owner && locate(state.doc, owner)?.block;
    if (!block) return "";
    return t("In “{area}” · {block}", { area: slotLabel(registry.get(block.type), name), block: registry.meta(block.type).name });
  }

  function clearDrop() {
    marker.style.display = "none";
    for (const n of root.querySelectorAll(".tree--target")) n.classList.remove("tree--target");
    target = null;
  }

  function dropAt(x, y, source) {
    if (!isVisible()) return null;
    const box = pane.getBoundingClientRect();
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) {
      clearDrop();
      return null;
    }
    const items = [...root.querySelectorAll("[data-drop]")];
    let hit = null;
    for (const it of items) {
      const r = it.getBoundingClientRect();
      if (r.height && y >= r.top && y < r.bottom) {
        hit = it;
        break;
      }
    }
    const rootBox = root.getBoundingClientRect();
    let found;
    let lineY = null;
    let indent = 0;
    if (!hit) {
      const rows = items.filter((n) => n.dataset.drop === "row" && n.dataset.slot === "root");
      const first = rows[0]?.getBoundingClientRect();
      const last = rows[rows.length - 1];
      const before = first && y < first.top;
      // Under the "+" button there's no position.
      if (!before && y > addBtn.getBoundingClientRect().bottom) {
        clearDrop();
        return null;
      }
      found = { slot: "root", index: before ? 0 : state.doc.blocks.length };
      if (before) lineY = first.top;
      else if (last) lineY = last.closest(".tree__node").getBoundingClientRect().bottom;
    } else if (hit.dataset.drop === "row") {
      const r = hit.getBoundingClientRect();
      const after = y > r.top + r.height / 2;
      found = { slot: hit.dataset.slot, index: Number(hit.dataset.index) + (after ? 1 : 0) };
      lineY = after ? hit.closest(".tree__node").getBoundingClientRect().bottom : r.top;
      indent = parseFloat(getComputedStyle(hit).paddingLeft) || 0;
    } else if (hit.dataset.drop === "slot") {
      found = { slot: hit.dataset.slotkey, index: 0 };
    } else {
      clearDrop();
      return null;
    }
    if (hidden.has(found.slot) || (source?.kind === "move" && !canDrop(state.doc, source.id, found.slot))) {
      clearDrop();
      return null;
    }
    for (const n of root.querySelectorAll(".tree--target")) n.classList.remove("tree--target");
    if (lineY !== null) {
      marker.style.display = "block";
      marker.style.top = `${Math.round(lineY - rootBox.top - 1.5)}px`;
      marker.style.left = `${Math.round(indent)}px`;
    } else {
      marker.style.display = "none";
      hit?.classList.add("tree--target");
    }
    target = { ...found, label: labelOf(found, source) };
    return target;
  }

  function scrollBy(x, y, dy) {
    const box = pane.getBoundingClientRect();
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) pane.scrollTop += dy;
  }

  // The automatic scrolling during a drag (dnd.js says how much).
  function scrollPane(dy) {
    pane.scrollTop += dy;
  }

  on("doc", schedule);
  on("document", schedule);
  on("selection", schedule);
  on("components", schedule);
  on("zones", schedule);
  render();

  return {
    render: schedule,
    highlight: setHighlight,
    dropAt,
    clearDrop,
    scrollBy,
    scrollPane,
    dragStart() {
      root.classList.add("tree--dragging");
    },
    dragEnd() {
      root.classList.remove("tree--dragging");
      clearDrop();
    },
  };
}
