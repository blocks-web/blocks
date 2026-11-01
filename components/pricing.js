import { html, inline, paragraphs } from "../core/html.js";

// A menu or a price list: the name, a short description and the price, lined up on the right, with
// a dotted line between them. The price is free text (“from $50”, “free”), so there's no currency to set.
const STYLES = ["lines", "cards"];
const COLUMNS = ["1", "2"];

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add items in the panel on the right." },
  ro: { empty: "Adaugă produse din panoul din dreapta." },
};

export default {
  name: "Prices",
  category: "Lists",
  icon: "pricing",
  description: "A menu or a price list: a name, a short description and the price, lined up on the right.",
  tip: "Use one block per category (“Coffee”, “Food”), each with its own title; the price is free text, so you can also write “from $50” or “free”.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "Coffee", help: "Optional." },
    subtitle: { type: "longtext", label: "Subtitle", default: "" },
    style: {
      type: "choice",
      label: "Style",
      options: [
        { value: "lines", label: "Lines" },
        { value: "cards", label: "Cards" },
      ],
      default: "lines",
    },
    columns: {
      type: "choice",
      label: "Columns",
      options: [
        { value: "1", label: "1" },
        { value: "2", label: "2" },
      ],
      default: "2",
    },
    items: {
      type: "list",
      label: "Items",
      fields: {
        name: { type: "text", label: "Name", default: "New item" },
        description: { type: "longtext", label: "Description", default: "", help: "Optional, a line or two." },
        price: { type: "text", label: "Price", default: "", help: "Free text: “$3”, “from $50”, “free”." },
        tag: { type: "text", label: "Tag", default: "", help: "Optional, a small label: “New”, “Vegan”." },
      },
      default: [
        { name: "Espresso", description: "Short and intense, with notes of dark chocolate and caramel.", price: "$3.00", tag: "" },
        { name: "Cappuccino", description: "A double espresso with silky steamed milk, in a 6 oz cup.", price: "$4.50", tag: "" },
        { name: "Flat white", description: "More coffee, less foam.", price: "$4.75", tag: "House favorite" },
        { name: "Cold brew", description: "Steeped cold for 18 hours and served over ice.", price: "$5.00", tag: "New" },
        { name: "V60 pour-over", description: "Filter coffee brewed by hand, with the beans of the week.", price: "$4.25", tag: "" },
        { name: "Beans to take home", description: "A half-pound bag, whole or ground while you wait.", price: "$16.00", tag: "" },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Prețuri",
      category: "Liste",
      description: "Meniu sau listă de tarife: nume, o descriere scurtă și prețul, aliniat în dreapta.",
      tip: "Un bloc pentru fiecare categorie („Cafea”, „De mâncat”), cu titlul lui; prețul e text liber, deci poți scrie și „de la 50 lei” sau „gratuit”.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        subtitle: { label: "Subtitlu" },
        style: { label: "Stil", options: { lines: "Linii", cards: "Carduri" } },
        columns: { label: "Coloane" },
        items: {
          label: "Produse",
          fields: {
            name: { label: "Nume" },
            description: { label: "Descriere", help: "Opțional, un rând-două." },
            price: { label: "Preț", help: "Text liber: „9 lei”, „de la 50 lei”, „gratuit”." },
            tag: { label: "Etichetă", help: "Opțional, o etichetă mică: „Nou”, „Vegan”." },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const style = STYLES.includes(p.style) ? p.style : "lines";
    const columns = COLUMNS.includes(String(p.columns)) ? String(p.columns) : "2";
    const items = p.items.filter((x) => x.name || x.price);
    if (!items.length && ctx.mode !== "editor") return "";

    const item = (x) => html`<li class="pricing__item">
      <div class="pricing__row">
        <span class="pricing__name">${x.name}${x.tag ? html` <span class="pricing__tag">${x.tag}</span>` : ""}</span>
        <span class="pricing__dots" aria-hidden="true"></span>
        ${x.price ? html`<span class="pricing__price">${x.price}</span>` : ""}
      </div>
      ${x.description ? html`<div class="pricing__description">${paragraphs(x.description)}</div>` : ""}
    </li>`;

    return html`<div class="b-block pricing pricing--${style}">
      <div class="b-container">
        ${p.title || p.subtitle
          ? html`<div class="pricing__intro">
              ${p.title ? html`<h2>${inline(p.title)}</h2>` : ""}
              ${paragraphs(p.subtitle)}
            </div>`
          : ""}
        ${items.length
          ? html`<ul class="pricing__list pricing__list--${columns}">${items.map(item)}</ul>`
          : html`<p class="pricing__empty">${words.empty}</p>`}
      </div>
    </div>`;
  },

  css: `
    .pricing { align-self: stretch; }
    .pricing__intro { margin-bottom: 1.5rem; }
    .pricing__intro > :last-child { margin-bottom: 0; }
    .pricing__intro p { opacity: 0.85; }
    .pricing__list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 3rem; list-style: none; margin: 0; padding: 0; text-align: left; }
    .pricing__list--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pricing__item { padding-block: 0.9rem; border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent); }
    .pricing__row { display: flex; align-items: baseline; gap: 0.6rem; }
    .pricing__name { font-weight: 600; }
    .pricing__tag { display: inline-block; margin-left: 0.35rem; padding: 0.1em 0.6em; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
      vertical-align: 0.1em; background: color-mix(in srgb, var(--primary) 12%, transparent); color: color-mix(in srgb, var(--primary) 80%, var(--text)); }
    /* The dotted line fills the space between the name and the price. */
    .pricing__dots { flex: 1; min-width: 1.5rem; border-bottom: 2px dotted color-mix(in srgb, var(--text) 28%, transparent); transform: translateY(-0.3em); }
    .pricing__price { flex: none; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--primary); white-space: nowrap; }
    .pricing__description { margin-top: 0.25rem; font-size: 0.95rem; color: color-mix(in srgb, var(--text) 75%, transparent); }
    .pricing__description p { margin-bottom: 0.4em; }
    .pricing__description > :last-child { margin-bottom: 0; }
    /* Lines: the first row of each column starts without a line above it. */
    .pricing--lines .pricing__list--1 .pricing__item:first-child { border-top: 0; }
    .pricing--lines .pricing__list--2 .pricing__item:nth-child(-n + 2) { border-top: 0; }
    /* Cards: each item on a soft surface. */
    .pricing--cards .pricing__list { gap: 1rem; }
    .pricing--cards .pricing__item { padding: 1.1rem 1.25rem 1.2rem; background: var(--surface); border-radius: var(--radius);
      border: 1px solid color-mix(in srgb, var(--text) 9%, transparent); }
    .pricing__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 720px) {
      .pricing__list.pricing__list { grid-template-columns: minmax(0, 1fr); }
      .pricing--lines .pricing__list .pricing__item { border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent); }
      .pricing--lines .pricing__list .pricing__item:first-child { border-top: 0; }
    }
  `,
};
