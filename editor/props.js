// The "Settings" panel (on the right): the selected block's settings, the page's (when nothing is
// selected) or what a shared zone is.
//
// The panel isn't rebuilt when the change comes from the panel itself (you would be typing and lose
// the cursor); it's rebuilt on selection, Undo, drag & drop and so on.

import { COLUMNS, LIMITS, safePlacement, withDefaults } from "../core/render.js";
import * as registry from "./registry.js";
import { on, state } from "./store.js";
import { ancestors, locate, positionIndex, positions, slotInfo } from "./tree.js";
import { h, MOD } from "./util.js";
import { icon } from "./ui.js";
import { createField } from "./fields.js";
import { tile } from "./block-icons.js";
import { layerMoves } from "./grid.js";
import { blockFields, slotLabel, t } from "./i18n.js";

// The shapes of a cell on the canvas (the values come only from the core's list: rect, rounded, circle).
const SHAPES_UI = [
  ["rect", t("Rectangle")],
  ["rounded", t("Rounded corners")],
  ["circle", t("Circle")],
];
// "The image fills the box" only makes sense for the blocks with a single image.
const FILLS = ["image"];

export function initProps({ root, actions }) {
  const openCards = new Map(); // "blockId|listKey" → Set(open indexes)
  let scheduled = false;
  let lastKey = null;
  let focusFirstPending = false;
  let reveal = null; // { path, index }: the list item just added

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    // Several events from the same step (doc + selection) → a single rebuild.
    queueMicrotask(() => {
      scheduled = false;
      rebuild();
    });
  }

  function rebuild() {
    const active = document.activeElement;
    const focusPath = active && root.contains(active) ? active.dataset?.path : null;
    let caret = null;
    try {
      if (focusPath && typeof active.selectionStart === "number") caret = [active.selectionStart, active.selectionEnd];
    } catch {
      caret = null;
    }
    const key = `${state.kind}:${state.name}:${state.selected || ""}`;
    const scroll = key === lastKey ? root.scrollTop : 0;
    lastKey = key;
    root.replaceChildren(build());
    root.scrollTop = scroll;
    if (focusPath) {
      const el = root.querySelector(`[data-path="${CSS.escape(focusPath)}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        if (caret) {
          try {
            el.setSelectionRange(Math.min(caret[0], el.value.length), Math.min(caret[1], el.value.length));
          } catch {
            // the field has no text cursor
          }
        }
      }
    }
    if (reveal) {
      // The new list item: we bring it into view and type straight into its first text.
      const { path, index } = reveal;
      reveal = null;
      const card = root.querySelector(`.list__card[data-list="${CSS.escape(path)}"][data-index="${index}"]`);
      if (card) {
        card.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const first = card.querySelector(".field--text .input, .field--longtext .input");
        if (first) {
          first.focus({ preventScroll: true });
          first.select?.();
        }
      }
    }
    if (focusFirstPending) {
      focusFirstPending = false;
      const first = root.querySelector(".fields input:not([type=checkbox]):not([type=color]):not([type=file]), .fields textarea");
      if (first) {
        first.focus();
        first.select?.();
      }
    }
  }

  function build() {
    if (!state.doc) return h("div", { class: "empty-pane" }, h("p", null, t("Loading…")));
    const loc = state.selected ? locate(state.doc, state.selected) : null;
    if (loc) return blockPanel(loc);
    return state.kind === "zone" ? zonePanel() : pagePanel();
  }

  // ---- The selected block ----

  function blockPanel(loc) {
    const block = loc.block;
    const comp = registry.get(block.type);
    const m = registry.meta(block.type);
    const chain = ancestors(state.doc, block.id).reverse();

    const head = h(
      "div",
      { class: "props-head" },
      tile(m.icon),
      h(
        "div",
        { class: "props-head__text" },
        h("h2", { class: "props-head__name" }, m.exists ? m.name : block.type),
        m.description && h("p", { class: "props-head__desc", title: m.description }, m.description),
      ),
    );

    const crumbs = chain.length
      ? h(
          "nav",
          { class: "crumbs", "aria-label": t("Where the block is") },
          h(
            "button",
            { type: "button", class: "crumbs__item", onclick: () => actions.select(null) },
            state.kind === "zone" ? (state.name === "header" ? t("Shared header") : t("Shared footer")) : t("Page"),
          ),
          chain.map((a) => [
            icon("chevron-right", 11),
            h(
              "button",
              { type: "button", class: "crumbs__item", onclick: () => actions.select(a.block.id, { scroll: true }) },
              registry.meta(a.block.type).name,
            ),
          ]),
          icon("chevron-right", 11),
          h("span", { class: "crumbs__item crumbs__item--current" }, m.name),
        )
      : null;

    // `title`: the full text on hover, when the label on the button is shortened.
    const action = (name, label, fn, disabled, shortcut, danger, title = label) =>
      h(
        "button",
        {
          type: "button",
          class: `action ${danger ? "action--danger" : ""}`,
          title: shortcut ? `${title} (${shortcut})` : title,
          disabled,
          onclick: fn,
        },
        icon(name, 16),
        h("span", null, label),
      );
    // "Move up / down" go through the document's gaps (and into / out of containers), like Alt+Up/Down.
    // On a canvas, the block moves by dragging or with the arrow keys; here the two buttons take it off.
    // A single pass through the document for hidden areas and canvases (used several times below).
    const info = slotInfo(state.doc, registry.get, { page: state.doc, site: state.site || {} });
    const onGrid = info.free.has(loc.key);
    const gaps = positions(state.doc, registry.get, {}, { except: block.id, info });
    const here = positionIndex(gaps, loc);
    const can = (delta) => (here === -1 ? loc.index + delta >= 0 && loc.index + delta < loc.list.length : Boolean(gaps[here + delta]));
    const tiles = h(
      "div",
      { class: `actions ${onGrid ? "actions--three" : ""}` },
      onGrid
        ? action("move-out", t("Move off canvas"), () => actions.moveBy(block.id, 1), !can(1), t("Alt+↓; Alt+↑ puts it just above"), false, t("Move the block off the canvas, to just below it"))
        : [
            action("up", t("Up"), () => actions.moveBy(block.id, -1), !can(-1), t("Alt+↑; also into and out of other blocks"), false, t("Move the block up")),
            action("down", t("Down"), () => actions.moveBy(block.id, 1), !can(1), t("Alt+↓; also into and out of other blocks"), false, t("Move the block down")),
          ],
      action("duplicate", t("Duplicate"), () => actions.duplicate(block.id), false, `${MOD}D`),
      action("trash", t("Delete"), () => actions.remove(block.id), false, "Delete", true),
    );
    // The block is in a slot that its container doesn't show right now (e.g. "Column 3" with 2 columns).
    const hidden = loc.parent ? info.hidden : null;
    const cause = hidden?.has(loc.key) ? chain.find((a) => hidden.has(`${a.block.id}:${a.slot}`)) : null;
    const hiddenNote = cause
      ? h(
          "div",
          { class: "notice notice--warning" },
          icon("alert", 16),
          h(
            "div",
            null,
            h("strong", null, t("This block doesn't show on the page")),
            h(
              "p",
              null,
              t("It's in “{area}” of “{block}”, which that block doesn't show right now (see its settings). Move the block somewhere else to make it show.", {
                area: slotLabel(registry.get(cause.block.type), cause.slot),
                block: registry.meta(cause.block.type).name,
              }),
            ),
          ),
        )
      : null;

    // For the programmer: what they misspelled in the component (the wrong keys are ignored).
    const warnings = registry.warnings(block.type);
    const warningNote = warnings.length
      ? h(
          "div",
          { class: "notice notice--warning" },
          icon("alert", 16),
          h(
            "div",
            null,
            h("strong", null, t("Something is misspelled in components/{type}.js", { type: block.type })),
            warnings.map((w) => h("p", null, w)),
          ),
        )
      : null;

    const parentBtn = loc.parent
      ? h(
          "button",
          { type: "button", class: "btn btn--small btn--wide btn--parent", onclick: () => actions.selectParent(block.id) },
          icon("parent", 14),
          h("span", null, t("Select the block it's in")),
          h("span", { class: "btn__sub" }, registry.meta(loc.parent.type).name),
        )
      : null;

    let body;
    if (!comp) {
      const fail = registry.failure(block.type);
      body = h(
        "div",
        { class: "notice notice--warning" },
        icon("alert", 16),
        h(
          "div",
          null,
          h("strong", null, fail ? t("This block has an error") : t("This block no longer exists")),
          h(
            "p",
            null,
            fail || t("Its file, components/{type}.js, is no longer in the project. Delete the block from the page or put the file back.", { type: block.type }),
          ),
        ),
      );
    } else {
      const fields = blockFields(comp);
      const entries = Object.entries(fields);
      const props = withDefaults(comp, block.props);
      const slots = Object.keys(comp.slots || {});
      const hasCanvas = slots.some((name) => info.free.has(`${block.id}:${name}`));
      body = [
        entries.length
          ? h(
              "div",
              { class: "fields" },
              entries.map(([key, field]) => createField(field, props[key], fieldCtx(block.id, key, field))),
            )
          : h("p", { class: "muted" }, t("This block has no settings.")),
        slots.length
          ? h(
              "div",
              { class: "notice notice--slot" },
              icon("slot", 16),
              h(
                "p",
                null,
                hasCanvas
                  ? t("On the canvas you put blocks anywhere: drag them here, move them where you like and drag their corners to make them bigger. Everything snaps to an invisible grid.")
                  : t("You can put other blocks inside this one: drag them into the dotted areas on the page, or press + there."),
              ),
            )
          : null,
      ];
    }

    const placement = onGrid ? [placementGroup(loc), h("div", { class: "props-sep" })] : null;
    return h("div", { class: "block-panel" }, head, crumbs, hiddenNote, warningNote, tiles, parentBtn, h("div", { class: "props-sep" }), placement, body);
  }

  // ---- "Placement": the place, size, shape and layer of a block on the Free canvas ----
  // The fields write only integers in their range and shapes from the list; the editor repairs them
  // anyway with safePlacement before putting them in the page.

  function placementGroup(loc) {
    const id = loc.block.id;
    const a = safePlacement(loc.block.placement);
    const layers = layerMoves(loc.list, id);
    const number = (key, label, min, max) => {
      const inputId = `placement-${key}`;
      const path = `${id}.placement.${key}`;
      const input = h("input", {
        type: "number",
        class: "input placement__input",
        id: inputId,
        value: String(a[key]),
        min,
        max,
        step: 1,
        inputmode: "numeric",
        "data-path": path,
      });
      // While you type: only the whole values in the range. On leaving: brought into the range and rounded.
      input.addEventListener("input", () => {
        const n = Number(input.value);
        if (input.value.trim() === "" || !Number.isInteger(n) || n < min || n > max) return;
        actions.setPlacement(id, { [key]: n }, { key: path, live: true });
      });
      input.addEventListener("change", () => {
        const v = Number(input.value);
        const n = input.value.trim() !== "" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : a[key];
        input.value = String(n);
        actions.setPlacement(id, { [key]: n }, { key: path, live: true });
        actions.endEdit();
        // The other fields fit their limits (e.g. the Width to the Column). After the focus has reached
        // the next field (Tab), so the rebuild keeps it there.
        setTimeout(schedule, 0);
      });
      return h(
        "label",
        { class: "placement__number", for: inputId },
        h("span", { class: "placement__label" }, label, h("span", { class: "placement__range" }, `${min}–${max}`)),
        input,
      );
    };
    const shapes = h(
      "div",
      { class: "shapes", role: "group", "aria-label": t("Shape") },
      SHAPES_UI.map(([value, text]) =>
        h(
          "button",
          {
            type: "button",
            class: `action shape ${a.shape === value ? "shape--chosen" : ""}`,
            "aria-pressed": String(a.shape === value),
            onclick: () => actions.setPlacement(id, { shape: value }),
          },
          icon(value, 18),
          h("span", null, text),
        ),
      ),
    );
    const fill =
      FILLS.includes(loc.block.type) || a.fill
        ? createField(
            { type: "checkbox", label: t("The image fills the box"), help: t("The image covers the whole box; its edges are cut off if needed.") },
            a.fill,
            { key: "fill", path: `${id}.placement.fill`, change: (v) => actions.setPlacement(id, { fill: v === true }), done: () => actions.endEdit() },
          )
        : null;
    const layerBtn = (side, text, title) =>
      h(
        "button",
        {
          type: "button",
          class: "btn btn--small",
          disabled: !layers[side],
          title: layers[side] ? title : t("It doesn't overlap another block"),
          onclick: () => actions.layer(id, side),
        },
        icon(side, 15),
        text,
      );
    return h(
      "section",
      { class: "placement", "aria-labelledby": "placement-title" },
      h("h3", { class: "placement__title", id: "placement-title" }, t("Placement")),
      actions.isStacked(id)
        ? h(
            "div",
            { class: "notice notice--info placement__note" },
            icon("phone", 16),
            h("p", null, t("On a phone, the blocks stack one under the other, in reading order. The place and size here are for big screens.")),
          )
        : null,
      h(
        "div",
        { class: "placement__numbers" },
        number("x", t("Column"), 1, COLUMNS + 1 - a.w),
        number("y", t("Row"), 1, LIMITS.y),
        number("w", t("Width"), 1, COLUMNS + 1 - a.x),
        number("h", t("Height"), 1, LIMITS.h),
      ),
      h("p", { class: "field__help" }, t("The grid has 12 columns. The arrow keys move the block one step at a time; Shift + arrows change its size.")),
      h("div", { class: "field" }, h("span", { class: "field__label" }, t("Shape")), shapes),
      fill,
      h(
        "div",
        { class: "field" },
        h("span", { class: "field__label" }, t("Layer")),
        h(
          "div",
          { class: "layers" },
          layerBtn("front", t("Bring to front"), t("Put the block above the ones it overlaps")),
          layerBtn("back", t("Send to back"), t("Put the block under the ones it overlaps")),
        ),
        layers.front || layers.back ? null : h("p", { class: "field__help" }, t("They work when the block overlaps another one.")),
      ),
    );
  }

  function fieldCtx(blockId, key, field) {
    return {
      key,
      path: `${blockId}.${key}`,
      change: (value, { live } = {}) => actions.setProp(blockId, [key], value, live ? `${blockId}.${key}` : null),
      done: () => actions.endEdit(),
      upload: (file) => actions.upload(file),
      list: field?.type === "list" ? listCtx(blockId, key) : null,
    };
  }

  function listCtx(blockId, key) {
    const okey = `${blockId}|${key}`;
    if (!openCards.has(okey)) openCards.set(okey, new Set());
    const open = openCards.get(okey);
    const change = (i, sub, value, live) =>
      actions.setProp(blockId, [key, i, sub], value, live ? `${blockId}.${key}.${i}.${sub}` : null);
    return {
      isOpen: (i) => open.has(i),
      setOpen: (i, value) => (value ? open.add(i) : open.delete(i)),
      add() {
        const length = actions.listAdd(blockId, key);
        if (length) {
          open.add(length - 1);
          reveal = { path: `${blockId}.${key}`, index: length - 1 };
        }
      },
      remove(i) {
        if (!actions.listRemove(blockId, key, i)) return;
        const next = [...open].filter((j) => j !== i).map((j) => (j > i ? j - 1 : j));
        open.clear();
        next.forEach((j) => open.add(j));
      },
      move(i, delta) {
        if (!actions.listMove(blockId, key, i, delta)) return;
        const a = open.has(i);
        const b = open.has(i + delta);
        open.delete(i);
        open.delete(i + delta);
        if (a) open.add(i + delta);
        if (b) open.add(i);
      },
      child: (i, sub, onValue) => ({
        key: sub,
        path: `${blockId}.${key}.${i}.${sub}`,
        change: (value, { live } = {}) => {
          onValue?.(value);
          change(i, sub, value, live);
        },
        done: () => actions.endEdit(),
        upload: (file) => actions.upload(file),
      }),
    };
  }

  // ---- The page (nothing selected) ----

  function pageCtx(key) {
    return {
      key,
      path: `page.${key}`,
      change: (value, { live } = {}) => actions.setPageField(key, value, live),
      done: () => actions.endEdit(),
    };
  }

  function pagePanel() {
    const doc = state.doc;
    const path = state.name === "index" ? "/" : `/${state.name}`;
    const login = state.site?.loginPage || "/login";
    return h(
      "div",
      { class: "page-panel" },
      h(
        "div",
        { class: "props-head" },
        h("span", { class: "tile", "aria-hidden": "true" }, icon("page", 20)),
        h(
          "div",
          { class: "props-head__text" },
          h("h2", { class: "props-head__name" }, t("Page settings")),
          h("p", { class: "props-head__desc" }, doc.title || state.name),
        ),
      ),
      h(
        "div",
        { class: "notice" },
        icon("click", 16),
        h("p", null, t("Click a block on the page to change its text, images and colors.")),
      ),
      h(
        "div",
        { class: "fields" },
        createField({ type: "text", label: t("Title"), help: t("It shows in the browser tab and in Google results.") }, doc.title ?? "", pageCtx("title")),
        createField(
          { type: "longtext", label: t("Description"), help: t("A short sentence for search engines."), format: false },
          doc.description ?? "",
          pageCtx("description"),
        ),
        createField(
          {
            type: "choice",
            label: t("Who can see it"),
            options: [
              { value: "public", label: t("Everyone") },
              { value: "members", label: t("Members only (logged in)") },
            ],
            help:
              doc.access === "members"
                ? t("People who aren't logged in are sent to the login page ({path}).", { path: login })
                : t("Anyone with the page's address can see it."),
          },
          doc.access === "members" ? "members" : "public",
          pageCtx("access"),
        ),
        createField({ type: "checkbox", label: t("Show the shared header and footer") }, doc.zones !== false, pageCtx("zones")),
        h(
          "div",
          { class: "field" },
          h("span", { class: "field__label" }, t("Address")),
          h(
            "div",
            { class: "page-address" },
            h("code", { class: "page-address__path" }, path),
            h(
              "button",
              { type: "button", class: "btn btn--small", onclick: () => actions.viewPage() },
              icon("external", 13),
              t("Open"),
            ),
          ),
          h("p", { class: "field__help" }, t("File: {file}", { file: `pages/${state.name}.json` })),
        ),
      ),
      state.name !== "index"
        ? h(
            "div",
            { class: "danger-zone" },
            h(
              "button",
              { type: "button", class: "btn btn--danger-outline btn--wide", onclick: () => actions.deletePage(state.name) },
              icon("trash", 14),
              t("Delete page"),
            ),
          )
        : h("p", { class: "muted danger-zone" }, t("The home page (/) can't be deleted.")),
    );
  }

  // ---- A shared zone ----

  function zonePanel() {
    const header = state.name === "header";
    const back = state.pages.find((p) => p.slug === state.lastPage);
    return h(
      "div",
      { class: "zone-panel" },
      h(
        "div",
        { class: "props-head" },
        h("span", { class: "tile", "aria-hidden": "true" }, icon(header ? "header" : "footer", 20)),
        h(
          "div",
          { class: "props-head__text" },
          h("h2", { class: "props-head__name" }, header ? t("Shared header") : t("Shared footer")),
          h("p", { class: "props-head__desc" }, header ? t("Above every page") : t("Below every page")),
        ),
      ),
      h(
        "div",
        { class: "notice notice--info" },
        icon("info", 16),
        h(
          "p",
          null,
          header
            ? t("The header shows on every page of the site. What you change here shows everywhere, so the menu and the contact details are edited only once.")
            : t("The footer shows on every page of the site. What you change here shows everywhere, so the menu and the contact details are edited only once."),
        ),
      ),
      h("p", { class: "muted" }, t("A page can hide it in its own settings (“{setting}”).", { setting: t("Show the shared header and footer") })),
      h("p", { class: "muted" }, t("File: {file}", { file: `pages/_${state.name}.json` })),
      h(
        "button",
        { type: "button", class: "btn btn--wide", onclick: () => actions.openDoc("page", state.lastPage) },
        icon("chevron-left", 14),
        t("Back to “{page}”", { page: back?.title || state.lastPage }),
      ),
    );
  }

  on("selection", schedule);
  on("document", schedule);
  on("components", schedule);
  on("doc", (e) => {
    if (e?.source !== "props") schedule();
  });
  on("pages", () => {
    // Only the zone's panel uses the list of pages (the "Back to ..." button).
    if (state.kind === "zone" && !state.selected) schedule();
  });

  return {
    render: schedule,
    // A double click on a block: the cursor goes straight into the first field.
    focusFirst() {
      focusFirstPending = true;
      schedule();
    },
  };
}
