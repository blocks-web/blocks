// The editor's interface icons (the top bar, the panels, the selected block's bar on the canvas), drawn
// with lines (docs/DESIGN.md: 1.75 px on 24, no fill), so we don't depend on fonts or files. No DOM:
// ui.js, the canvas (canvas.js, in the iframe) and the tests use them. The blocks' icons are in block-icons.js.

export const PATHS = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  desktop: '<rect x="2.5" y="3.5" width="19" height="13" rx="2.5"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  tablet: '<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M11 18h2"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5"/>',
  external: '<path d="M15 3.5h5.5V9"/><path d="M10 14 20.5 3.5"/><path d="M18 13v5.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3.5 6h17"/><path d="M8.5 6V4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V6"/><path d="M18.5 6 17.6 19a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6"/><path d="M10 10.5v6M14 10.5v6"/>',
  duplicate: '<rect x="9" y="9" width="11.5" height="11.5" rx="2.5"/><path d="M5.5 15H4.5a1.5 1.5 0 0 1-1.5-1.5V4.5A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v1"/>',
  up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  down: '<path d="M12 5v14M18.5 12.5 12 19l-6.5-6.5"/>',
  parent: '<path d="M14 9 9 4 4 9"/><path d="M20 20h-7a4 4 0 0 1-4-4V4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 16.5 9 4.5 9-4.5"/><path d="m3 12 9 4.5 9-4.5"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  page: '<path d="M14 3H6.5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.5z"/><path d="M14 3v5.5h5.5"/>',
  header: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9h17"/>',
  footer: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 15h17"/>',
  upload: '<path d="M20.5 15v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V15"/><path d="m16.5 8-4.5-4.5L7.5 8"/><path d="M12 3.5V15"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.75"/><path d="m20.5 15.5-4.5-4.5-8 8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="2.5"/>',
  slot: '<path d="M4.5 4v8a4 4 0 0 0 4 4h11"/><path d="m16 12.5 3.5 3.5-3.5 3.5"/>',
  click: '<path d="M9 9l5 12 1.8-5.2L21 14z"/><path d="M7.2 2.2 8 5.1M5.1 8 2.2 7.2M14 4.1 12 6.2M6.2 12l-2.1 2"/>',
  code: '<path d="m15 7 5 5-5 5M9 7l-5 5 5 5"/>',
  bold: '<path d="M7 4.5h6a3.5 3.5 0 0 1 0 7H7zM7 11.5h7a4 4 0 0 1 0 8H7z"/>',
  italic: '<path d="M10 4.5h8M6 19.5h8M14 4.5l-4 15"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  // Free canvas: the cell's shapes and the layers (a block with an arrow: it goes on top or underneath).
  rect: '<rect x="4" y="5.5" width="16" height="13" rx=".5"/>',
  rounded: '<rect x="4" y="5.5" width="16" height="13" rx="4.5"/>',
  circle: '<circle cx="12" cy="12" r="7.5"/>',
  "move-out": '<rect x="4" y="3.5" width="16" height="10" rx="2.5"/><path d="M12 8v12.5M8.5 17l3.5 3.5 3.5-3.5"/>',
  front: '<rect x="3" y="8.5" width="10.5" height="12" rx="2.5"/><path d="M17.5 15.5v-12M14 7l3.5-3.5L21 7"/>',
  back: '<rect x="3" y="3.5" width="10.5" height="12" rx="2.5"/><path d="M17.5 8.5v12M14 17l3.5 3.5L21 17"/>',
};

// The icon as SVG text (for innerHTML); without `size`, CSS gives the size.
export function svgUi(name, size = null) {
  const d = Object.hasOwn(PATHS, name) ? PATHS[name] : "";
  const dims = size ? ` width="${size}" height="${size}"` : "";
  return `<svg viewBox="0 0 24 24"${dims} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
