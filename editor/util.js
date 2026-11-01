// Small tools that every editor module uses.

import { fold } from "../core/html.js";

// DOM properties set directly on the element (not as attributes), after the children are added
// (otherwise `value` on a <select> doesn't have its options yet).
const PROPS = new Set(["value", "checked", "disabled", "selected", "indeterminate", "multiple", "htmlFor", "tabIndex"]);

// h("button", { class: "btn", onclick }, "Text", otherElement) → a DOM element.
// Text children always become text nodes, never HTML.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  const later = [];
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key === "style" && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith("--")) el.style.setProperty(k, String(v));
        else el.style[k] = v;
      }
    }
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (PROPS.has(key)) later.push([key, value]);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  for (const [key, value] of later) el[key] = value;
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false || child === "") continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(typeof child === "object" && child.nodeType ? child : String(child));
  }
}

// Runs `fn` only once the calls have stopped for `ms` milliseconds.
export function debounce(fn, ms) {
  let timer = null;
  let args = [];
  const run = () => {
    timer = null;
    fn(...args);
  };
  const wrapped = (...a) => {
    args = a;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  wrapped.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      run();
    }
  };
  wrapped.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  wrapped.pending = () => timer !== null;
  return wrapped;
}

// JSON with sorted keys: two objects with the same content give the same text, whatever the
// order of their keys (the server may reorder the keys when it saves).
export function canon(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) if (value[key] !== undefined) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

// Lowercase text without accents (for searching and for addresses): the same as in the core.
export { fold };

// "About us & our team" → "about-us-our-team"
export function slugify(text) {
  return fold(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

// A block id: "b_" + 8 random characters, different from the ones in `used`.
export function makeId(used = new Set()) {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let id = "b_";
    for (const b of bytes) id += BASE36[b % 36];
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

// The element takes the keys (Delete, Backspace) for itself, not for the editor.
export function isEditable(target) {
  if (!target || target.nodeType !== 1) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true;
}

const platform = typeof navigator !== "undefined" ? navigator.platform || navigator.userAgent || "" : "";
export const IS_MAC = /Mac|iPhone|iPad|iPod/.test(platform);
// For help texts: "⌘Z" on a Mac, "Ctrl+Z" everywhere else.
export const MOD = IS_MAC ? "⌘" : "Ctrl+";
export const SHIFT = IS_MAC ? "⇧" : "Shift+";

// Reads or writes a local preference without failing when the browser blocks storage.
export function pref(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(`blocks.${key}`);
    localStorage.setItem(`blocks.${key}`, value);
  } catch {
    // storage isn't available
  }
  return null;
}
