// Operations on the block tree of a document (a page or a shared zone).
// They don't touch the DOM, so they also run in Node (for the tests).
//
// A slot is named by a key, as in the rendering (data-slot):
//   "root"              the main list (doc.blocks)
//   "<blockId>:<slot>"  a block's slot (block.slots[slot])

import { raw } from "../core/html.js";
import { defaultFor, emptyZone, withDefaults } from "../core/render.js";
import { makeId } from "./util.js";
import { stripMarks } from "./format.js";
import { adjust, placeArriving, placeAt } from "./grid.js";

export function parseSlotKey(key) {
  if (!key || key === "root") return { owner: null, name: null };
  const i = key.lastIndexOf(":");
  if (i <= 0) return { owner: null, name: null };
  return { owner: key.slice(0, i), name: key.slice(i + 1) };
}

export function slotKey(parent, name) {
  return parent ? `${parent.id}:${name}` : "root";
}

// Where the block is: { block, list, index, parent, slot, key } or null.
export function locate(doc, id) {
  if (!id) return null;
  let found = null;
  const visit = (list, parent, name) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const block = list[i];
      if (!block || typeof block !== "object") continue;
      if (block.id === id) {
        found = { block, list, index: i, parent, slot: name, key: slotKey(parent, name) };
        return;
      }
      for (const [slot, kids] of Object.entries(block.slots || {})) {
        visit(kids, block, slot);
        if (found) return;
      }
    }
  };
  visit(doc?.blocks, null, null);
  return found;
}

// The parents of a block, from the closest to the top one.
export function ancestors(doc, id) {
  const out = [];
  let loc = locate(doc, id);
  while (loc?.parent) {
    out.push({ block: loc.parent, slot: loc.slot });
    loc = locate(doc, loc.parent.id);
  }
  return out;
}

// The list behind a slot key. With `create`, makes it if it's missing.
export function getList(doc, key, create = false) {
  const { owner, name } = parseSlotKey(key);
  if (!owner) {
    if (!Array.isArray(doc.blocks)) {
      if (!create) return null;
      doc.blocks = [];
    }
    return doc.blocks;
  }
  const loc = locate(doc, owner);
  if (!loc) return null;
  const block = loc.block;
  if (!block.slots || typeof block.slots !== "object" || Array.isArray(block.slots)) {
    if (!create) return null;
    block.slots = {};
  }
  if (!Array.isArray(block.slots[name])) {
    if (!create) return null;
    block.slots[name] = [];
  }
  return block.slots[name];
}

// The block (or one of its children, however deep) has the id `id`.
export function containsId(block, id) {
  if (!block || typeof block !== "object") return false;
  if (block.id === id) return true;
  for (const kids of Object.values(block.slots || {})) {
    if (Array.isArray(kids) && kids.some((k) => containsId(k, id))) return true;
  }
  return false;
}

// A block can't be moved into itself or into its children.
export function canDrop(doc, movingId, key) {
  const { owner } = parseSlotKey(key);
  if (!owner) return true;
  const loc = locate(doc, movingId);
  if (!loc) return true;
  return !containsId(loc.block, owner);
}

export function insert(doc, key, index, block) {
  const list = getList(doc, key, true);
  if (!list) return false;
  const i = Math.max(0, Math.min(Number.isFinite(index) ? index : list.length, list.length));
  list.splice(i, 0, block);
  return true;
}

export function remove(doc, id) {
  const loc = locate(doc, id);
  if (!loc) return null;
  loc.list.splice(loc.index, 1);
  return loc.block;
}

// Moves the block into the slot `key`, at position `index` (counted before the move).
// A move in place (right before or right after itself) returns false: nothing changed.
export function move(doc, id, key, index) {
  if (!canDrop(doc, id, key)) return false;
  const loc = locate(doc, id);
  if (!loc) return false;
  const target = getList(doc, key, true);
  if (!target) return false;
  let i = Math.max(0, Math.min(Number.isFinite(index) ? index : target.length, target.length));
  if (target === loc.list) {
    if (i === loc.index || i === loc.index + 1) return false;
    if (loc.index < i) i--;
  }
  loc.list.splice(loc.index, 1);
  target.splice(i, 0, loc.block);
  return true;
}

// Moves the block into the area `key` and fits its placement. With `free`, the area is a canvas: on
// the same canvas only the place changes (`at`: { x, y }; the size and the layer stay), and a block
// that arrives gets a placement (placeArriving: at `at` or under the last block). Outside a canvas,
// `placement` is removed. Returns false if nothing changed.
export function moveTo(doc, id, key, index, { free = false, at = null } = {}) {
  if (!free) {
    const l = locate(doc, id);
    if (!move(doc, id, key, index)) return false;
    delete l.block.placement;
    return true;
  }
  if (!canDrop(doc, id, key)) return false;
  const l = locate(doc, id);
  const target = l && getList(doc, key, true);
  if (!target) return false;
  if (target === l.list) {
    if (!at || typeof at !== "object") return false;
    const p = adjust({}, at);
    const old = adjust(l.block.placement, {});
    const next = placeAt(old, p.x, p.y);
    if (next.x === old.x && next.y === old.y) return false;
    l.block.placement = next;
    return true;
  }
  const a = placeArriving(target, l.block, at);
  l.list.splice(l.index, 1);
  target.push(l.block); // on a canvas the placement gives the place, not the order in the list
  l.block.placement = a;
  return true;
}

// A new block in the area `key`: on a canvas (`free`) it gets a placement, elsewhere it goes at `index`.
export function insertTo(doc, key, index, block, { free = false, at = null } = {}) {
  if (!free) {
    delete block.placement;
    return insert(doc, key, index, block);
  }
  const list = getList(doc, key, true);
  if (!list) return false;
  block.placement = placeArriving(list, block, at);
  list.push(block);
  return true;
}

// All the gaps of the document (the places where a block can go), in document order:
// [{ slot, index }]. Before each block come the gaps of its areas, then the gap after it, so
// "Section" is followed by "in Section, position 0". Hidden areas (hiddenSlots) and the subtree of
// the block `except` (the one being moved) are skipped; the gaps right before and right after it
// mean the same thing ("stays here"), so only the first shows. A canvas is a single gap
// ({ slot, index, free: true }): on it the placement gives the place, not the order, and its blocks
// move with the mouse or the arrow keys.
// `info`: slotInfo's result, if it's already computed (the settings panel uses it several times).
export function positions(doc, componentOf, base = {}, { except = null, info = null } = {}) {
  const { hidden, free } = info || slotInfo(doc, componentOf, base);
  const out = [];
  const visit = (list, key) => {
    const items = Array.isArray(list) ? list : [];
    if (free.has(key)) {
      out.push({ slot: key, index: items.length, free: true });
      return;
    }
    for (let i = 0; i <= items.length; i++) {
      const prev = items[i - 1];
      if (!(prev && prev.id === except)) out.push({ slot: key, index: i });
      const block = items[i];
      if (!block || typeof block !== "object" || block.id === except) continue;
      for (const name of Object.keys(componentOf(block.type)?.slots || {})) {
        const k = `${block.id}:${name}`;
        if (!hidden.has(k)) visit(block.slots?.[name], k);
      }
    }
  };
  visit(doc?.blocks, "root");
  return out;
}

// The place of the block `loc` (from locate) among the gaps: on a canvas, the canvas's gap; -1 if it
// has none (a hidden area).
export function positionIndex(all, loc) {
  return all.findIndex((p) => p.slot === loc.key && (p.free || p.index === loc.index));
}

// Moves the block to the previous (delta -1) or next (+1) gap in document order: it goes into and
// out of containers and canvases (on a canvas it lands under the last block). In a hidden area
// (which has no gaps) it stays in its list.
export function moveStep(doc, id, delta, componentOf, base = {}) {
  const loc = locate(doc, id);
  if (!loc) return false;
  const all = positions(doc, componentOf, base, { except: id });
  const cur = positionIndex(all, loc);
  if (cur === -1) {
    const j = loc.index + delta;
    if (j < 0 || j >= loc.list.length) return false;
    return move(doc, id, loc.key, j + (delta > 0 ? 1 : 0));
  }
  const next = all[cur + delta];
  if (!next) return false;
  return moveTo(doc, id, next.slot, next.index, { free: Boolean(next.free) });
}

export function collectIds(...docs) {
  const used = new Set();
  const visit = (list) => {
    for (const block of Array.isArray(list) ? list : []) {
      if (!block || typeof block !== "object") continue;
      if (typeof block.id === "string") used.add(block.id);
      for (const kids of Object.values(block.slots || {})) visit(kids);
    }
  };
  for (const doc of docs) visit(doc?.blocks);
  return used;
}

// A full copy, with new ids for the block and all its children.
export function cloneFresh(block, used = new Set()) {
  const copy = structuredClone(block);
  const renew = (b) => {
    b.id = makeId(used);
    for (const kids of Object.values(b.slots || {})) {
      if (Array.isArray(kids)) for (const k of kids) if (k && typeof k === "object") renew(k);
    }
  };
  renew(copy);
  return copy;
}

// A new block: each prop gets the default value from the component's schema.
export function createBlock(type, component, used = new Set()) {
  const props = {};
  for (const [key, field] of Object.entries(component?.props || {})) props[key] = defaultFor(field);
  return { id: makeId(used), type, props, slots: {} };
}

// Repairs what would confuse the editor in a file written by hand: blocks without an id, repeated
// ids, "props" or "slots" that aren't objects.
export function normalize(doc) {
  const out = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
  if (!Array.isArray(out.blocks)) out.blocks = [];
  const used = new Set();
  const fix = (list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i] || typeof list[i] !== "object" || Array.isArray(list[i])) list.splice(i, 1);
    }
    for (const block of list) {
      if (typeof block.type !== "string") block.type = String(block.type ?? "");
      if (typeof block.id !== "string" || !block.id || used.has(block.id)) block.id = makeId(used);
      else used.add(block.id);
      if (!block.props || typeof block.props !== "object" || Array.isArray(block.props)) block.props = {};
      if (block.slots !== undefined) {
        if (!block.slots || typeof block.slots !== "object" || Array.isArray(block.slots)) block.slots = {};
        for (const [name, kids] of Object.entries(block.slots)) {
          if (!Array.isArray(kids)) block.slots[name] = [];
          fix(block.slots[name]);
        }
      }
    }
  };
  fix(out.blocks);
  return out;
}

// How the component uses its slots right now: { shown, free }. `shown`: the rendered ones, in the
// order of `slots` (e.g. Columns has c1–c4, but with "2 columns" it renders only c1 and c2).
// `free`: the ones rendered as a canvas (ctx.slot(name, { free: true })). We find out by calling
// html() in editor mode, with a ctx.slot that only notes what it's asked for. If html() throws, all
// of them are shown and none is free.
function slotUse(block, component, base = {}) {
  const declared = Object.keys(component?.slots || {});
  if (!declared.length || typeof component.html !== "function") return { shown: declared, free: new Set() };
  const used = new Set();
  const free = new Set();
  try {
    component.html(withDefaults(component, block?.props), {
      mode: "editor",
      user: null,
      page: {},
      site: {},
      ...base,
      id: String(block?.id || ""),
      slot(name, options) {
        used.add(name);
        if (options?.free === true) free.add(name);
        return raw("");
      },
      isEmpty: (name) => emptyZone(block, name),
      reachable: () => true,
    });
  } catch {
    return { shown: declared, free: new Set() };
  }
  return { shown: declared.filter((name) => used.has(name)), free };
}

// The declared slots the component renders right now, in the order of `slots`.
export function shownSlots(block, component, base = {}) {
  return slotUse(block, component, base).shown;
}

// The document's areas, in a single pass: { hidden, free }, keys "blockId:slot".
//   hidden – the slots that don't show on the page: not rendered by their component, or sitting
//            (however deep) in a slot that isn't rendered;
//   free   – the free areas (canvases) that show on the page; a canvas in a hidden area doesn't count.
export function slotInfo(doc, componentOf, base = {}) {
  const hidden = new Set();
  const free = new Set();
  const visit = (list, off) => {
    for (const block of Array.isArray(list) ? list : []) {
      if (!block || typeof block !== "object") continue;
      const comp = componentOf(block.type);
      const declared = Object.keys(comp?.slots || {});
      if (!declared.length) continue;
      const use = off ? null : slotUse(block, comp, base);
      for (const name of declared) {
        const isOff = off || !use.shown.includes(name);
        const key = `${block.id}:${name}`;
        if (isOff) hidden.add(key);
        else if (use.free.has(name)) free.add(key);
        visit(block.slots?.[name], isOff);
      }
    }
  };
  visit(doc?.blocks, false);
  return { hidden, free };
}

export const freeSlots = (doc, componentOf, base = {}) => slotInfo(doc, componentOf, base).free;
export const hiddenSlots = (doc, componentOf, base = {}) => slotInfo(doc, componentOf, base).hidden;

// The link goes to the page with the address `path` ("/about", also with "/", "?…" or "#…" at the end).
export function linksToPath(value, path) {
  const base = String(value ?? "").trim().split(/[?#]/)[0];
  return Boolean(base) && (base.replace(/\/+$/, "") || "/") === path;
}

// A list item that is only a link (e.g. a Navbar entry: text + link) goes away with the page; in the
// others (e.g. a card) only the link is emptied.
const linkOnly = (fields) => Object.values(fields || {}).every((f) => f?.type === "text" || f?.type === "link");

// The "link" props that go to `path`, right on the block or in the items of a list (with the
// defaults, as in the rendering): [{ block, key, index, sub }] (index and sub only in lists).
export function linksTo(doc, componentOf, path) {
  const out = [];
  const visit = (list) => {
    for (const block of Array.isArray(list) ? list : []) {
      if (!block || typeof block !== "object") continue;
      const comp = componentOf(block.type);
      if (comp) {
        const props = withDefaults(comp, block.props);
        for (const [key, field] of Object.entries(comp.props || {})) {
          if (field?.type === "link" && linksToPath(props[key], path)) out.push({ block, key });
          if (field?.type !== "list") continue;
          props[key].forEach((item, index) => {
            for (const [sub, f] of Object.entries(field.fields || {})) {
              if (f?.type === "link" && linksToPath(item[sub], path)) out.push({ block, key, index, sub });
            }
          });
        }
      }
      for (const kids of Object.values(block.slots || {})) visit(kids);
    }
  };
  visit(doc?.blocks);
  return out;
}

// Takes the links to `path` out of the document (it changes it). Returns how many it took out.
export function removeLinksTo(doc, componentOf, path) {
  const found = linksTo(doc, componentOf, path);
  const gone = new Map(); // block → the list items already taken out ("key|index")
  // From the last item to the first, so the indexes in the lists stay valid.
  for (const { block, key, index, sub } of [...found].reverse()) {
    const comp = componentOf(block.type);
    if (!block.props || typeof block.props !== "object" || Array.isArray(block.props)) block.props = {};
    if (index === undefined) {
      block.props[key] = "";
      continue;
    }
    if (!Array.isArray(block.props[key])) block.props[key] = withDefaults(comp, block.props)[key];
    const list = block.props[key];
    if (!gone.has(block)) gone.set(block, new Set());
    if (gone.get(block).has(`${key}|${index}`)) continue;
    if (linkOnly(comp.props[key].fields)) {
      list.splice(index, 1);
      gone.get(block).add(`${key}|${index}`);
    } else if (list[index] && typeof list[index] === "object") list[index][sub] = "";
  }
  return found.length;
}

// A short line that describes the block (for Structure): the first text filled in, without marks.
export function summaryOf(block, component) {
  if (!component) return "";
  const props = withDefaults(component, block?.props);
  for (const [key, field] of Object.entries(component.props || {})) {
    if (field?.type !== "text" && field?.type !== "longtext") continue;
    const value = typeof props[key] === "string" ? props[key].trim() : "";
    if (value) return stripMarks(value.split("\n")[0]).slice(0, 80);
  }
  return "";
}

// How many blocks the list has, including the ones in slots.
export function countBlocks(list) {
  let n = 0;
  for (const block of Array.isArray(list) ? list : []) {
    if (!block || typeof block !== "object") continue;
    n++;
    for (const kids of Object.values(block.slots || {})) n += countBlocks(kids);
  }
  return n;
}
