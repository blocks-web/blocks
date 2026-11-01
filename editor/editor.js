// The Blocks editor: it ties together the state, the canvas, the panels and the server.
//
//   store.js        the open document, commit(), Undo / Redo, saving on its own
//   canvas.js       the page displayed in an iframe (it runs there, with the page's window)
//   dnd.js          drag & drop from the palette, from the page and from Structure
//   palette.js, structure.js, props.js, topbar.js, dialogs.js   the panels
//   i18n.js         the editor's words, in English or Romanian

import { defaultFor, safePlacement, withDefaults } from "../core/render.js";
import { adjust, changeLayer, growBy, moveBy, zAbove } from "./grid.js";
import { api, saveOnExit } from "./api.js";
import * as registry from "./registry.js";
import {
  breakCoalesce,
  commit,
  discardPending,
  emit,
  fileOf,
  flush,
  forgetHistory,
  isKnownRemote,
  isSaving,
  markChanged,
  on,
  redo,
  save,
  setDocument,
  setSelected,
  state,
  undo,
} from "./store.js";
import {
  canDrop,
  cloneFresh,
  collectIds,
  createBlock,
  freeSlots,
  hiddenSlots,
  insertTo,
  linksTo,
  linksToPath,
  locate,
  moveStep,
  moveTo,
  removeLinksTo,
  shownSlots,
  summaryOf,
} from "./tree.js";
import { createCanvasHost } from "./canvas-host.js";
import { createDnd } from "./dnd.js";
import { initPalette } from "./palette.js";
import { initStructure } from "./structure.js";
import { initProps } from "./props.js";
import { initTopbar } from "./topbar.js";
import { initPreview } from "./preview.js";
import { openNewPageDialog, openSiteSettingsDialog } from "./dialogs.js";
import { closePicker, isPickerOpen, openPicker } from "./picker.js";
import { closeMenu, confirmDialog, icon, isMenuOpen, toast } from "./ui.js";
import { canon, debounce, h, isEditable, pref } from "./util.js";
import { getLang, joinList, quote, setLang, slotLabel, t, tn, translateStatic } from "./i18n.js";

const $ = (sel) => document.querySelector(sel);

// The texts written in index.html (in English), in the editor's language; then the icons:
// data-icon="name" (before the text), data-icon-after="name" (after it).
translateStatic(document);
document.documentElement.lang = getLang();
for (const el of document.querySelectorAll("[data-icon]")) el.prepend(icon(el.dataset.icon, 16));
for (const el of document.querySelectorAll("[data-icon-after]")) el.append(icon(el.dataset.iconAfter, 14));

const iframe = $("#frame");
const stage = $("#canvas-stage");
const sheet = $("#sheet");

const WIDTHS = { desktop: null, tablet: 768, phone: 390 };
// "Desktop" uses the canvas's whole width, but no less than this: below it the site switches to its
// tablet / phone version (the ☰ menu, columns one under another). Narrower, it's scaled down.
const DESKTOP_MIN = 1024;
let device = WIDTHS[pref("device")] !== undefined ? pref("device") : "desktop";
let settingsOpen = false;
let deletingSlug = null;
let openSeq = 0;

// ---- The canvas ----

const host = createCanvasHost(
  iframe,
  {
    rendered: () => {
      $("#canvas-loading").hidden = true;
      dnd.refresh();
    },
    select: (id) => actions.select(id),
    zone: (name) => actions.openDoc("zone", name),
    action: (name, id) => toolbarAction(name, id),
    // A block on the canvas that was just resized (at the end, so a single undo step).
    placement: (id, a) => actions.setPlacement(String(id), a),
    // "+" on the canvas: the blocks menu shows next to the button (the coordinates come from the iframe).
    insert: (info) => actions.pickBlock({ at: host.fromFrame(info.x, info.y), slot: info.slot, index: info.index }),
    pointerDown: (info) =>
      dnd.begin(
        { kind: "move", id: info.id },
        { x: info.x, y: info.y, pointerId: info.pointerId, pointerType: info.pointerType, fromFrame: true },
      ),
    keydown: (e) => onKey(e),
    hover: (id) => structure?.highlight(id),
    dblclick: (id) => {
      actions.select(id);
      props.focusFirst();
    },
  },
  // The cream space around the sheet: a release a few pixels outside it is still on the page.
  { around: stage },
);

const emptyTitle = () =>
  state.kind === "zone" ? (state.name === "header" ? t("The header is empty.") : t("The footer is empty.")) : t("The page is empty.");

function payload() {
  const site = state.previewSite || state.site || {};
  const base =
    state.kind === "page"
      ? { page: state.doc, zones: state.zones, path: state.name === "index" ? "/" : `/${state.name}` }
      : { page: { blocks: state.doc.blocks }, zones: {}, path: "/" };
  const kind = state.kind === "zone" ? state.name : "page";
  return JSON.stringify({ ...base, site, emptyTitle: emptyTitle(), kind, comps: registry.urls(), broken: registry.broken() });
}

function renderNow() {
  scheduleRender.cancel();
  if (!state.doc) return;
  host.render(payload());
}
const scheduleRender = debounce(renderNow, 50);

// The screen width: the page is scaled down on screen if it doesn't fit (e.g. the tablet on a small laptop).
function layoutSheet() {
  const pad = device === "desktop" ? 16 : 24;
  stage.style.padding = `${pad}px`;
  const availW = Math.max(240, stage.clientWidth - pad * 2);
  const availH = Math.max(240, stage.clientHeight - pad * 2);
  const w = WIDTHS[device] || Math.max(availW, DESKTOP_MIN);
  const s = w > availW ? availW / w : 1;
  sheet.style.width = `${Math.floor(w * s)}px`;
  sheet.style.height = `${availH}px`;
  iframe.style.width = `${w}px`;
  iframe.style.height = `${Math.round(availH / s)}px`;
  iframe.style.transform = s < 1 ? `scale(${s})` : "";
  sheet.dataset.device = device;
  host.scale(s);
  const zoom = $("#canvas-zoom");
  zoom.hidden = s >= 1;
  zoom.textContent = s < 1 ? t("Scaled down to fit ({percent}%)", { percent: Math.round(s * 100) }) : "";
}
new ResizeObserver(() => layoutSheet()).observe(stage);

function updateBanner() {
  const banner = $("#canvas-banner");
  if (state.kind === "zone") {
    const back = state.pages.find((p) => p.slug === state.lastPage);
    banner.className = "canvas__banner";
    banner.replaceChildren(
      icon(state.name, 16),
      h(
        "span",
        { class: "canvas__banner-text" },
        h("strong", null, state.name === "header" ? t("You're editing the shared header") : t("You're editing the shared footer")),
        " ",
        t("— it shows on every page of the site."),
      ),
      h(
        "button",
        { type: "button", class: "btn btn--small", onclick: () => actions.openDoc("page", state.lastPage) },
        icon("chevron-left", 14),
        t("Back to “{page}”", { page: back?.title || state.lastPage }),
      ),
    );
    banner.hidden = false;
  } else if (state.kind === "page" && state.doc?.access === "members") {
    banner.className = "canvas__banner canvas__banner--members";
    banner.replaceChildren(
      icon("lock", 15),
      h(
        "span",
        { class: "canvas__banner-text" },
        h("strong", null, t("Members-only page")),
        " ",
        t("— people who aren't logged in are sent to the login page."),
      ),
    );
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

function updateTitle() {
  let name = "";
  if (state.kind === "page") name = state.doc?.title || state.name;
  else if (state.kind === "zone") name = state.name === "header" ? t("Shared header") : t("Shared footer");
  document.title = name ? `${name} · Blocks` : "Blocks";
}

// ---- The actions (used by the panels, the canvas and the shortcuts) ----

const allIds = () => collectIds(state.doc, state.zones?.header, state.zones?.footer);

// The list in a "list" prop becomes explicit (with the default values) before we change it.
function materializeList(block, key) {
  const comp = registry.get(block.type);
  if (!block.props || typeof block.props !== "object") block.props = {};
  if (!Array.isArray(block.props[key])) block.props[key] = comp ? withDefaults(comp, block.props)[key] || [] : [];
  block.props[key] = block.props[key].map((it) => (it && typeof it === "object" && !Array.isArray(it) ? it : {}));
  return block.props[key];
}

const slotBase = () => ({ page: state.doc, site: state.site || {} });

// The document's canvases ("blockId:slot"): there the blocks have a placement, not an order.
const canvases = () => freeSlots(state.doc, registry.get, slotBase());
let keyPress = 0; // each arrow key press is an undo step; held down, it stays a single one

// The block's slots that have blocks in them, but that the component doesn't show right now.
function hiddenWithBlocks(id) {
  const loc = locate(state.doc, id);
  const comp = loc && registry.get(loc.block.type);
  if (!comp?.slots) return [];
  const shown = shownSlots(loc.block, comp, slotBase());
  return Object.keys(comp.slots).filter((name) => !shown.includes(name) && loc.block.slots?.[name]?.length > 0);
}

// A setting just hid some blocks (e.g. Columns: from 3 to 2, with something in "Column 3"). Otherwise
// they would vanish without a sign from the canvas and from the site, though they stay in the file.
function warnHidden(id, before) {
  const names = hiddenWithBlocks(id).filter((name) => !before.includes(name));
  if (!names.length) return;
  const block = locate(state.doc, id).block;
  const comp = registry.get(block.type);
  const label = (name) => quote(slotLabel(comp, name));
  const count = names.reduce((n, name) => n + block.slots[name].length, 0);
  const areas = joinList(names.map(label));
  const shown = shownSlots(block, comp, slotBase());
  const dest = shown[shown.length - 1];
  toast(
    names.length === 1
      ? tn(count, "{areas} has {n} block that no longer shows on the page.", "{areas} has {n} blocks that no longer show on the page.", { areas })
      : tn(count, "{areas} have {n} block that no longer shows on the page.", "{areas} have {n} blocks that no longer show on the page.", { areas }),
    {
      timeout: 12000,
      action: dest ? { label: t("Move to {area}", { area: label(dest) }), fn: () => actions.rescueHidden(id) } : null,
    },
  );
}

function pagePath() {
  if (state.kind !== "page") return "/";
  return state.name === "index" ? "/" : `/${state.name}`;
}

const actions = {
  select(id, { scroll = false } = {}) {
    setSelected(id);
    if (scroll && state.selected) host.scrollTo(state.selected);
  },

  hoverBlock(id) {
    host.hover(id);
  },

  // A new block: at the target (a drop or "+") or after the selected block, otherwise at the end of
  // the page. Returns the new block's id (or null).
  add(type, target = null) {
    if (!state.doc) return null;
    const comp = registry.get(type);
    if (!comp) {
      toast(t("Couldn't load the “{type}” block (components/{type}.js).", { type }), { type: "error" });
      return null;
    }
    const block = createBlock(type, comp, allIds());
    let slot = "root";
    let index;
    let at = null; // on a canvas: the place chosen with the mouse ({ x, y }); otherwise under the last block
    if (target) {
      slot = target.slot;
      index = target.index;
      at = target.at || null;
    } else if (state.selected) {
      // Not into an area that doesn't show on the page: then after the container that shows.
      const hidden = hiddenSlots(state.doc, registry.get, slotBase());
      let sel = locate(state.doc, state.selected);
      while (sel?.parent && hidden.has(sel.key)) sel = locate(state.doc, sel.parent.id);
      if (sel) {
        slot = sel.key;
        index = sel.index + 1;
      }
    }
    if (index === undefined) index = state.doc.blocks.length;
    const free = canvases().has(slot);
    if (!commit((doc) => insertTo(doc, slot, index, block, { free, at }), { select: block.id, source: "add" })) return null;
    host.scrollTo(block.id);
    host.flash(block.id);
    return block.id;
  },

  // "+": you choose the block from a menu and it goes into the given position. `at` (a point) or `anchor` (an element).
  pickBlock({ at = null, anchor = null, slot = "root", index, onClose = null }) {
    if (!state.doc) return;
    openPicker({
      at,
      anchor,
      onClose: () => {
        preview.hide(true);
        onClose?.();
      },
      onActive: (type, el) => preview.show(type, el, { from: "menu" }),
      onPick: (type) => actions.add(type, { slot, index: index ?? state.doc.blocks.length }),
    });
  },

  // A move in place (exactly where it was): moveTo returns false, so no step in the history. On a
  // canvas the place counts (`at`: { x, y }), and outside it the block's placement is removed.
  move(id, slot, index, at = null) {
    const free = canvases().has(slot);
    if (commit((doc) => moveTo(doc, id, slot, index, { free, at }), { select: id, source: "move" })) host.flash(id);
  },

  // The placement of a block on a canvas (the handles, the "Placement" fields): only the known keys, repaired.
  // `key`: the changes from the same field add up to a single step; `live`: the panel isn't rebuilt.
  setPlacement(id, changes, { key = null, live = false } = {}) {
    commit(
      (doc) => {
        const loc = locate(doc, id);
        if (!loc || !freeSlots(doc, registry.get, { page: doc, site: state.site || {} }).has(loc.key)) return false;
        loc.block.placement = adjust(loc.block.placement, changes);
      },
      { key, source: live ? "props" : "placement", select: id },
    );
  },

  // "Bring to front" / "Send to back".
  layer(id, side) {
    commit(
      (doc) => {
        const loc = locate(doc, id);
        if (!loc || !freeSlots(doc, registry.get, { page: doc, site: state.site || {} }).has(loc.key)) return false;
        return changeLayer(loc.list, id, side);
      },
      { source: "placement", select: id },
    );
  },

  // The arrow keys move the block on the canvas one grid step at a time; with Shift they change its size.
  // Returns false if the block isn't on a canvas laid out on the grid (then the arrows do their usual job).
  nudge(id, key, { shift = false, repeat = false } = {}) {
    const loc = locate(state.doc, id);
    if (!loc || !canvases().has(loc.key) || host.isStacked(id)) return false;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    if (!d) return false;
    const a = safePlacement(loc.block.placement);
    const next = shift ? growBy(a, d[0], d[1]) : moveBy(a, d[0], d[1]);
    if (["x", "y", "w", "h"].every((k) => next[k] === a[k])) return true; // at the grid's edge: nothing to do
    if (!repeat) keyPress++;
    commit(
      (doc) => {
        const l = locate(doc, id);
        if (!l) return false;
        l.block.placement = next;
      },
      { key: `placement.${id}.${keyPress}`, source: "placement", select: id },
    );
    host.scrollTo(id);
    return true;
  },

  // Alt+Up / Down and "Move up / down": to the previous / next gap in document order, so into and
  // out of containers (the same gaps as when dragging).
  moveBy(id, delta) {
    const ok = commit((doc) => moveStep(doc, id, delta, registry.get, { page: doc, site: state.site || {} }), {
      select: id,
      source: "move",
    });
    if (ok) {
      host.scrollTo(id);
      host.flash(id);
    }
  },

  duplicate(id) {
    const loc = locate(state.doc, id);
    if (!loc) return;
    const copy = cloneFresh(loc.block, allIds());
    // On a canvas, the copy sits a little lower and to the right, so you see there are two, and above them.
    if (canvases().has(loc.key)) {
      const a = moveBy(copy.placement, 1, 1);
      copy.placement = safePlacement({ ...a, z: zAbove(loc.list, a) });
    }
    const ok = commit(
      (doc) => {
        const l = locate(doc, id);
        if (!l) return false;
        l.list.splice(l.index + 1, 0, copy);
      },
      { select: copy.id, source: "duplicate" },
    );
    if (ok) host.scrollTo(copy.id);
  },

  remove(id) {
    const loc = locate(state.doc, id);
    if (!loc) return;
    const name = registry.meta(loc.block.type).name;
    const ok = commit(
      (doc) => {
        const l = locate(doc, id);
        if (!l) return false;
        l.list.splice(l.index, 1);
      },
      { select: null, source: "remove" },
    );
    if (!ok) return;
    // "Undo" in the notification also works if you opened another document in the meantime (e.g. the header).
    const { kind, name: docName } = state;
    toast(t("Deleted “{name}”.", { name }), {
      action: {
        label: t("Undo"),
        fn: async () => {
          if ((state.kind !== kind || state.name !== docName) && !(await actions.openDoc(kind, docName))) return;
          actions.undo();
        },
      },
    });
  },

  selectParent(id) {
    const loc = locate(state.doc, id);
    if (loc?.parent) actions.select(loc.parent.id, { scroll: true });
  },

  setProp(id, path, value, key = null) {
    const hiddenBefore = hiddenWithBlocks(id);
    commit(
      (doc) => {
        const loc = locate(doc, id);
        if (!loc) return false;
        const block = loc.block;
        if (!block.props || typeof block.props !== "object" || Array.isArray(block.props)) block.props = {};
        if (path.length === 1) {
          block.props[path[0]] = value;
          return;
        }
        const [listKey, i, sub] = path;
        const list = materializeList(block, listKey);
        if (!list[i]) return false;
        list[i][sub] = value;
      },
      { key, source: "props" },
    );
    warnHidden(id, hiddenBefore);
  },

  // The blocks in the areas the container no longer shows go to the last area it shows.
  rescueHidden(id) {
    const ok = commit(
      (doc) => {
        const loc = locate(doc, id);
        const comp = loc && registry.get(loc.block.type);
        if (!comp) return false;
        const shown = shownSlots(loc.block, comp, { ...slotBase(), page: doc });
        const dest = shown[shown.length - 1];
        if (!dest) return false;
        const moved = [];
        for (const name of Object.keys(comp.slots || {})) {
          if (shown.includes(name) || !Array.isArray(loc.block.slots?.[name])) continue;
          moved.push(...loc.block.slots[name]);
          delete loc.block.slots[name];
        }
        if (!moved.length) return false;
        const key = `${id}:${dest}`;
        const free = freeSlots(doc, registry.get, { ...slotBase(), page: doc }).has(key);
        // On a canvas, each one gets a place under the last block; outside it, no placement.
        for (const b of moved) {
          if (b && typeof b === "object") insertTo(doc, key, Infinity, b, { free });
        }
      },
      { source: "move" },
    );
    if (ok) host.scrollTo(id);
  },

  listAdd(id, key) {
    let length = 0;
    commit(
      (doc) => {
        const loc = locate(doc, id);
        const field = loc && registry.get(loc.block.type)?.props?.[key];
        if (!field) return false;
        const list = materializeList(loc.block, key);
        const item = {};
        for (const [k, f] of Object.entries(field.fields || {})) item[k] = defaultFor(f);
        list.push(item);
        length = list.length;
      },
      { source: "list" },
    );
    return length;
  },

  listRemove(id, key, i) {
    return commit(
      (doc) => {
        const loc = locate(doc, id);
        if (!loc) return false;
        const list = materializeList(loc.block, key);
        if (i < 0 || i >= list.length) return false;
        list.splice(i, 1);
      },
      { source: "list" },
    );
  },

  listMove(id, key, i, delta) {
    return commit(
      (doc) => {
        const loc = locate(doc, id);
        if (!loc) return false;
        const list = materializeList(loc.block, key);
        const j = i + delta;
        if (i < 0 || j < 0 || i >= list.length || j >= list.length) return false;
        [list[i], list[j]] = [list[j], list[i]];
      },
      { source: "list" },
    );
  },

  setPageField(field, value, live) {
    commit(
      (doc) => {
        if (field === "zones") {
          if (value) delete doc.zones;
          else doc.zones = false;
        } else doc[field] = value;
      },
      // The choices (access, zones) rebuild the panel, so the help texts change too.
      { key: live ? `page.${field}` : null, source: live ? "props" : "page" },
    );
  },

  endEdit() {
    breakCoalesce();
  },

  upload(file) {
    return api.upload(file);
  },

  undo() {
    if (!undo()) toast(t("Nothing left to undo."), { timeout: 1600 });
  },

  redo() {
    if (!redo()) toast(t("Nothing left to redo."), { timeout: 1600 });
  },

  saveNow() {
    save();
  },

  async openDoc(kind, name, { force = false } = {}) {
    if (!force && state.kind === kind && state.name === name) return true;
    const my = ++openSeq;
    if (!(await flushOrAsk())) return false;
    let raw;
    let zones = null;
    try {
      [raw, zones] = await Promise.all([
        kind === "page" ? api.page(name) : api.zone(name),
        kind === "page" ? fetchZones() : null,
      ]);
    } catch (err) {
      if (my !== openSeq) return false;
      if (err.status === 404 && kind === "page") {
        toast(t("The “{name}” page doesn't exist.", { name }), { type: "error" });
        await refreshPages();
        const fallback = state.pages.find((p) => p.slug === "index") || state.pages[0];
        if (fallback && fallback.slug !== name) return actions.openDoc("page", fallback.slug, { force: true });
      } else {
        toast(t("Couldn't open the document: {error}", { error: err.message }), { type: "error" });
      }
      return false;
    }
    if (my !== openSeq) return false;
    if (zones) state.zones = zones;
    setDocument(kind, name, raw || { blocks: [] });
    writeHash();
    renderNow();
    return true;
  },

  newPage() {
    openNewPageDialog({
      onCreated: async (slug, page) => {
        await refreshPages();
        if (await actions.openDoc("page", slug)) {
          toast(t("Created the “{title}” page. Drag a block into it or press +.", { title: page.title }), { type: "success" });
        }
      },
    });
  },

  async deletePage(slug) {
    const current = state.kind === "page" && state.name === slug;
    const title = (current ? state.doc?.title : state.pages.find((p) => p.slug === slug)?.title) || slug;
    // The header's menu (or other pages) may still lead here: we show them and can take them out with the page.
    const links = await findLinksTo(slug);
    const count = links.reduce((n, l) => n + l.found.length, 0);
    const fix = h("input", { type: "checkbox", class: "switch__input", role: "switch", checked: true });
    const loginHere = linksToPath(state.site?.loginPage, `/${slug}`);
    const ok = await confirmDialog({
      title: t("Delete the “{title}” page?", { title }),
      message: t("The file pages/{slug}.json will be deleted, and the address /{slug} will stop working. This can't be undone.", { slug }),
      extra: linksNotice(slug, links, count, fix, loginHere),
      ok: t("Delete page"),
      danger: true,
    });
    if (!ok) return;
    deletingSlug = slug;
    try {
      if (current) await discardPending();
      await api.deletePage(slug);
    } catch (err) {
      deletingSlug = null;
      toast(t("Couldn't delete the page: {error}", { error: err.message }), { type: "error" });
      return;
    }
    let removed = 0;
    let failed = false;
    if (count && fix.checked) [removed, failed] = await removeLinks(slug, links);
    await refreshPages();
    if (current) await actions.openDoc("page", "index", { force: true });
    // After we've left it: otherwise a new page with the same address would inherit its Undo.
    forgetHistory("page", slug);
    deletingSlug = null;
    if (failed) {
      toast(t("Deleted the “{title}” page, but couldn't remove all the links to it. Check the menu.", { title }), { type: "error" });
    } else if (removed) {
      toast(tn(removed, "Deleted the “{title}” page and the link to it.", "Deleted the “{title}” page and the {n} links to it.", { title }), {
        type: "success",
      });
    } else if (count) {
      toast(tn(count, "Deleted the “{title}” page. {n} link still goes to /{slug}.", "Deleted the “{title}” page. {n} links still go to /{slug}.", { title, slug }), {
        type: "error",
      });
    } else {
      toast(t("Deleted the “{title}” page.", { title }), { type: "success" });
    }
    if (loginHere) toast(t("The login page no longer exists: choose another one in Site settings."), { type: "error", timeout: 10000 });
  },

  openSiteSettings() {
    if (settingsOpen) return;
    settingsOpen = true;
    openSiteSettingsDialog({
      onPreview: (draft) => {
        state.previewSite = draft;
        renderNow();
      },
      onSaved: (site, previous) => {
        state.site = site;
        state.previewSite = null;
        settingsOpen = false;
        emit("site");
        renderNow();
        // The settings aren't in the page's history (Cmd+Z would undo something else), so they have their own "Undo".
        toast(t("The site settings are saved."), {
          type: "success",
          action: { label: t("Undo"), fn: () => restoreSite(previous) },
        });
      },
      onClose: () => {
        state.previewSite = null;
        settingsOpen = false;
        renderNow();
      },
    });
  },

  viewPage() {
    const path = pagePath();
    if (!state.dirty && !isSaving()) {
      window.open(path, "_blank");
      return;
    }
    // We save first, so the page that opens shows the latest changes.
    const win = window.open("", "_blank");
    flush().finally(() => {
      if (win) win.location.href = path;
    });
  },

  setDevice(name) {
    if (!(name in WIDTHS)) return;
    device = name;
    pref("device", name);
    topbar.renderDevice(name);
    layoutSheet();
    props.render(); // on a phone, "Placement" shows the note about stacking
  },

  // The editor's language (EN / RO): we save, remember the choice for this browser and reload.
  async setLanguage(lang) {
    if (lang === getLang() || !(await flushOrAsk())) return;
    setLang(lang);
    location.reload();
  },

  // The block sits on a canvas that is stacked right now (e.g. on a phone).
  isStacked(id) {
    return host.isStacked(id);
  },
};

// Puts back the site settings from before the last save.
async function restoreSite(previous) {
  try {
    await api.saveSite(previous);
  } catch (err) {
    toast(t("Couldn't restore the settings: {error}", { error: err.message }), { type: "error" });
    return;
  }
  state.site = previous;
  emit("site");
  renderNow();
  toast(t("Restored the previous site settings."), { type: "success" });
}

function toolbarAction(name, id) {
  if (name === "up") actions.moveBy(id, -1);
  else if (name === "down") actions.moveBy(id, 1);
  else if (name === "duplicate") actions.duplicate(id);
  else if (name === "remove") actions.remove(id);
  else if (name === "parent") actions.selectParent(id);
  else if (name === "front" || name === "back") actions.layer(id, name);
}

// Before we change the document, we save. If that doesn't work, we ask.
async function flushOrAsk() {
  if (await flush()) return true;
  return confirmDialog({
    title: t("The changes weren't saved"),
    message: t("The server couldn't save the latest changes ({reason}). If you go on, you lose them.", { reason: state.statusMessage || t("it isn't answering") }),
    ok: t("Continue without them"),
    danger: true,
  }).then(async (yes) => {
    if (yes) await discardPending();
    return yes;
  });
}

// ---- The links to a page (when it's deleted) ----

const ZONE_NAMES = { header: t("Shared header"), footer: t("Shared footer") };

// [{ kind, name, doc, found }]: the shared zones and the other pages that have links to /slug.
async function findLinksTo(slug) {
  const docs = [
    ...Object.keys(ZONE_NAMES).map((name) => ({ kind: "zone", name })),
    ...state.pages.filter((p) => p.slug !== slug).map((p) => ({ kind: "page", name: p.slug })),
  ];
  const out = [];
  await Promise.all(
    docs.map(async (d) => {
      const open = state.kind === d.kind && state.name === d.name;
      let doc;
      try {
        doc = open ? state.doc : d.kind === "page" ? await api.page(d.name) : await api.zone(d.name);
      } catch {
        return; // we can't read the document: we can't repair it either
      }
      const found = linksTo(doc, registry.get, `/${slug}`);
      if (found.length) out.push({ ...d, doc, found });
    }),
  );
  const rank = (l) => (l.kind === "zone" ? (l.name === "header" ? 0 : 1) : 2);
  return out.sort((a, b) => rank(a) - rank(b) || String(a.doc.title || a.name).localeCompare(String(b.doc.title || b.name), getLang()));
}

function linksNotice(slug, links, count, fix, loginHere) {
  if (!count && !loginHere) return null;
  const where = (l) => (l.kind === "zone" ? ZONE_NAMES[l.name] : t("The “{title}” page", { title: l.doc.title || l.name }));
  const names = (l) => [...new Set(l.found.map((f) => registry.meta(f.block.type).name))].join(", ");
  return h(
    "div",
    { class: "notice notice--warning dialog__links" },
    icon("alert", 16),
    h(
      "div",
      null,
      h("strong", null, count ? tn(count, "{n} link goes to /{slug}", "{n} links go to /{slug}", { slug }) : t("/{slug} is used in the settings", { slug })),
      h(
        "ul",
        null,
        links.map((l) => h("li", null, `${where(l)}: ${names(l)}`)),
        loginHere ? h("li", null, t("Site settings: the login page (choose another one after deleting)")) : null,
      ),
      count
        ? h(
            "label",
            { class: "switch" },
            fix,
            h("span", { class: "switch__track", "aria-hidden": "true" }),
            h("span", { class: "switch__text" }, t("Remove the links too, so visitors don't end up on a page that doesn't exist")),
          )
        : null,
    ),
  );
}

// Takes out the links found, reading each document again (it may have changed in the meantime).
// Returns [how many we took out, whether something failed].
async function removeLinks(slug, links) {
  let removed = 0;
  let failed = false;
  for (const l of links) {
    try {
      if (state.kind === l.kind && state.name === l.name) {
        let n = 0;
        commit((doc) => {
          n = removeLinksTo(doc, registry.get, `/${slug}`);
          return n > 0;
        }, { source: "links" });
        removed += n;
        continue;
      }
      const doc = l.kind === "page" ? await api.page(l.name) : await api.zone(l.name);
      const n = removeLinksTo(doc, registry.get, `/${slug}`);
      if (!n) continue;
      if (l.kind === "page") await api.savePage(l.name, doc);
      else {
        await api.saveZone(l.name, doc);
        state.zones[l.name] = doc;
        emit("zones");
        scheduleRender();
      }
      removed += n;
    } catch (err) {
      console.warn(`[editor] Couldn't take the links out of ${fileOf(l.kind, l.name)}:`, err.message);
      failed = true;
    }
  }
  return [removed, failed];
}

async function fetchZones() {
  const read = (name) => api.zone(name).catch(() => ({ blocks: [] }));
  const [header, footer] = await Promise.all([read("header"), read("footer")]);
  return { header: header || { blocks: [] }, footer: footer || { blocks: [] } };
}

async function refreshPages() {
  try {
    state.pages = await api.pages();
  } catch (err) {
    console.warn("[editor] Couldn't read the list of pages:", err.message);
    return;
  }
  const list = $("#page-paths");
  list.replaceChildren(...state.pages.map((p) => h("option", { value: p.path }, p.title || p.slug)));
  emit("pages");
}

function writeHash() {
  const hash = `#${state.kind}/${state.name}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
}

function readHash() {
  const m = /^#(page|zone)\/([a-z0-9][a-z0-9-]{0,63})$/.exec(location.hash);
  if (!m) return null;
  if (m[1] === "zone" && m[2] !== "header" && m[2] !== "footer") return null;
  return { kind: m[1], name: m[2] };
}

// ---- Shortcuts (they also come from the canvas, where the focus is after a click on the page) ----

function onKey(e) {
  const mod = e.metaKey || e.ctrlKey;
  const key = String(e.key || "").toLowerCase();
  const local = e.target?.ownerDocument === document;
  if (e.key === "Escape") {
    if (dnd.active) {
      e.preventDefault();
      dnd.cancel();
      return;
    }
    if (document.querySelector("dialog[open]")) return;
    if (preview.isOpen()) {
      preview.hide(true);
      return;
    }
    if (isMenuOpen()) {
      closeMenu();
      return;
    }
    if (isPickerOpen()) {
      closePicker();
      return;
    }
    if (local && isEditable(e.target)) {
      e.target.blur();
      return;
    }
    if (state.selected) {
      e.preventDefault();
      actions.select(null);
    }
    return;
  }
  if (document.querySelector("dialog[open]")) return;
  if (mod && key === "s") {
    e.preventDefault();
    actions.saveNow();
  } else if (mod && key === "z") {
    e.preventDefault();
    if (e.shiftKey) actions.redo();
    else actions.undo();
  } else if (e.ctrlKey && !e.metaKey && key === "y") {
    e.preventDefault();
    actions.redo();
  } else if (mod && key === "d") {
    e.preventDefault();
    if (state.selected && !isEditable(e.target)) actions.duplicate(state.selected);
  } else if ((e.key === "Delete" || e.key === "Backspace") && !mod && !e.altKey && !isEditable(e.target)) {
    if (state.selected) {
      e.preventDefault();
      actions.remove(state.selected);
    }
  } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.altKey && !mod && !isEditable(e.target)) {
    // From the canvas or the window (in Structure the row takes care of it, with the same rule).
    if (state.selected && !e.defaultPrevented && !e.target?.closest?.(".tree")) {
      e.preventDefault();
      actions.moveBy(state.selected, e.key === "ArrowUp" ? -1 : 1);
    }
  } else if (String(e.key || "").startsWith("Arrow") && !e.altKey && !mod && !isEditable(e.target)) {
    // A block on the Free canvas: the arrow keys move it one grid step, Shift + arrows change its size.
    // Only from the page (or with the focus on nothing in particular), so they don't steal the panels' arrows.
    const onPage = !local || e.target === document.body || e.target === iframe;
    if (state.selected && onPage && !e.defaultPrevented) {
      if (actions.nudge(state.selected, e.key, { shift: e.shiftKey, repeat: e.repeat })) e.preventDefault();
    }
  }
}
window.addEventListener("keydown", onKey);

// ---- Changes on disk (a programmer saves a component, someone edits a JSON) ----

const fileError = (err) => t("Error in {error}. Fix the file and save it: the editor reloads it by itself.", { error: err.message });

async function componentsChanged(file) {
  const { errors, reloaded, removed } = await registry.refresh(file);
  for (const err of errors) toast(fileError(err), { type: "error", timeout: 10000 });
  if (!errors.length && reloaded.length === 1 && file === `${reloaded[0]}.js`) {
    toast(t("Reloaded “{name}”.", { name: registry.meta(reloaded[0]).name }), { timeout: 1800 });
  }
  emit("components");
  if (reloaded.length || removed.length || errors.length) renderNow();
}

// `snapshot`: the version in the file seen when we announced the conflict. In the meantime, the
// automatic save may have written over it; then we put it back.
async function reloadFromDisk(kind, name, snapshot = null) {
  if (state.kind !== kind || state.name !== name) return;
  await discardPending();
  let remote;
  try {
    remote = kind === "page" ? await api.page(name) : await api.zone(name);
  } catch (err) {
    toast(t("Couldn't reload: {error}", { error: err.message }), { type: "error" });
    return;
  }
  if (state.kind !== kind || state.name !== name) return;
  const overwritten = snapshot !== null && canon(snapshot) !== canon(remote) && isKnownRemote(remote);
  const selected = state.selected;
  setDocument(kind, name, overwritten ? snapshot : remote, { reload: true });
  if (overwritten) markChanged();
  if (selected) setSelected(selected);
  renderNow();
}

async function openDocChanged() {
  const { kind, name } = state;
  let remote;
  try {
    remote = kind === "page" ? await api.page(name) : await api.zone(name);
  } catch (err) {
    if (err.status === 404 && kind === "page" && !state.dirty && deletingSlug !== name) {
      toast(t("The “{title}” page was deleted from the disk.", { title: state.doc?.title || name }), { type: "error" });
      await refreshPages();
      await actions.openDoc("page", "index", { force: true });
    }
    return;
  }
  if (state.kind !== kind || state.name !== name || isKnownRemote(remote)) return;
  if (!state.dirty && !isSaving()) {
    await reloadFromDisk(kind, name);
    toast(t("Loaded the new version of pages/{file}.", { file: fileOf(kind, name) }), { timeout: 4000, action: { label: t("Undo"), fn: () => actions.undo() } });
  } else {
    // It stays until you close it: the version on disk (kept here) can be loaded anytime with "Reload",
    // even if the automatic save has written over the file in the meantime.
    toast(t("The file pages/{file} changed on the disk. We're keeping your changes here; to load the version on the disk, use “Reload”.", { file: fileOf(kind, name) }), {
      timeout: Infinity,
      action: { label: t("Reload"), fn: () => reloadFromDisk(kind, name, remote) },
    });
  }
}

async function pagesChanged(file) {
  const name = String(file || "");
  await refreshPages();
  const zone = /^_(header|footer)\.json$/.exec(name)?.[1];
  if (zone && state.kind === "page") {
    try {
      const next = (await api.zone(zone)) || { blocks: [] };
      if (canon(next) !== canon(state.zones[zone])) {
        state.zones[zone] = next;
        emit("zones");
        renderNow();
      }
    } catch {
      // the server isn't answering; we try at the next change
    }
  }
  if (state.kind && name === fileOf()) await openDocChanged();
}

async function siteChanged() {
  if (settingsOpen) return;
  try {
    const site = await api.site();
    if (canon(site) === canon(state.site)) return;
    state.site = site;
    emit("site");
    renderNow();
  } catch {
    // we ignore it: the next change tries again
  }
}

// After the server was stopped and started again: we read everything again.
async function resync() {
  const errors = await registry.loadAll().catch(() => []);
  for (const err of errors) toast(fileError(err), { type: "error" });
  emit("components");
  await refreshPages();
  await siteChanged();
  if (state.kind === "page") {
    state.zones = await fetchZones();
    emit("zones");
  }
  renderNow();
  if (state.kind) await openDocChanged();
}

function connectEvents() {
  if (typeof EventSource !== "function") return;
  let queue = Promise.resolve();
  let lost = false;
  const run = (fn) => {
    queue = queue.then(fn).catch((err) => console.error("[editor]", err));
  };
  const source = new EventSource("/_api/events");
  source.onmessage = (m) => {
    let ev;
    try {
      ev = JSON.parse(m.data);
    } catch {
      return;
    }
    if (ev?.type === "components") run(() => componentsChanged(ev.file));
    else if (ev?.type === "pages") run(() => pagesChanged(ev.file));
    else if (ev?.type === "site") run(() => siteChanged());
  };
  source.onerror = () => {
    lost = true;
  };
  source.onopen = () => {
    if (lost) {
      lost = false;
      run(resync);
    }
  };
}

// ---- The panels ----

const tabs = [...document.querySelectorAll("[data-tab]")];
let currentTab = null;
function showTab(name, { remember = true } = {}) {
  currentTab = name;
  for (const tab of tabs) {
    const isOn = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(isOn));
    tab.tabIndex = isOn ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !isOn;
  }
  if (remember) pref("tab", name);
  if (name === "structure") structure?.render();
}

// The tab from before a drag that brought up Structure by itself: it comes back after the drop.
let tabBeforeDrag = null;

const dnd = createDnd({
  host,
  tree: {
    dropAt: (x, y, source) => structure.dropAt(x, y, source),
    clearDrop: () => structure.clearDrop(),
    dragStart: () => {
      preview.hide(true);
      structure.dragStart();
    },
    dragEnd: () => {
      structure.dragEnd();
      if (tabBeforeDrag) {
        showTab(tabBeforeDrag, { remember: false });
        tabBeforeDrag = null;
      }
    },
    scrollBy: (x, y, dy) => structure.scrollBy(x, y, dy),
    scrollPane: (dy) => structure.scrollPane(dy),
    rect: () => ($("#pane-structure").hidden ? null : $("#pane-structure").getBoundingClientRect()),
    panelRect: () => $(".left-pane").getBoundingClientRect(),
    showStructure: () => {
      if (currentTab === "structure") return;
      tabBeforeDrag = currentTab;
      showTab("structure", { remember: false });
    },
  },
  describe: (source) => {
    if (source.kind === "new") return registry.meta(source.type);
    const loc = locate(state.doc, source.id);
    const m = registry.meta(loc?.block.type || "");
    return { ...m, summary: loc ? summaryOf(loc.block, registry.get(loc.block.type)).slice(0, 40) : "" };
  },
  valid: (source, target) => source.kind !== "move" || canDrop(state.doc, source.id, target.slot),
  onDrop: (source, target) => {
    if (source.kind === "new") actions.add(source.type, target);
    else actions.move(source.id, target.slot, target.index, target.at || null);
  },
});
for (const tab of tabs) {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
  tab.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = tabs[(tabs.indexOf(tab) + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    showTab(next.dataset.tab);
  });
}

const preview = initPreview({
  panel: $(".left-pane"),
  site: () => state.previewSite || state.site || {},
  context: () => ({ selected: Boolean(state.selected), kind: state.kind === "zone" ? state.name : "page" }),
});
initPalette({ list: $("#palette"), search: $("#search"), dnd, preview, onAdd: (type) => actions.add(type) });
const structure = initStructure({
  root: $("#tree"),
  pane: $("#pane-structure"),
  dnd,
  actions,
  isVisible: () => !$("#pane-structure").hidden,
});
const props = initProps({ root: $("#props"), actions });
const topbar = initTopbar({
  els: {
    docBtn: $("#doc-button"),
    newPage: $("#new-page"),
    undoBtn: $("#undo"),
    redoBtn: $("#redo"),
    devices: $("#devices"),
    langs: $("#langs"),
    settings: $("#site-settings"),
    view: $("#view-page"),
    status: $("#status"),
  },
  actions,
});

on("doc", () => scheduleRender());
on("doc", (e) => {
  if (["props", "page", "history"].includes(e?.source)) {
    updateTitle();
    updateBanner();
  }
});
on("selection", () => host.select(state.selected));
on("document", () => {
  updateTitle();
  updateBanner();
  host.select(null);
});
on("pages", updateBanner);
on("save-error", (err) => {
  toast(t("Couldn't save: {error} Trying again automatically.", { error: err.message }), { type: "error" });
});

window.addEventListener("beforeunload", (e) => {
  if (state.dirty || isSaving()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("pagehide", () => {
  if (state.dirty && state.doc) saveOnExit(state.kind, state.name, state.doc);
});
window.addEventListener("hashchange", () => {
  const want = readHash();
  if (want) actions.openDoc(want.kind, want.name);
});

// ---- Starting up ----

function showFatal(err) {
  const box = $("#canvas-loading");
  box.hidden = false;
  box.classList.add("canvas__loading--error");
  box.replaceChildren(
    icon("alert", 28),
    h("p", { class: "canvas__loading-title" }, t("The editor couldn't start")),
    h("p", null, err?.message || String(err)),
    h("button", { type: "button", class: "btn btn--primary", onclick: () => location.reload() }, t("Try again")),
  );
}

async function boot() {
  topbar.renderDevice(device);
  showTab(pref("tab") === "structure" ? "structure" : "blocks");
  layoutSheet();
  try {
    const [site, pages, errors] = await Promise.all([api.site(), api.pages(), registry.loadAll()]);
    state.site = site || {};
    state.pages = pages || [];
    for (const err of errors) toast(fileError(err), { type: "error", timeout: 10000 });
    emit("components");
    if (!state.pages.length) {
      await api.savePage("index", { title: t("Home"), description: "", access: "public", blocks: [] });
    }
    await refreshPages();
    let want = readHash() || { kind: "page", name: "index" };
    if (want.kind === "page" && !state.pages.some((p) => p.slug === want.name)) {
      want = { kind: "page", name: (state.pages.find((p) => p.slug === "index") || state.pages[0]).slug };
    }
    if (!(await actions.openDoc(want.kind, want.name, { force: true }))) throw new Error(t("Couldn't open the page."));
    connectEvents();
  } catch (err) {
    console.error("[editor]", err);
    showFatal(err);
  }
}

boot();
