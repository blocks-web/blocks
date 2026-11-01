import { html, inline, raw, url } from "../core/html.js";

// Address cards: a small label, the name, the address line by line, the opening hours, the phone
// number, a few tags and a link to the map. For a café with one place or a chain with ten.
const COLUMNS = ["1", "2"];

// The map pin icon, in the style of the Blocks icons (a 1.75 line, no fill).
const PIN = raw(
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.5"/></svg>',
);

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add a place in the panel on the right." },
  ro: { empty: "Adaugă un loc din panoul din dreapta." },
};

// "12 Linden Street\nNext to the park" → its non-empty lines (shown with <br> between them).
function lines(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// "(555) 010-0123" → "tel:5550100123"; no digits → "" (it stays plain text).
function phoneHref(phone) {
  const number = String(phone ?? "").replace(/[^\d+]/g, "");
  return number ? `tel:${number}` : "";
}

export default {
  name: "Address",
  category: "Contact",
  icon: "locations",
  description: "Your address, opening hours, phone number and a map link on a card, for one place or several.",
  tip: "Write the address on two lines (“12 Linden Street” / “next to the park”); on a phone, people can tap the number to call, and for the map itself you can put a Map block under it.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "Where to find us", help: "Optional." },
    columns: {
      type: "choice",
      label: "Cards per row",
      options: [
        { value: "1", label: "1" },
        { value: "2", label: "2" },
      ],
      default: "1",
    },
    mapText: { type: "text", label: "Map link text", default: "View on the map", help: "The text of the map link, on every address." },
    places: {
      type: "list",
      label: "Places",
      fields: {
        label: { type: "text", label: "Label", default: "", help: "Optional, for example “Downtown”." },
        name: { type: "text", label: "Name", default: "New place" },
        address: { type: "longtext", label: "Address", default: "", help: "Write it on as many lines as you need; it shows the same way on the site." },
        hours: { type: "text", label: "Opening hours", default: "", help: "Optional." },
        phone: { type: "text", label: "Phone", default: "", help: "Optional. People can tap it to call from their phone." },
        tags: { type: "text", label: "Tags", default: "", help: "Optional, separated by commas: “Terrace, Wi-Fi”." },
        mapLink: { type: "link", label: "Map link", default: "", help: "Optional. It opens in a new tab." },
      },
      default: [
        {
          label: "Downtown",
          name: "Luna Café",
          address: "12 Linden Street\nNext to the park downtown",
          hours: "Mon–Fri 8 am–8 pm · Sat 9 am–8 pm · Sun 9 am–6 pm",
          phone: "(555) 010-0123",
          tags: "Terrace, Free Wi-Fi, Outlets at the tables",
          mapLink: "https://www.google.com/maps/search/?api=1&query=12+Linden+Street",
        },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Adresă",
      category: "Contact",
      description: "Adresa, programul, telefonul și un link spre hartă, pe un card; unul sau mai multe locuri.",
      tip: "Scrie adresa pe două rânduri („Strada Teilor 12” / „lângă parc”); pe telefon, numărul se poate apăsa ca să suni, iar pentru harta propriu-zisă poți pune sub el blocul Hartă.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        columns: { label: "Carduri pe rând" },
        mapText: { label: "Text link hartă", help: "Textul linkului spre hartă, la fiecare adresă." },
        places: {
          label: "Locuri",
          fields: {
            label: { label: "Etichetă", help: "Opțional, de exemplu „Iași · Centru”." },
            name: { label: "Nume" },
            address: { label: "Adresă", help: "Scrie-o pe câte rânduri ai nevoie; pe site apare la fel." },
            hours: { label: "Program", help: "Opțional." },
            phone: { label: "Telefon", help: "Opțional. Devine link apăsabil pe telefon." },
            tags: { label: "Etichete", help: "Opțional, despărțite prin virgulă: „Terasă, Wi-Fi”." },
            mapLink: { label: "Link spre hartă", help: "Opțional. Se deschide într-o filă nouă." },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const columns = COLUMNS.includes(String(p.columns)) ? String(p.columns) : "1";
    const places = p.places.filter((l) => l.name || l.address);
    if (!places.length && ctx.mode !== "editor") return "";

    const card = (l) => {
      const address = lines(l.address);
      const tel = phoneHref(l.phone);
      const tags = String(l.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      return html`<li class="locations__card">
        <span class="locations__pin">${PIN}</span>
        <div class="locations__body">
          ${l.label ? html`<span class="locations__label">${l.label}</span>` : ""}
          ${l.name ? html`<h3 class="locations__name">${l.name}</h3>` : ""}
          ${address.length ? html`<p class="locations__address">${address.map((line, i) => (i ? [raw("<br>"), inline(line)] : inline(line)))}</p>` : ""}
          ${l.hours ? html`<p class="locations__hours">${l.hours}</p>` : ""}
          ${l.phone ? html`<p class="locations__phone">${tel ? html`<a href="${tel}">${l.phone}</a>` : l.phone}</p>` : ""}
          ${tags.length ? html`<ul class="locations__tags">${tags.map((t) => html`<li>${t}</li>`)}</ul>` : ""}
          ${l.mapLink && p.mapText
            ? html`<a class="locations__map" href="${url(l.mapLink)}" target="_blank" rel="noopener">${p.mapText}<span aria-hidden="true"> ↗</span></a>`
            : ""}
        </div>
      </li>`;
    };

    return html`<div class="b-block locations">
      <div class="b-container">
        ${p.title ? html`<h2 class="locations__heading">${inline(p.title)}</h2>` : ""}
        ${places.length
          ? html`<ul class="locations__grid locations__grid--${columns}">${places.map(card)}</ul>`
          : html`<p class="locations__empty">${words.empty}</p>`}
      </div>
    </div>`;
  },

  css: `
    .locations { align-self: stretch; }
    .locations__heading { margin-bottom: 1.25rem; }
    .locations__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem;
      list-style: none; margin: 0; padding: 0; text-align: left; }
    .locations__grid--1 { grid-template-columns: minmax(0, 1fr); }
    .locations__card { display: flex; gap: 1.1rem; padding: 1.35rem 1.4rem 1.5rem; color: var(--text); background: var(--surface);
      border: 1px solid color-mix(in srgb, var(--text) 9%, transparent); border-radius: var(--radius); }
    .locations__pin { display: grid; place-items: center; flex: none; width: 2.75rem; height: 2.75rem;
      border-radius: calc(var(--radius) * 0.7); background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); }
    .locations__body { display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; }
    .locations__body p { margin: 0; }
    .locations__label { font-size: 0.8rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
      color: color-mix(in srgb, var(--text) 60%, transparent); }
    .locations__name { margin: 0; font-size: 1.2rem; }
    .locations__address { line-height: 1.5; }
    .locations__hours, .locations__phone { font-size: 0.95rem; color: color-mix(in srgb, var(--text) 75%, transparent); }
    .locations__phone a { color: inherit; text-decoration-color: color-mix(in srgb, var(--text) 30%, transparent); }
    .locations__phone a:hover { color: var(--primary); }
    .locations__tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.25rem 0 0; padding: 0; list-style: none; }
    .locations__tags li { padding: 0.15em 0.7em; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
      background: color-mix(in srgb, var(--primary) 10%, transparent); color: color-mix(in srgb, var(--primary) 80%, var(--text)); }
    .locations__map { align-self: flex-start; margin-top: 0.5rem; font-weight: 600; color: var(--primary); text-decoration: none; }
    .locations__map:hover { text-decoration: underline; }
    .locations__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 720px) {
      .locations__grid.locations__grid { grid-template-columns: minmax(0, 1fr); }
    }
    @container (max-width: 400px) {
      .locations__card { flex-direction: column; gap: 0.85rem; padding: 1.15rem 1.1rem 1.25rem; }
    }
  `,
};
