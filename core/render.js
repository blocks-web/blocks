// Turns a page (JSON) into HTML.
//
// The same file runs in the editor (in the browser) and on the server, so what you see in
// the editor is exactly what the visitor gets.
//
// Modes:
//   "editor" – in the editor: blocks get markers for drag & drop
//   "site"   – the page served by the server (it knows who is logged in)
//   "static" – the static export (there is no server and nobody is logged in)

import { html, raw, escape, fold, isSafe, url } from "./html.js";

// The theme every site starts with: warm and calm (see docs/DESIGN.md). site.json can change it.
export const DEFAULT_THEME = {
  primary: "#E8562A",
  text: "#2B211D",
  background: "#ffffff",
  surface: "#FAF6F2",
  font: "ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  radius: "12px",
};

// The default value of a field in `props`.
export function defaultFor(field) {
  if (field && "default" in field) return structuredClone(field.default);
  switch (field?.type) {
    case "number": {
      // 0, but inside the range the schema asks for: { min: 5 } → 5.
      let n = 0;
      if (Number.isFinite(field.min) && n < field.min) n = field.min;
      if (Number.isFinite(field.max) && n > field.max) n = field.max;
      return n;
    }
    case "choice": {
      // The first option, so the value is always one of the allowed ones.
      const first = Array.isArray(field.options) ? field.options[0] : undefined;
      if (first && typeof first === "object") return String(first.value ?? "");
      return first === undefined || first === null ? "" : String(first);
    }
    case "checkbox":
      return false;
    case "list":
      return [];
    default:
      return ""; // text, longtext, color, image, link, date, html
  }
}

// The allowed values of a "choice": ["a", "b"] or [{ value, label }] → ["a", "b"].
function choiceValues(field) {
  return (Array.isArray(field?.options) ? field.options : []).map((o) =>
    o && typeof o === "object" ? String(o.value ?? "") : String(o ?? ""),
  );
}

const NUMERIC = /^\s*-?\d+(\.\d+)?\s*$/;

// A field's value, brought in line with what its type promises: a "choice" is always one of its
// `options`, a "number" is finite and between `min` and `max` (an integer when `step` is an integer),
// a "checkbox" is true or false, an "html" is text. Anything else gets the default value. This way
// nothing unexpected from the page file ends up in a class or a style.
function coerce(field, value) {
  switch (field?.type) {
    case "choice": {
      const s = typeof value === "string" || typeof value === "number" ? String(value) : null;
      return s !== null && choiceValues(field).includes(s) ? s : defaultFor(field);
    }
    case "number": {
      const toNumber = (v) => (typeof v === "string" && NUMERIC.test(v) ? Number(v) : v);
      let n = toNumber(value);
      if (typeof n !== "number" || !Number.isFinite(n)) n = toNumber(defaultFor(field));
      if (typeof n !== "number" || !Number.isFinite(n)) n = 0;
      if (Number.isInteger(field.step)) n = Math.round(n);
      if (Number.isFinite(field.min)) n = Math.max(field.min, n);
      if (Number.isFinite(field.max)) n = Math.min(field.max, n);
      return n;
    }
    case "checkbox":
      return typeof value === "boolean" ? value : defaultFor(field) === true;
    case "html":
      // HTML code goes into the page exactly as it is (raw), so it has to be a string.
      return typeof value === "string" ? value : "";
    default:
      return value;
  }
}

// Fills the missing props with the defaults from the component's schema and brings each one to its
// type (see coerce): p.X is always what the field promises, inside list items too.
export function withDefaults(component, props) {
  const out = { ...(props && typeof props === "object" ? props : {}) };
  for (const [key, field] of Object.entries(component?.props || {})) {
    if (out[key] === undefined || out[key] === null) out[key] = defaultFor(field);
    if (field?.type === "list") {
      if (!Array.isArray(out[key])) out[key] = defaultFor(field);
      if (!Array.isArray(out[key])) out[key] = []; // a wrong "default" in the schema
      out[key] = out[key].map((item) => withDefaults({ props: field.fields || {} }, item));
    } else out[key] = coerce(field, out[key]);
  }
  return out;
}

// The block's area `name` holds no block at all (ctx.isEmpty). Items that aren't objects don't count.
export function emptyZone(block, name) {
  const kids = block?.slots && typeof block.slots === "object" && Object.hasOwn(block.slots, name) ? block.slots[name] : null;
  return !Array.isArray(kids) || !kids.some((b) => b && typeof b === "object");
}

// Walks every block in a list, including the ones inside slots.
export function eachBlock(blocks, fn, parent = null) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== "object") continue;
    fn(block, parent);
    for (const children of Object.values(block.slots || {})) eachBlock(children, fn, block);
  }
}

// ---- Free canvas: blocks placed anywhere (docs/ARCHITECTURE.md, “The Free canvas”) ----
//
// A block inside a free area (ctx.slot(name, { free: true })) has, next to `props`, a `placement`
// field: { x, y, w, h, z, shape, fill }. Only integers and values from a fixed list reach the page;
// nothing anyone types ends up in the CSS.

// The grid limits, in one place: the core applies them and the editor builds its geometry on them.
//   phone: below this many px of grid width, cells stack one under the other; row: the minimum row height.
export const LIMITS = Object.freeze({ columns: 12, y: 200, h: 60, z: 50, phone: 640, row: "2rem" });
export const COLUMNS = LIMITS.columns;
export const SHAPES = ["rect", "rounded", "circle"];

// An integer between min and max. A number written as text ("3") is accepted; anything else (other
// text, NaN, objects, missing) → `fallback`. Fractions are rounded, out-of-range values are clamped.
function integer(value, min, max, fallback) {
  let n = value;
  if (typeof n === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(n)) n = Number(n);
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// The placement, repaired to the nearest valid value. It never throws and always returns a new object.
//   safePlacement({ x: 10, w: 6 }) → { x: 10, y: 1, w: 3, h: 4, z: 0, shape: "rect", fill: false }
export function safePlacement(a) {
  // Own fields only; an odd object (a getter that throws, a Proxy) gives the default.
  const get = (key) => {
    try {
      return a !== null && typeof a === "object" && Object.hasOwn(a, key) ? a[key] : undefined;
    } catch {
      return undefined;
    }
  };
  const x = integer(get("x"), 1, COLUMNS, 1);
  const shape = get("shape");
  return {
    x,
    y: integer(get("y"), 1, LIMITS.y, 1),
    w: Math.min(integer(get("w"), 1, COLUMNS, 6), COLUMNS + 1 - x), // the width shrinks so the block fits
    h: integer(get("h"), 1, LIMITS.h, 4),
    z: integer(get("z"), 0, LIMITS.z, 0),
    shape: typeof shape === "string" && SHAPES.includes(shape) ? shape : "rect",
    fill: get("fill") === true,
  };
}

// The grid CSS, added once per page, before the components' CSS (it also works with
// "blocksStyles": false). 12 columns, 2rem rows that grow when the text needs more room (nothing is
// cut off). Below 640 px of grid width, the cells stack one under the other, in page order; a cell
// filled by an image keeps its height. `isolation` keeps the layers (z-index) inside the canvas, so
// a cell can't go over the sticky menu. Every cell is a container (container queries): a block inside
// it lays itself out by the cell's width, as in a narrow column.
// A cell placed over a block with text (b-cell--over) gets the canvas background (--b-grid-background).
export const GRID_CSS = `.b-grid{--b-grid-gap:1rem;display:grid;grid-template-columns:repeat(${LIMITS.columns},minmax(0,1fr));grid-auto-rows:minmax(${LIMITS.row},auto);column-gap:var(--b-grid-gap);row-gap:0;align-content:start;width:100%;position:relative;isolation:isolate;container:b-grid/inline-size}
.b-cell{position:relative;display:flex;flex-direction:column;justify-content:center;min-width:0;container-type:inline-size}
.b-cell--over{background:var(--b-grid-background,var(--background))}
.b-cell .b-block{padding-block:0}
.b-cell .b-container{width:auto;margin-inline:0}
.b-cell--rounded{border-radius:var(--radius,12px);overflow:hidden;overflow:clip}
.b-cell--circle{clip-path:circle(closest-side)}
.b-cell--fill img,.b-cell--fill video{position:absolute;inset:0;width:100%;height:100%;max-width:none;object-fit:cover}
.b-grid>.b-empty{grid-column:1/-1;grid-row:1/-1;min-height:8rem}
@container b-grid (width < ${LIMITS.phone}px){
.b-grid>.b-cell{grid-column:1/-1!important;grid-row-start:auto!important;z-index:auto!important}
.b-grid>.b-cell:not(.b-cell--fill){grid-row-end:auto!important}
.b-grid>.b-cell~.b-cell{margin-block-start:var(--b-grid-gap)}
.b-grid>.b-cell--over{background:none}
}`;

// The shared zones: the header and the footer show on every page (pages/_header.json,
// pages/_footer.json). A page can hide them with "zones": false.
export const ZONES = ["header", "footer"];

export const TYPES = ["text", "longtext", "number", "color", "choice", "checkbox", "image", "link", "list", "date", "html"];
// "tip": one more sentence after "description", shown by the editor when hovering over the block.
// "alias": the id of the component it reuses (e.g. contact-form → "form"); it doesn't show in the palette.
// "i18n": the editor texts in other languages, e.g. { ro: { name, description, props: { ... } } }.
const KEYS = ["name", "category", "icon", "description", "tip", "props", "slots", "html", "css", "js", "needsServer", "alias", "i18n"];
// "format": a "text" field shown with inline() sets { format: true }, so the editor shows the formatting bar.
const FIELD_KEYS = ["type", "label", "default", "help", "min", "max", "step", "options", "fields", "format"];

// How many edits turn one word into the other: a letter added, removed or changed, or two letters swapped.
export function typoDistance(a, b) {
  const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    rows[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

// The known key that an unknown one was meant to be: the same but for accents or capital letters
// ("Props"), or a typo of it ("descripton"; one edit in a short key, two in a longer one). null if none.
function lookalike(key, known) {
  if (known.includes(key)) return null;
  const folded = fold(key);
  return (
    known.find((k) => fold(k) === folded) ??
    known.find((k) => typoDistance(folded, fold(k)) <= (k.length <= 4 ? 1 : 2)) ??
    null
  );
}

// Easy mistakes in a component (e.g. "Props" with a capital letter, "descripton"), as warnings for the
// programmer. The component keeps working; only the wrong part is ignored. An empty list means all is well.
export function validateComponent(component) {
  const out = [];
  if (!component || typeof component !== "object") return out;
  for (const key of Object.keys(component)) {
    const known = lookalike(key, KEYS);
    if (known) out.push(`the key “${key}” is ignored; write “${known}”.`);
  }
  if (!component.name) out.push("“name” is missing (the name shown in the palette).");

  const fields = (schema, where, inList) => {
    if (schema === undefined) return;
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      out.push(`“${where}” must be an object { key: field }.`);
      return;
    }
    for (const [name, field] of Object.entries(schema)) {
      const at = `${where}.${name}`;
      if (!field || typeof field !== "object") {
        out.push(`${at} must be an object, e.g. { type: "text" }.`);
        continue;
      }
      for (const key of Object.keys(field)) {
        const known = lookalike(key, FIELD_KEYS);
        if (known) out.push(`${at}: the key “${key}” is ignored; write “${known}”.`);
      }
      if (field.type === undefined) out.push(`${at}: “type” is missing (${TYPES.join(", ")}).`);
      else if (!TYPES.includes(field.type)) {
        const known = TYPES.find((t) => t === fold(field.type));
        out.push(`${at}: there is no type “${field.type}”${known ? `; write “${known}”` : ""}. Types: ${TYPES.join(", ")}.`);
      }
      if (field.type === "choice" && !(Array.isArray(field.options) && field.options.length)) {
        out.push(`${at}: a “choice” field needs “options”, e.g. ["a", "b"].`);
      }
      if (field.type === "list") {
        if (inList) out.push(`${at}: a “list” can't sit inside another “list”.`);
        else if (!field.fields || typeof field.fields !== "object") {
          out.push(`${at}: a “list” needs “fields”, e.g. { text: { type: "text" } }.`);
        } else fields(field.fields, `${at}.fields`, true);
      }
    }
  };
  fields(component.props, "props", false);
  const { slots, i18n } = component;
  if (slots !== undefined && (!slots || typeof slots !== "object" || Array.isArray(slots))) {
    out.push("“slots” must be an object, e.g. { content: \"Content\" }.");
  }
  if (component.js !== undefined && typeof component.js !== "function") out.push("“js” must be a function: js(el, p, api) { ... }.");
  if (component.alias !== undefined && !(typeof component.alias === "string" && /^[a-z0-9][a-z0-9-]*$/.test(component.alias))) {
    out.push("“alias” is the id of the reused component, e.g. alias: \"form\".");
  }
  if (i18n !== undefined && (!i18n || typeof i18n !== "object" || Array.isArray(i18n))) {
    out.push("“i18n” must be an object, e.g. { ro: { name: \"...\" } }.");
  }
  return out;
}

const warned = new Set();
function warnOnce(message) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[blocks] ${message}`);
}

// Pieces of HTML put into <head> exactly as they are (site.json → "head", plus the page's own),
// e.g. an icon for iPhone or a short <script> that runs before the first paint.
// It is HTML written by the site owner, as "trusted" as a component.
// It doesn't show in the editor (the editor only renders the page body).
export function headExtras(page, site) {
  const list = [...(Array.isArray(site?.head) ? site.head : []), ...(Array.isArray(page?.head) ? page.head : [])];
  return list.map((t) => String(t ?? "")).filter(Boolean);
}

// The site's CSS or JS files: site.json → "styles" / "scripts" (lists of addresses).
// A page with its own list uses it instead of the site's (e.g. a page with a different design).
export function siteFiles(page, site, key) {
  const list = Array.isArray(page?.[key]) ? page[key] : Array.isArray(site?.[key]) ? site[key] : [];
  return list.map((u) => url(String(u ?? ""))).filter((u) => u && u !== "#");
}

// The words the core writes in the editor, in English. The editor passes its own `t` to show them
// in its language: t("English text with {name}", { name }) → text.
function englishText(text, values = {}) {
  return String(text).replace(/\{(\w+)\}/g, (m, key) => (Object.hasOwn(values, key) ? String(values[key]) : m));
}

// The page a link on this site points to: "/about/?x=1#team" → "/about". null for a link to another
// site ("https://…", "//…", "mailto:…") or one that isn't an address.
export function sitePath(link) {
  const text = String(link ?? "").trim();
  if (!text.startsWith("/") || text.startsWith("//")) return null;
  return text.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

// Renders the blocks of a page. It returns the pieces, not a whole document, so the editor can put
// them in its own frame.
//   path: the page address (e.g. "/about"), for ctx.path (e.g. the active link in a menu)
//   zones: { header: { blocks }, footer: { blocks } }  (optional)
//   onError({ type, id, zone, error }): a block that couldn't be rendered (a missing component,
//     without `error`, or an html() that threw). By default the error goes to the console.
//   t(text, values): translates the editor texts (empty areas, broken blocks); English by default.
//   missingPages: the addresses of the site's pages that aren't there (the static export leaves out
//     the members-only ones), e.g. ["/account"]. ctx.reachable(link) is false for a link to one of them,
//     so a menu can leave it out instead of sending visitors to "Page not found".
//   → { body, css, instances, types, shown }
//     shown: the blocks displayed (the objects from the page and the zones), e.g. so the server can
//     check that a form really shows for the visitor who submits it (not in a hidden area or members only)
export function renderParts({ page, site = {}, components, mode = "site", user = null, zones = {}, onError = null, path = null, t = englishText, missingPages = [] }) {
  const state = {
    mode, readonly: false, zone: null, onError, t, css: new Map(), grid: false, types: new Set(), auto: 0,
    instances: [],
    ids: new Set(), // the ids in `instances`: a Set, so a big page doesn't cost quadratic time
    shown: [], // the blocks displayed
  };
  const missing = new Set([...(missingPages || [])].map(sitePath).filter(Boolean));
  const reachable = (link) => !missing.has(sitePath(link));
  const base = { mode, user, page: page || {}, site, path, reachable };
  const zone = (name) => {
    const blocks = page?.zones === false ? null : zones?.[name]?.blocks;
    if (!Array.isArray(blocks) || !blocks.length) return "";
    // In the editor, the shared zones show on every page, but they are edited separately.
    state.readonly = true;
    state.zone = name;
    const inner = renderSlot(blocks, "", "", components, base, state);
    state.readonly = false;
    state.zone = null;
    return mode === "editor" ? html`<div class="b-zone" data-zone="${name}">${inner}</div>` : inner;
  };
  const header = zone("header");
  const main = renderSlot(page?.blocks, "root", "", components, base, state);
  const body = html`${header}<main class="b-page" id="content">${main}</main>${zone("footer")}`;
  const css = [...state.css.entries()].map(([type, css]) => `/* ${type} */\n${css}`);
  // The grid first, so a component can change its rules (e.g. the gap between columns).
  if (state.grid) css.unshift(`/* free grid */\n${GRID_CSS}`);
  return {
    body: String(body),
    css: css.join("\n"),
    instances: state.instances,
    types: [...state.types],
    shown: new Set(state.shown),
  };
}

function renderSlot(blocks, slotKey, label, components, base, state) {
  const items = (Array.isArray(blocks) ? blocks : []).map((b) => renderBlock(b, components, base, state));
  if (state.mode === "editor" && !state.readonly) {
    const empty = items.length
      ? ""
      : html`<div class="b-empty" data-empty>${label ? state.t("Drag a block into “{label}”", { label }) : state.t("Drag a block here")}</div>`;
    return html`<div class="b-slot" data-slot="${slotKey}">${items}${empty}</div>`;
  }
  return html`<div class="b-slot">${items}</div>`;
}

// A free area: the grid, with every block in a cell placed by its `placement`. The cells come in
// reading order (top → bottom, then left → right): that's how they stack on a phone and how screen
// readers read them. The `style` attribute is written only from the integers given by safePlacement.
function renderGrid(blocks, slotKey, components, base, state) {
  state.grid = true;
  const editable = state.mode === "editor" && !state.readonly;
  const list = (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && typeof b === "object")
    .map((block, i) => ({ block, a: safePlacement(block.placement), i }))
    .sort((p, q) => p.a.y - q.a.y || p.a.x - q.a.x || p.i - q.i)
    .map(({ block, a }) => {
      // The same id on the cell and on the block, even for a block without an id (written by hand).
      const id = String(block.id || `auto${++state.auto}`);
      return { a, id, inner: renderBlock(block.id ? block : { ...block, id }, components, base, state) };
    })
    .filter((c) => String(c.inner)); // a missing component on the site: not even its cell takes up room
  const over = overlapping(list);
  const cells = list.map((c) => {
    const { a, id, inner } = c;
    const cls = `b-cell b-cell--${a.shape}${a.fill ? " b-cell--fill" : ""}${over.has(c) ? " b-cell--over" : ""}`;
    const style = `grid-area:${a.y} / ${a.x} / span ${a.h} / span ${a.w};z-index:${a.z}`;
    return editable
      ? html`<div class="${cls}" style="${style}" data-cell="${id}">${inner}</div>`
      : html`<div class="${cls}" style="${style}">${inner}</div>`;
  });
  const empty =
    editable && !list.length
      ? html`<div class="b-empty" data-empty>${state.t("Drag a block here, then place it anywhere and drag its corners to make it bigger.")}</div>`
      : "";
  return html`<div class="b-grid" data-grid="${slotKey}">${cells}${empty}</div>`;
}

// The cells (in reading order) that sit over a cell drawn before them which isn't an image filling
// its cell: they get a background, so the text underneath doesn't show through. Over an image that
// fills its cell, the cell stays transparent (a title on a photo). Cells are drawn by layer, then in
// reading order. A map of the grid's squares: the work is at most w × h squares per cell.
function overlapping(list) {
  const out = new Set();
  const taken = new Uint8Array(COLUMNS * (LIMITS.y + LIMITS.h)); // 1: a block with text is already drawn here
  const order = list.map((c, i) => ({ c, i })).sort((p, q) => p.c.a.z - q.c.a.z || p.i - q.i);
  for (const { c } of order) {
    const { x, y, w, h, fill } = c.a;
    let under = false;
    for (let r = y - 1; r < y - 1 + h; r++) {
      for (let k = x - 1; k < x - 1 + w; k++) {
        const i = r * COLUMNS + k;
        if (taken[i]) under = true;
        else if (!fill) taken[i] = 1;
      }
    }
    if (under) out.add(c);
  }
  return out;
}

function renderBlock(block, components, base, state) {
  if (!block || typeof block !== "object") return "";
  const type = String(block.type ?? "");
  const id = String(block.id || `auto${++state.auto}`);
  const component = components && Object.hasOwn(components, type) ? components[type] : null;
  const editor = state.mode === "editor";

  if (!component || typeof component.html !== "function") {
    state.onError?.({ type, id, zone: state.zone });
    return editor
      ? html`<div class="b-missing" data-c="${type}" data-id="${id}">${state.t("The “{type}” block no longer exists: remove it from the page or put the file components/{type}.js back.", { type })}</div>`
      : "";
  }

  state.types.add(type);
  if (component.css && !state.css.has(type)) state.css.set(type, String(component.css));

  let props = {};
  const ctx = {
    ...base,
    id,
    // { free: true }: the blocks in the area sit anywhere on a grid (Free canvas), not one under the other.
    slot(name, options) {
      if (!component.slots || !Object.hasOwn(component.slots, name)) {
        warnOnce(
          `The “${type}” component uses ctx.slot("${name}"), but “${name}” isn't in “slots”. ` +
            `Add it there (slots: { ${name}: "Label" }); otherwise a typo moves the content into a new area.`,
        );
      }
      if (options?.free === true) return renderGrid(block.slots?.[name], `${id}:${name}`, components, base, state);
      const label = component.slots?.[name] ?? name;
      return renderSlot(block.slots?.[name], `${id}:${name}`, label, components, base, state);
    },
    // The area holds no block (e.g. an empty "Members only" doesn't ask anyone to log in).
    isEmpty: (name) => emptyZone(block, name),
  };

  let inner;
  let failed = false;
  const mark = state.instances.length;
  const markShown = state.shown.length;
  try {
    // Also in here: a broken schema (e.g. a "default" that can't be copied) breaks only the block, not the page.
    props = withDefaults(component, block.props);
    inner = component.html(props, ctx);
    if (typeof inner?.then === "function") {
      inner.then(null, () => {}); // otherwise an error in the async function would go unhandled (and stop the server)
      throw new Error("html() can't be async: return html`...` directly. Load data from the server in js(), with api.get.");
    }
    if (inner !== null && typeof inner === "object" && !isSafe(inner) && !Array.isArray(inner)) {
      throw new Error("html() must return html`...` (or a string), not an object.");
    }
  } catch (err) {
    if (state.onError) state.onError({ type, id, zone: state.zone, error: err });
    else console.error(`[blocks] Error in the “${type}” component:`, err);
    inner = editor
      ? html`<div class="b-error">${state.t("The “{name}” block couldn't be displayed: {error}. It doesn't show on the site; its code is in components/{type}.js.", { name: component.name || type, error: err?.message, type })}</div>`
      : "";
    failed = true;
    // The children rendered before the error are no longer on the page.
    for (const i of state.instances.splice(mark)) state.ids.delete(i.id);
    state.shown.length = markShown;
  }

  // A block with an error doesn't start its js; a slot rendered twice doesn't start it twice.
  if (typeof component.js === "function" && !failed && !state.ids.has(id)) {
    state.instances.push({ id, type, props });
    state.ids.add(id);
  }
  if (!failed) state.shown.push(block);

  // Plain text returned by a component counts as HTML written by its author. false, null and
  // undefined show nothing, and a list is joined as in html`...` (e.g. `return p.show && html`...``).
  const content = isSafe(inner)
    ? inner
    : Array.isArray(inner)
      ? html`${inner}`
      : raw(inner === null || inner === undefined || inner === false ? "" : inner);
  return html`<div class="c-${type}" data-c="${type}" data-id="${id}">${content}</div>`;
}

// The site's colors and font, as CSS variables (--primary, --text, ...).
export function themeCss(site = {}) {
  const theme = { ...DEFAULT_THEME, ...(site?.theme || {}) };
  const vars = Object.entries(theme)
    .map(([key, value]) => `--${String(key).replace(/[^a-z0-9-]/gi, "")}:${String(value).replace(/[<>{};\\]/g, "")};`)
    .join("");
  return `:root{${vars}}`;
}

// JSON that can safely sit inside a <script>.
export function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function safeCss(css) {
  return String(css).replace(/<\/style/gi, "<\\/style");
}

// The rules without which blocks would lay out wrong (see base.css): the wrappers have no box, and the
// page is the container blocks lay themselves out by (container queries); a canvas cell or a column is another.
export const ESSENTIAL_CSS = "[data-c],.b-slot{display:contents}body{container-type:inline-size}";

// The full HTML document, ready to send to the browser.
//   csp: the safety rules (server/csp.js), as a <meta> before any other content. For the static
//     export, where there is no server to send them as a header.
//   missingPages: as in renderParts (the static export passes its members-only pages).
export function renderPage({ page = {}, site = {}, components, mode = "site", user = null, zones = {}, onError = null, path = null, csp = "", missingPages = [] }) {
  const parts = renderParts({ page, site, components, mode, user, zones, onError, path, missingPages });
  // "windowTitle" on a page replaces the whole title; otherwise "Page · Site" (the separator from site.json).
  const title = page.windowTitle || [page.title, site.name].filter(Boolean).join(site.titleSeparator ?? " · ");
  // A site with its own design can do without the Blocks styles ("blocksStyles": false).
  const baseCss =
    site.blocksStyles === false ? `<style>${ESSENTIAL_CSS}</style>` : `<link rel="stylesheet" href="/core/base.css">`;
  const siteCss = siteFiles(page, site, "styles")
    .map((href) => `<link rel="stylesheet" href="${escape(href)}">\n`)
    .join("");
  const siteJs = siteFiles(page, site, "scripts")
    .map((src) => `<script src="${escape(src)}"></script>\n`)
    .join("");
  const icon = site.favicon ? url(site.favicon) : "data:,";
  const extras = headExtras(page, site).map((t) => `${t}\n`).join("");

  let scripts = "";
  if (parts.instances.length) {
    const data = { mode, instances: parts.instances };
    if (mode === "site") data.user = user ? publicUser(user) : null;
    scripts =
      `<script type="application/json" id="b-data">${safeJson(data)}</script>\n` +
      `<script type="module" src="/core/runtime.js"></script>`;
  }

  return `<!doctype html>
<html lang="${escape(site.lang || "en")}">
<head>
<meta charset="utf-8">
${csp ? `<meta http-equiv="Content-Security-Policy" content="${escape(csp)}">\n` : ""}<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
${page.description ? `<meta name="description" content="${escape(page.description)}">\n` : ""}<link rel="icon" href="${escape(icon)}">
${extras}${baseCss}
<style>${themeCss(site)}</style>
${siteCss}${parts.css ? `<style>\n${safeCss(parts.css)}\n</style>\n` : ""}</head>
<body>
${parts.body}
${scripts}
${siteJs}</body>
</html>
`;
}

export function publicUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}
