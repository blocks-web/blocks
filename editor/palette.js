// The "Blocks" palette: the blocks grouped by category, with a search.
// You drag one onto the page or click to add it after the selected block. On hover (or focus) the
// preview card shows up (preview.js); ↑ ↓ go from one block to the next.

import * as registry from "./registry.js";
import { on, state } from "./store.js";
import { h } from "./util.js";
import { icon } from "./ui.js";
import { tile } from "./block-icons.js";
import { t } from "./i18n.js";

// What isn't offered right now: the Navbar and the Footer are edited once, in the shared zones. On a
// page that shows them, a second navbar would sit in the page; on the header, on the footer or on a
// page with "zones": false, they are offered.
export function notNow() {
  return state.kind === "page" && state.doc?.zones !== false ? ["navbar", "footer"] : [];
}

// A block's tile + name + description (also used by the "+" menu). `badge` (optional) starts the
// description's line: the name stays whole, on a single line.
export function blockRow(m, badge = null) {
  return [
    tile(m.icon),
    h(
      "span",
      { class: "block-item__text" },
      h("span", { class: "block-item__name" }, m.name),
      (m.description || badge) && h("span", { class: "block-item__desc" }, badge, m.description),
    ),
  ];
}

// The "server" badge: the block needs the site to run on a server.
export function serverBadge() {
  return h("span", { class: "block-item__badge", title: t("It only works on a site published with a server.") }, t("server"));
}

export function initPalette({ list, search, dnd, preview = null, onAdd }) {
  let query = "";

  let except = "";
  function render() {
    except = notNow().join(",");
    const groups = registry.groups(query, { except: notNow() });
    if (!registry.count()) {
      list.replaceChildren(
        h(
          "div",
          { class: "empty-pane" },
          icon("code", 22),
          h("p", { class: "empty-pane__title" }, t("There are no blocks yet")),
          h("p", null, t("A programmer can create one with:")),
          h("code", null, "node blocks.js component my-block"),
        ),
      );
      return;
    }
    if (!groups.length) {
      list.replaceChildren(
        h(
          "div",
          { class: "empty-pane" },
          icon("search", 22),
          h("p", { class: "empty-pane__title" }, t("Nothing for “{query}”", { query: query.trim() })),
          h("p", null, t("Try another word, for example “text” or “image”.")),
        ),
      );
      return;
    }
    list.replaceChildren(
      ...groups.map((g) =>
        h(
          "section",
          { class: "palette__group" },
          h("h3", { class: "palette__category" }, g.label),
          h("div", { class: "palette__list" }, g.blocks.map(item)),
        ),
      ),
      h("p", { class: "palette__tip" }, t("Drag a block onto the page, or press + where you want it.")),
    );
  }

  function item(m) {
    const btn = h(
      "button",
      {
        type: "button",
        class: "block-item",
        dataset: { type: m.id },
        onclick: () => {
          if (dnd.wasDragged()) return;
          onAdd(m.id);
        },
        // The preview card: on hover or focus; it goes away on a press (click or drag).
        onpointerenter: () => preview?.show(m.id, btn),
        onpointerleave: () => preview?.hide(),
        onfocus: () => preview?.show(m.id, btn, { focus: true }),
        onblur: () => preview?.hide(),
      },
      blockRow(m, registry.hasServer(m.id) ? serverBadge() : null),
    );
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); // no text selection; the click still goes through
      preview?.hide(true);
      dnd.begin(
        { kind: "new", type: m.id },
        { x: e.clientX, y: e.clientY, pointerId: e.pointerId, pointerType: e.pointerType, captureEl: btn },
      );
    });
    btn.addEventListener("dragstart", (e) => e.preventDefault());
    return btn;
  }

  search.addEventListener("input", () => {
    preview?.hide(true);
    query = search.value;
    render();
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) {
      e.stopPropagation();
      search.value = "";
      query = "";
      render();
    } else if (e.key === "Enter") {
      // Enter adds the first block found.
      const first = list.querySelector(".block-item");
      if (first) onAdd(first.dataset.type);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list.querySelector(".block-item")?.focus();
    }
  });
  // ↑ ↓ between blocks (the card follows the focus); Enter adds, like any button.
  list.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const all = [...list.querySelectorAll(".block-item")];
    const i = all.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const next = all[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) next.focus();
    else if (e.key === "ArrowUp") search.focus();
  });

  on("components", render);
  // Another document (or the shared zones turned on / off on the page): what's offered may change.
  on("document", render);
  on("doc", () => notNow().join(",") !== except && render());
  render();
  return { render };
}
