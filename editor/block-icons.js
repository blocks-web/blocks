// The blocks' icons, by name (docs/DESIGN.md → "Icons"): a 1.75 px line on a 24 square, no fill.
// A component sets `icon: "text"`; any other value (an emoji, a character) shows as text, in the same
// rounded tile.
//
//   tile("text")               → <span class="tile"> with the SVG
//   tile("🧱")                 → <span class="tile"> with the emoji
//   tile("pizza")              → an unknown name (misspelled or not drawn yet): the "block" icon
//   tile("text", "tile--small") → the small version (Structure)

// The same hand: the large outlines sit between 3 and 21 (circles have a radius of 8.5–9), the
// drawing's center is at (12, 12), corners are rounded by 1.25–3, and dots are 0.01 lines.
const ICONS = {
  text: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  heading: '<path d="M5 5.5h14M12 5.5v13M8.5 18.5h7"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.75"/><path d="m20.5 15.5-4.5-4.5-8 8"/>',
  gallery: '<rect x="3.5" y="7.5" width="14" height="12" rx="2.5"/><path d="M7.5 7.5V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9"/><circle cx="8" cy="11.5" r="1.5"/><path d="m17.5 16-3.5-3.5-5.5 5.5"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10.5 9 4.5 3-4.5 3z"/>',
  button: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8 12h8"/>',
  cards: '<rect x="3" y="5" width="8" height="14" rx="2"/><rect x="13" y="5" width="8" height="14" rx="2"/><path d="M5.5 14.5h3M15.5 14.5h3"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M12 4v16"/>',
  section: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><rect x="7" y="8.5" width="10" height="7" rx="1.5" stroke-dasharray="2.5 2.2"/>',
  spacer: '<path d="M4 4h16M4 20h16M12 8v8M9.5 10.5 12 8l2.5 2.5M9.5 13.5 12 16l2.5-2.5"/>',
  navbar: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  footer: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 15h18M7 17.5h4"/>',
  hero: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9.5h10M7 12.5h6"/><rect x="7" y="15" width="5" height="2" rx="1"/>',
  faq: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.7M12 17h.01"/>',
  // Closing quotes ”: two rounded boxes, each with a tail going down.
  quote: '<path d="M10 11H6a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 6 5.5h2.5A1.5 1.5 0 0 1 10 7v5.5c0 3-1.5 5-4.5 6"/><path d="M19.5 11h-4A1.5 1.5 0 0 1 14 9.5V7a1.5 1.5 0 0 1 1.5-1.5H18A1.5 1.5 0 0 1 19.5 7v5.5c0 3-1.5 5-4.5 6"/>',
  form: '<rect x="4" y="3.5" width="16" height="5" rx="1.5"/><rect x="4" y="11" width="16" height="5" rx="1.5"/><path d="M4 20h7"/>',
  // Logging in: a door with an arrow going in.
  login: '<path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M4 12h11M11 8l4 4-4 4"/>',
  signup: '<circle cx="9.5" cy="8" r="3.5"/><path d="M3 20a6.5 6.5 0 0 1 13 0M18 8v6M15 11h6"/>',
  account: '<circle cx="12" cy="8" r="3.75"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  members: '<circle cx="9" cy="8" r="3.25"/><path d="M3 20a6 6 0 0 1 12 0M16 4.6a3.25 3.25 0 0 1 0 6.8M21 20a6 6 0 0 0-4-5.6"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  code: '<path d="m15 7 5 5-5 5M9 7l-5 5 5 5"/>',
  block: '<rect x="3.5" y="12.5" width="8" height="8" rx="2"/><rect x="12.5" y="12.5" width="8" height="8" rx="2"/><rect x="8" y="3.5" width="8" height="8" rx="2"/>',
  // The generic blocks: the digits "1 2 3", a timeline with nodes, a heading over two different
  // logos (a circle and a square), a newspaper, a pin on a map.
  stats: '<path d="M4 9.75 6 8v8"/><path d="M8.5 9.75a2.25 2.25 0 1 1 3.84 1.59L8.5 16H13"/><path d="M15.5 8H20l-2.5 3.5h.25a2.25 2.25 0 1 1-1.59 3.84"/>',
  timeline: '<circle cx="6" cy="5.5" r="1.75"/><circle cx="6" cy="12" r="1.75"/><circle cx="6" cy="18.5" r="1.75"/><path d="M6 7.25v3M6 13.75v3M11.5 5.5H20M11.5 12H20M11.5 18.5h5.5"/>',
  logos: '<path d="M9 6h6"/><circle cx="7" cy="14.5" r="3.5"/><rect x="13.5" y="11" width="7" height="7" rx="1.75"/>',
  press: '<path d="M5 20h13.5a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 18.5 4h-9A2.5 2.5 0 0 0 7 6.5V18a2 2 0 0 1-4 0v-7.5A1.5 1.5 0 0 1 4.5 9H7"/><rect x="10" y="7.5" width="8" height="4.5" rx="1"/><path d="M10 15h8M10 17.5h4.5"/>',
  locations: '<path d="M12 20.5c-3.5-4.5-6.25-8-6.25-10.5a6.25 6.25 0 0 1 12.5 0c0 2.5-2.75 6-6.25 10.5z"/><circle cx="12" cy="10" r="2.25"/>',
  // The newer blocks: a price tag with a hole, a clock with its hands at 8, a card with a portrait
  // (so it doesn't look like "members", the two figures), a calendar with a dot, a megaphone, a
  // rectangle with a small mountain and three lines, a map folded in three with a dot, three linked
  // circles. (List uses the "list" icon above.)
  pricing: '<path d="M12.5 3.5h6a1.5 1.5 0 0 1 1.5 1.5v6L11.5 19.5a2 2 0 0 1-2.8 0L4.5 15.3a2 2 0 0 1 0-2.8z"/><circle cx="15.5" cy="8.5" r="1.5"/>',
  hours: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l-3 2.25"/>',
  team: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><circle cx="12" cy="10" r="2.75"/><path d="M8 17a4 4 0 0 1 8 0"/>',
  events: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.25"/>',
  cta: '<path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H8l8 4V5l-8 4H5.5A1.5 1.5 0 0 0 4 10.5z"/><path d="M8 15v4.5M19.5 10.5a2 2 0 0 1 0 3"/>',
  "image-text": '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m5.5 15.5 2.5-3 2.5 3"/><circle cx="7" cy="9" r="1"/><path d="M13.5 9h4.5M13.5 12h4.5M13.5 15h3"/>',
  map: '<path d="m3.5 7 5.5-2.5 6 2.5 5.5-2.5v13L15 20l-6-2.5L3.5 20z"/><path d="M9 4.5v13M15 7v13"/><circle cx="12" cy="11" r="1.25"/>',
  social: '<circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="m8.8 10.9 6.4-3.3M8.8 13.1l6.4 3.3"/>',
  // Free canvas: a sheet with two cells placed freely, one over the corner of the other (which
  // shows only halfway, like a layer underneath).
  canvas: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M10.5 13H7.25A1.25 1.25 0 0 1 6 11.75v-3.5A1.25 1.25 0 0 1 7.25 7h5A1.25 1.25 0 0 1 13.5 8.25v2.25"/><rect x="10.5" y="10.5" width="7.5" height="6" rx="1.25"/>',
};

export const ICON_NAMES = Object.keys(ICONS);

export const isIcon = (name) => Object.prototype.hasOwnProperty.call(ICONS, String(name));

// The SVG of a known icon (as text), or null.
export function iconSvg(name, size = 20) {
  if (!isIcon(name)) return null;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// What the tile draws: the icon with this name; for a word that isn't an icon ("pizza", a misspelled
// name) the generic "block" icon, not its text spilling out of the tile. An emoji or a character
// return null: they show as text.
export function svgFor(icon, size = 20) {
  const name = String(icon ?? "").trim();
  return iconSvg(name, size) || (/^[a-z][a-z0-9-]{2,}$/i.test(name) ? iconSvg("block", size) : null);
}

// The rounded tile with the block's icon. `extra`: more classes (e.g. "tile--small").
export function tile(icon, extra = "") {
  const span = document.createElement("span");
  span.className = `tile ${extra}`.trim();
  span.setAttribute("aria-hidden", "true");
  const name = String(icon ?? "").trim();
  const svg = svgFor(name, extra.includes("tile--small") ? 16 : 20);
  if (svg) span.innerHTML = svg;
  else {
    span.classList.add("tile--text");
    span.textContent = name || "▢";
  }
  return span;
}
