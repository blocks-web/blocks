// The components, loaded into the editor's window for their metadata (name, category, icon,
// props, slots). The canvas loads them separately, in its iframe, from the same addresses (the
// same ?v=... version).
//
// When a programmer saves a file, we load it again. If the new version has an error, we keep the
// old version and report the error.

import { validateComponent } from "../core/render.js";
import { api } from "./api.js";
import { fold } from "./util.js";
import { blockText, getLang, RO_SYNONYMS, t } from "./i18n.js";

const SESSION = Date.now().toString(36);
const loaded = new Map(); // id → { comp, url, warnings }
const failed = new Map(); // id → the error message (no good version loaded)
const versions = new Map();
let list = []; // [{ id, hasServer, error? }] from the server

async function importComponent(id) {
  const version = (versions.get(id) || 0) + 1;
  versions.set(id, version);
  const url = `/components/${id}.js?v=${SESSION}.${version}`;
  const mod = await import(url);
  const comp = mod?.default;
  if (!comp || typeof comp !== "object" || typeof comp.html !== "function") {
    throw new Error("the file doesn't export a component with html(p, ctx).");
  }
  // Typos in the component (e.g. "prop" instead of "props"): the programmer sees them in the console and in the panel.
  const warnings = validateComponent(comp);
  for (const w of warnings) console.warn(`[blocks] components/${id}.js: ${w}`);
  loaded.set(id, { comp, url, warnings });
  failed.delete(id);
}

// Why a component didn't load, with the file's path: "components/x.js, line 12: …" when the server
// knows the line (the browser doesn't say), otherwise "components/x.js: …". Only the first line (not the code shown).
function reason(id, err) {
  const fromServer = list.find((c) => c.id === id)?.error;
  const text = typeof fromServer === "string" && fromServer ? fromServer : `components/${id}.js: ${String(err?.message || err)}`;
  return text.split("\n")[0];
}

async function importMany(ids) {
  const errors = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        await importComponent(id);
      } catch (err) {
        const message = reason(id, err);
        if (!loaded.has(id)) failed.set(id, message);
        errors.push({ id, message });
      }
    }),
  );
  return errors;
}

// The first load (or after the server was stopped): everything from scratch.
export async function loadAll() {
  list = await api.components();
  const ids = new Set(list.map((c) => c.id));
  for (const id of [...loaded.keys()]) if (!ids.has(id)) loaded.delete(id);
  for (const id of [...failed.keys()]) if (!ids.has(id)) failed.delete(id);
  return importMany([...ids]);
}

// After a change on disk (`file` is the name in components/).
export async function refresh(file) {
  list = await api.components();
  const ids = new Set(list.map((c) => c.id));
  const changed = /^([a-z0-9][a-z0-9-]*)\.js$/.exec(String(file || ""))?.[1] || null;
  const removed = [...loaded.keys()].filter((id) => !ids.has(id));
  for (const id of removed) loaded.delete(id);
  for (const id of [...failed.keys()]) if (!ids.has(id)) failed.delete(id);
  const todo = [...ids].filter((id) => !loaded.has(id) || id === changed);
  const errors = await importMany(todo);
  const reloaded = todo.filter((id) => !errors.some((e) => e.id === id));
  return { errors, reloaded, removed };
}

export function get(id) {
  return loaded.get(id)?.comp || null;
}

export function has(id) {
  return loaded.has(id);
}

export function failure(id) {
  return failed.get(id) || null;
}

export function warnings(id) {
  return loaded.get(id)?.warnings || [];
}

// Needs a server: it has an <id>.server.js or declares `needsServer` (e.g. login).
export function hasServer(id) {
  return list.some((c) => c.id === id && c.hasServer) || get(id)?.needsServer === true;
}

// For the canvas: { id: url }, and { id: message } for the broken ones.
export function urls() {
  return Object.fromEntries([...loaded].map(([id, { url }]) => [id, url]));
}

export function broken() {
  return Object.fromEntries(failed);
}

// ---- Categories ----

// The palette's categories, in this order. "My blocks" shows only when it has something (what the
// person made for themselves); an unknown category (a programmer's own) comes right after it.
export const ORDER = ["My blocks", "Sections", "Text & images", "Lists", "Contact", "Members", "Page"];
const MINE = ORDER[0];
// Each category in the editor's language.
const LABELS = {
  "My blocks": t("My blocks"),
  Sections: t("Sections"),
  "Text & images": t("Text & images"),
  Lists: t("Lists"),
  Contact: t("Contact"),
  Members: t("Members"),
  Page: t("Page"),
};
// The template's old names for "My blocks", in Romanian (written without accents, as fold() gives them).
const LEGACY_MINE = new Set(["componentele mele", "blocurile mele"]);

// The category a component belongs to: one of ORDER (whatever the capitals or accents), or its own name.
export function categoryOf(comp) {
  const cat = String(comp?.category || "").trim();
  if (!cat || LEGACY_MINE.has(fold(cat))) return MINE;
  return ORDER.find((c) => fold(c) === fold(cat)) || cat;
}

// The category's name in the editor's language: ours from LABELS; a programmer's own from its
// component's i18n.ro.category (in Romanian), otherwise as written.
export function categoryLabel(category, comp = null) {
  if (Object.hasOwn(LABELS, category)) return LABELS[category];
  return (comp && blockText(comp, "category").trim()) || category;
}

// What the palette and the panels show about a component, in the editor's language.
export function meta(id) {
  const comp = get(id);
  const category = categoryOf(comp);
  return {
    id,
    name: (comp && blockText(comp, "name")) || id,
    category,
    categoryLabel: categoryLabel(category, comp),
    icon: String(comp?.icon || "▢"),
    description: comp ? blockText(comp, "description") : "",
    tip: comp ? blockText(comp, "tip") : "",
    exists: Boolean(comp),
  };
}

function categoryRank(name) {
  const i = ORDER.indexOf(name);
  return i === -1 ? 0.5 : i;
}

// Compares two categories (as categoryOf gives them) by the palette's order; unknown ones
// alphabetically, right after "My blocks".
export function compareCategories(a, b) {
  return categoryRank(a) - categoryRank(b) || String(a).localeCompare(String(b), getLang());
}

// The bundled blocks, in the palette's order: in each category from big to small, the most used
// first (Hero is a beginner's first step). The others come after them, alphabetically; Embed
// stays last: it's the way out for what doesn't exist yet.
const BLOCK_ORDER = [
  "hero", "image-text", "cards", "cta", "stats", "logos", "canvas",
  "text", "image", "gallery", "video", "list", "button", "quote",
  "pricing", "team", "faq", "news", "events", "timeline", "press",
  "locations", "hours", "map", "social", "form", "contact-form",
  "login", "signup", "account", "members-only",
  "navbar", "footer", "section", "columns", "spacer",
];
const LAST = "embed";

function blockRank(id) {
  if (id === LAST) return BLOCK_ORDER.length + 1;
  const i = BLOCK_ORDER.indexOf(id);
  return i === -1 ? BLOCK_ORDER.length : i;
}

// Compares two blocks of the same category ({ id, name }), by the order above.
export function compareBlocks(a, b) {
  return blockRank(a.id) - blockRank(b.id) || String(a.name).localeCompare(String(b.name), getLang());
}

// ---- Search ----

// Everyday words for the bundled blocks, so you find them the way you say them ("photos" → Gallery).
// In Romanian, RO_SYNONYMS (in i18n.js) are added.
const SYNONYMS = {
  gallery: "photos pictures album slideshow",
  image: "photo picture",
  logos: "logo partners sponsors clients brands",
  hours: "opening times schedule",
  pricing: "prices menu rates offer",
  map: "address location directions",
  locations: "map addresses branches",
  social: "facebook instagram networks",
  faq: "questions answers",
  events: "agenda calendar",
  team: "people staff",
  form: "booking reservation contact message",
  hero: "banner cover",
  cta: "call action",
};

function synonyms(id) {
  const words = Object.hasOwn(SYNONYMS, id) ? SYNONYMS[id] : "";
  const ro = getLang() === "ro" && Object.hasOwn(RO_SYNONYMS, id) ? RO_SYNONYMS[id] : "";
  return `${words} ${ro}`.split(/\s+/).filter(Boolean);
}

// How well a component matches the search: 0 = best, -1 = not at all.
// The name counts more than the description ("button" finds Button first, not the Navbar).
function score(m, q) {
  const name = fold(m.name);
  if (name.startsWith(q)) return 0;
  if (name.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 1;
  if (name.includes(q) || m.id.includes(q)) return 2;
  if (fold(m.categoryLabel).includes(q) || synonyms(m.id).some((w) => w.startsWith(q))) return 3;
  if (fold(m.description).includes(q)) return 4;
  return -1;
}

// [{ category, label, blocks: [meta] }] in the palette's order.
// With a search, the group with the best match comes first.
//   except: the ids not offered right now (e.g. the Navbar on a page that already shows the shared header).
// An alias (`alias: "form"`, e.g. contact-form) doesn't show: it's the same block, kept for older pages.
export function groups(filter = "", { except = [] } = {}) {
  const q = fold(filter).trim();
  const byCategory = new Map();
  for (const [id, { comp }] of loaded) {
    if (typeof comp.alias === "string" || except.includes(id)) continue;
    const m = meta(id);
    const s = q ? score(m, q) : 0;
    if (s < 0) continue;
    if (!byCategory.has(m.category)) byCategory.set(m.category, []);
    byCategory.get(m.category).push({ m, s });
  }
  const best = (items) => Math.min(...items.map((i) => i.s));
  return [...byCategory.entries()]
    .sort(([a, ia], [b, ib]) => (q && best(ia) !== best(ib) ? best(ia) - best(ib) : compareCategories(a, b)))
    .map(([category, items]) => ({
      category,
      label: items.find((i) => i.m.categoryLabel !== category)?.m.categoryLabel || categoryLabel(category),
      blocks: items.sort((x, y) => x.s - y.s || compareBlocks(x.m, y.m)).map((i) => i.m),
    }));
}

export const count = () => loaded.size;
