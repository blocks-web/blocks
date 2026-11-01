// The preview card: on hover (or focus) over a block in the palette or in the "+" menu, a card shows
// up on the right with the block's live thumbnail, its name, its description + tip and its settings.
//
// The thumbnail is the same canvas as the page (a second canvas.html, made at the first hover and
// reused), where the block is displayed with its default values, in the site's theme, 1024 px wide
// and scaled down to the thumbnail's width (310 px, from editor.css). What you see in the card is
// exactly what you'll see on the page, including the block's JS. The card never takes the mouse or
// the focus: it's a tooltip, not a menu.

import * as registry from "./registry.js";
import { createCanvasHost } from "./canvas-host.js";
import { h } from "./util.js";
import { tile } from "./block-icons.js";
import { icon } from "./ui.js";
import { serverBadge } from "./palette.js";
import { blockFields, t } from "./i18n.js";

const OPEN_DELAY = 400; // ms from the mouse coming in until it shows
const CLOSE_DELAY = 120; // ms from leaving until it goes away (so you can cross the space between blocks)
const WARM = 300; // after a close this recent, the next card shows right away
const CANVAS_WIDTH = 1024;
const MAX_HEIGHT = 660; // px in the canvas (≈ 200 px in the card); anything taller is cut at the bottom
const MIN_EDITOR_WIDTH = 960; // below this the card would cover the canvas

// Sample content for containers, so you can see what they're for. A type that doesn't exist (yet)
// is skipped when displaying.
export const FILLERS = {
  section: { content: [{ id: "u1", type: "text", props: {} }] },
  columns: { c1: [{ id: "u1", type: "image", props: {} }], c2: [{ id: "u2", type: "text", props: {} }] },
  "members-only": { content: [{ id: "u1", type: "text", props: {} }] },
  footer: { extra: [{ id: "u1", type: "social", props: {} }] },
  // The canvas: a rounded image that fills its box and a text next to it, a little lower.
  canvas: {
    content: [
      { id: "u1", type: "image", props: {}, placement: { x: 1, y: 1, w: 5, h: 9, shape: "rounded", fill: true } },
      { id: "u2", type: "text", props: {}, placement: { x: 6, y: 2, w: 7, h: 6 } },
    ],
  },
};

// The card's text: the description and the tip (from the component's file, in the editor's language)
// and the first labels of its settings.
export function cardText(meta, comp) {
  const description = String(meta?.description || "").trim();
  const tip = String(meta?.tip || "").trim();
  const labels = Object.entries(blockFields(comp)).map(([key, field]) => String(field?.label || key));
  // A label can have a comma ("After logging in, take them to"), so they're joined with "·".
  const settings = labels.length ? labels.slice(0, 4).join(" · ") + (labels.length > 4 ? ` +${labels.length - 4}` : "") : "";
  return { description, tip, settings };
}

// The page with a single block, sent to the small canvas. `exists(type)` says which types can be fillers.
export function previewPage(type, exists = () => true) {
  const slots = {};
  for (const [name, kids] of Object.entries(FILLERS[type] || {})) slots[name] = kids.filter((k) => exists(k.type));
  return { blocks: [{ id: "preview", type, props: {}, slots }] };
}

// The card's last line: what a click does. From the palette the block goes after the selected one
// (or at the end); from the "+" menu, exactly where you pressed.
export function cardNote(from, { selected = false, kind = "page" } = {}) {
  if (from === "menu") return t("Click or press Enter: it goes where you pressed +.");
  if (selected) return t("Drag it onto the page or click: it goes after the selected block.");
  if (kind === "header") return t("Drag it onto the page or click: it goes at the end of the header.");
  if (kind === "footer") return t("Drag it onto the page or click: it goes at the end of the footer.");
  return t("Drag it onto the page or click: it goes at the end of the page.");
}

// initPreview({ panel, site, context }) → { show(type, anchor, { from, focus }), hide(now), isOpen() }
//   panel   – the left panel (the card sits on its right; the mouse leaving it closes the card)
//   site    – () => the site settings (with the theme not saved yet from "Site settings", if it's open)
//   context – () => { selected, kind }: is a block selected? what is being edited (page, header, footer)?
export function initPreview({ panel, site, context = () => ({}) }) {
  const card = document.getElementById("preview");
  const thumb = card.querySelector(".preview__thumb");
  const head = card.querySelector(".preview__head");
  const text = card.querySelector(".preview__text");
  const settings = card.querySelector(".preview__settings");
  const note = card.querySelector(".preview__note");
  let host = null;
  let iframe = null;
  let openTimer = null;
  let closeTimer = null;
  let measureTimers = [];
  let current = null; // { type, anchor, from }
  let viaFocus = false; // opened from the keyboard: scrolling the palette (the focus brings the block into view) doesn't close it
  let lastClosed = 0;
  let describedEl = null;

  // How much the page is scaled down: CSS gives the thumbnail's width, so the design changes in one place.
  const scale = () => (thumb.clientWidth || 310) / CANVAS_WIDTH;

  // The small canvas, only once, at the first card.
  function ensureCanvas() {
    if (host) return;
    iframe = h("iframe", { class: "preview__frame", src: "/_editor/canvas.html", title: "", tabindex: "-1", inert: "", "aria-hidden": "true" });
    iframe.style.transform = `scale(${scale()})`;
    thumb.append(iframe);
    host = createCanvasHost(iframe, { rendered: () => measure() });
  }

  // The thumbnail's height: as tall as the block (measured with the canvas shrunk, otherwise the body would fill the frame).
  function measure() {
    if (!iframe || card.hidden || !current) return;
    const doc = host.document;
    if (!doc?.documentElement) return;
    // The small canvas still shows the previous block: the thumbnail stays empty until the requested one arrives.
    if (doc.querySelector('[data-id="preview"]')?.dataset.c !== current.type) return;
    thumb.classList.remove("preview__thumb--waiting");
    iframe.style.height = "40px";
    const hh = Math.max(40, Math.min(doc.documentElement.scrollHeight, MAX_HEIGHT));
    iframe.style.height = `${hh}px`;
    const small = Math.round(hh * scale());
    const tall = Math.max(72, small);
    thumb.style.height = `${tall}px`;
    // A short block (a button) sits in the middle of the window, not stuck to the top with an empty strip below.
    iframe.style.marginTop = `${Math.floor((tall - small) / 2)}px`;
    thumb.classList.toggle("preview__thumb--cut", hh >= MAX_HEIGHT);
    place();
  }

  function renderMini(type) {
    ensureCanvas();
    for (const timer of measureTimers) clearTimeout(timer);
    if (host.document?.querySelector('[data-id="preview"]')?.dataset.c !== type) thumb.classList.add("preview__thumb--waiting");
    host.render(
      JSON.stringify({
        page: previewPage(type, registry.has),
        zones: {},
        site: site() || {},
        path: "/",
        emptyTitle: "",
        kind: "page",
        comps: registry.urls(),
        broken: registry.broken(),
      }),
    );
    // Images arrive after the display: we measure twice more.
    measureTimers = [150, 500].map((ms) => setTimeout(measure, ms));
  }

  function fill(type, from) {
    const m = registry.meta(type);
    const comp = registry.get(type);
    const c = cardText(m, comp);
    head.replaceChildren(tile(m.icon), h("span", { class: "preview__name" }, m.name), ...(registry.hasServer(type) ? [serverBadge()] : []));
    if (!c.description && !c.tip) {
      text.replaceChildren(h("span", { class: "preview__tip" }, t("No description. Add one in components/{type}.js (description, tip).", { type })));
    } else {
      text.replaceChildren(
        c.description && h("span", { class: "preview__desc" }, c.description),
        c.description && c.tip ? " " : "",
        c.tip && h("span", { class: "preview__tip" }, c.tip),
      );
    }
    settings.replaceChildren(...(c.settings ? [h("span", { class: "preview__label" }, t("Settings")), c.settings] : []));
    settings.hidden = !c.settings;
    note.replaceChildren(icon("click", 14), h("span", null, cardNote(from, context() || {})));
  }

  // On the right of the left panel, with the thumbnail's top edge on the block's top edge; from the
  // "+" menu, on the right of the menu (or on the left, if it doesn't fit). Always on screen.
  function place() {
    if (!current) return;
    // The palette was rebuilt (e.g. a component was reloaded): the block the card belonged to is gone.
    if (!current.anchor.isConnected) return close();
    const r = current.anchor.getBoundingClientRect();
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    let left;
    let side = "right";
    if (current.from === "menu") {
      const menu = current.anchor.closest(".picker")?.getBoundingClientRect() || r;
      left = menu.right + 8;
      if (left + cw > window.innerWidth - 8) {
        left = menu.left - 8 - cw;
        side = "left";
      }
    } else {
      left = panel.getBoundingClientRect().right + 8;
    }
    card.dataset.side = side;
    const above = card.clientTop + thumb.offsetTop; // the card's border + the space up to the thumbnail
    const top = Math.max(8, Math.min(r.top - above, window.innerHeight - ch - 8));
    card.style.left = `${Math.round(Math.max(8, left))}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  function open(type, anchor, from) {
    if (!anchor.isConnected || !registry.has(type)) return;
    current = { type, anchor, from };
    fill(type, from);
    card.hidden = false;
    place();
    describedEl?.removeAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", "preview-text");
    describedEl = anchor;
    renderMini(type);
  }

  function close() {
    clearTimeout(closeTimer);
    closeTimer = null;
    if (card.hidden) return;
    card.hidden = true;
    lastClosed = performance.now();
    describedEl?.removeAttribute("aria-describedby");
    describedEl = null;
    current = null;
  }

  const isOpen = () => !card.hidden;

  function show(type, anchor, { from = "palette", focus = false } = {}) {
    if (window.innerWidth < MIN_EDITOR_WIDTH) return;
    clearTimeout(closeTimer);
    closeTimer = null;
    viaFocus = focus;
    if (isOpen() && current?.type === type && current.anchor === anchor) return;
    clearTimeout(openTimer);
    const run = () => {
      openTimer = null;
      open(type, anchor, from);
    };
    // "Warm": with a card open (or just closed), the next one shows right away.
    if (isOpen() || performance.now() - lastClosed < WARM) run();
    else openTimer = setTimeout(run, OPEN_DELAY);
  }

  // hide() waits CLOSE_DELAY ms (the mouse crosses the space between blocks); hide(true) closes now.
  function hide(now = false) {
    clearTimeout(openTimer);
    openTimer = null;
    viaFocus = false;
    if (card.hidden) return;
    if (now) return close();
    if (!closeTimer) closeTimer = setTimeout(close, CLOSE_DELAY);
  }

  panel.addEventListener("pointerleave", () => hide(true));
  panel.addEventListener("scroll", () => (viaFocus ? place() : hide(true)), true);
  // The "+" menu's list scrolled with the wheel: the card stays next to the active item.
  document.addEventListener(
    "scroll",
    (e) => {
      if (current?.from === "menu" && e.target?.contains?.(current.anchor)) place();
    },
    true,
  );
  window.addEventListener("resize", () => hide(true));

  return { show, hide, isOpen };
}
