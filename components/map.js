import { html, raw } from "../core/html.js";

// Your place, by its address. By default: the address and a "View on the map" link (nothing loads from
// another site). With "Show the map on the page" on, the Google map shows in the page (in the editor, only
// a placeholder, as with Video).
const ZOOMS = { street: 16, neighborhood: 14, city: 12 };
const HEIGHTS = ["small", "medium", "large"];

// The map pin icon, in the style of the Blocks icons (a 1.75 line, no fill).
const PIN = raw(
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.5"/></svg>',
);

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Write the address in the panel on the right.", placeholder: "Google map", title: "Map" },
  ro: { empty: "Scrie adresa în panoul din dreapta.", placeholder: "Hartă Google", title: "Hartă" },
};

export default {
  name: "Map",
  category: "Contact",
  icon: "map",
  description: "Your place, by its address: a link to Google Maps or, if you like, the map right on the page.",
  tip: "Write the address with the street number and the town; with the map on, the editor shows a placeholder and the real map appears on the site, as with Video.",

  props: {
    address: { type: "text", label: "Address", default: "12 Linden Street" },
    linkText: { type: "text", label: "Link text", default: "View on the map", help: "It opens in Google Maps, in a new tab." },
    showMap: {
      type: "checkbox",
      label: "Show the map on the page",
      default: false,
      help: "The map is loaded from Google when visitors open the page.",
    },
    zoom: {
      type: "choice",
      label: "Zoom",
      options: [
        { value: "street", label: "Street" },
        { value: "neighborhood", label: "Neighborhood" },
        { value: "city", label: "City" },
      ],
      default: "street",
    },
    height: {
      type: "choice",
      label: "Height",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
      default: "medium",
    },
  },

  i18n: {
    ro: {
      name: "Hartă",
      category: "Contact",
      description: "Locul tău, după adresă: un link spre Google Maps sau, dacă vrei, harta chiar în pagină.",
      tip: "Scrie adresa cu oraș și număr („Strada Teilor 12, Iași”); cu harta pornită, în editor vezi un loc rezervat, iar harta apare pe site, ca la Video.",
      props: {
        address: { label: "Adresă" },
        linkText: { label: "Text link", help: "Se deschide în Google Maps, într-o filă nouă." },
        showMap: { label: "Arată harta pe pagină", help: "Harta se încarcă de la Google când vizitatorii deschid pagina." },
        zoom: { label: "Apropiere", options: { street: "Stradă", neighborhood: "Cartier", city: "Oraș" } },
        height: { label: "Înălțime", options: { small: "Mică", medium: "Medie", large: "Mare" } },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const editor = ctx.mode === "editor";
    const address = String(p.address ?? "").trim();
    if (!address) {
      return editor ? html`<div class="b-block map"><div class="b-container"><p class="map__empty">${words.empty}</p></div></div>` : "";
    }
    const zoom = Object.hasOwn(ZOOMS, p.zoom) ? ZOOMS[p.zoom] : ZOOMS.street;
    const height = HEIGHTS.includes(p.height) ? p.height : "medium";
    const search = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    const link = p.linkText
      ? html`<a class="map__link" href="${search}" target="_blank" rel="noopener">${p.linkText}<span aria-hidden="true"> ↗</span></a>`
      : "";

    // The Google map only for a real tick: the text "false" in a hand-written file doesn't turn it on.
    if (p.showMap !== true) {
      return html`<div class="b-block map">
        <div class="b-container">
          <div class="map__card">
            <span class="map__pin">${PIN}</span>
            <div class="map__body">
              <p class="map__address">${address}</p>
              ${link}
            </div>
          </div>
        </div>
      </div>`;
    }

    // No iframe in the editor: it would swallow the mouse and you couldn't move the block any more.
    const content = editor
      ? html`<div class="map__placeholder"><span class="map__pin">${PIN}</span><strong>${words.placeholder}</strong><span>${address}</span></div>`
      : html`<iframe class="map__iframe" src="https://www.google.com/maps?q=${encodeURIComponent(address)}&z=${zoom}&output=embed" title="${words.title}: ${address}"
          loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
    return html`<div class="b-block map">
      <div class="b-container">
        <div class="map__frame map__frame--${height}">${content}</div>
        ${link ? html`<p class="map__below">${link}</p>` : ""}
      </div>
    </div>`;
  },

  css: `
    .map { align-self: stretch; }
    .map__card { display: flex; align-items: center; gap: 1.1rem; max-width: 560px; padding: 1.25rem 1.4rem; color: var(--text);
      background: var(--surface); border: 1px solid color-mix(in srgb, var(--text) 9%, transparent); border-radius: var(--radius); text-align: left; }
    .map__pin { display: grid; place-items: center; flex: none; width: 2.75rem; height: 2.75rem;
      border-radius: calc(var(--radius) * 0.7); background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); }
    .map__body { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
    .map__address { margin: 0; font-weight: 600; }
    .map__link { font-weight: 600; color: var(--primary); text-decoration: none; }
    .map__link:hover { text-decoration: underline; }
    .map__link:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent); outline-offset: 3px; border-radius: 4px; }
    .map__frame { position: relative; height: 320px; overflow: hidden; border-radius: var(--radius); background: var(--surface); }
    .map__frame--small { height: 220px; }
    .map__frame--large { height: 460px; }
    .map__iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    .map__placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem;
      padding: 1rem; text-align: center; color: var(--text); border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent); border-radius: var(--radius); }
    .map__placeholder span:last-child { opacity: 0.8; font-size: 0.95rem; max-width: 40ch; }
    .map__below { margin: 0.75rem 0 0; }
    .map__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 480px) {
      .map__frame { height: 260px; }
      .map__frame--small { height: 200px; }
      .map__frame--large { height: 340px; }
    }
  `,
};
