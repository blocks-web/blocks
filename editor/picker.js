// Choosing a block after "+": a small menu with a search and the same tiles as the palette.
// The arrow keys choose, Enter adds, Esc closes. Only one menu is open at a time.

import * as registry from "./registry.js";
import { h } from "./util.js";
import { icon } from "./ui.js";
import { blockRow, notNow } from "./palette.js";
import { t } from "./i18n.js";

let open = null;

export const isPickerOpen = () => open !== null;

export function closePicker() {
  if (!open) return;
  const { node, cleanup, onClose } = open;
  open = null;
  cleanup();
  node.remove();
  onClose?.();
}

// openPicker({ at: { x, y } or anchor: element, onPick(type), onClose, onActive(type, el) })
//   at        – the point (in the editor's window) the menu is tied to, e.g. the center of the "+" button
//   anchor    – or an element (the menu shows under it)
//   onActive  – the active item changed (arrow keys or mouse): the preview card follows it
export function openPicker({ at = null, anchor = null, onPick, onClose = null, onActive = null }) {
  closePicker();
  let query = "";
  let active = 0;

  const search = h("input", {
    type: "search",
    class: "picker__search",
    placeholder: t("Search for a block…"),
    "aria-label": t("Search for a block"),
    autocomplete: "off",
    spellcheck: "false",
  });
  const list = h("div", { class: "picker__list" });
  const node = h(
    "div",
    { class: "picker", role: "dialog", "aria-label": t("Add a block") },
    h("div", { class: "picker__head" }, icon("search", 16), search),
    list,
  );

  const items = () => [...list.querySelectorAll(".picker__item")];

  function setActive(i) {
    const all = items();
    if (!all.length) return;
    active = ((i % all.length) + all.length) % all.length;
    all.forEach((el, j) => el.classList.toggle("picker__item--active", j === active));
    all[active].scrollIntoView({ block: "nearest" });
    onActive?.(all[active].dataset.type, all[active]);
  }

  function pick(type) {
    const fn = onPick;
    closePicker();
    fn(type);
  }

  function render() {
    const groups = registry.groups(query, { except: notNow() });
    if (!groups.length) {
      list.replaceChildren(
        h("p", { class: "picker__empty" }, registry.count() ? t("Nothing for “{query}”.", { query: query.trim() }) : t("There are no blocks yet.")),
      );
      return;
    }
    list.replaceChildren(
      ...groups.map((g) =>
        h(
          "section",
          { class: "picker__group" },
          h("h3", { class: "palette__category" }, g.label),
          g.blocks.map((m) =>
            h(
              "button",
              {
                type: "button",
                class: "picker__item",
                tabindex: "-1",
                dataset: { type: m.id },
                onclick: () => pick(m.id),
                onpointermove: (e) => setActive(items().indexOf(e.currentTarget)),
              },
              blockRow(m),
            ),
          ),
        ),
      ),
    );
    setActive(0);
  }

  search.addEventListener("input", () => {
    query = search.value;
    render();
  });
  node.addEventListener("keydown", (e) => {
    // The keys stay in the menu (Delete doesn't delete the block selected behind it).
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(active + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const el = items()[active];
      if (el) pick(el.dataset.type);
    } else if (e.key === "Tab") {
      closePicker();
    }
  });

  document.body.append(node);
  render();
  place(node, at, anchor);

  const onDown = (e) => {
    if (!node.contains(e.target) && !anchor?.contains(e.target)) closePicker();
  };
  // A click in the canvas (iframe) doesn't reach us here, but it takes the window's focus.
  const onBlur = () => closePicker();
  const onResize = () => closePicker();
  document.addEventListener("pointerdown", onDown, true);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", onResize);
  open = {
    node,
    onClose,
    cleanup() {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
    },
  };
  search.focus();
  return node;
}

// The menu sits under the point (or under the element), on screen; if it doesn't fit below, it goes above.
function place(node, at, anchor) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = node.offsetWidth;
  node.style.maxHeight = `${Math.min(440, vh - 32)}px`;
  const hgt = node.offsetHeight;
  let x;
  let top;
  let above = false;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    x = r.left;
    top = r.bottom + 6;
    if (top + hgt > vh - 12) {
      above = true;
      top = r.top - 6 - hgt;
    }
  } else {
    x = (at?.x ?? vw / 2) - w / 2;
    top = (at?.y ?? vh / 2) + 18;
    if (top + hgt > vh - 12) {
      above = true;
      top = (at?.y ?? vh / 2) - 18 - hgt;
    }
  }
  node.style.left = `${Math.round(Math.max(8, Math.min(x, vw - w - 8)))}px`;
  node.style.top = `${Math.round(Math.max(8, Math.min(top, vh - hgt - 8)))}px`;
  node.classList.toggle("picker--above", above);
}
