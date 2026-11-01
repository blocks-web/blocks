import { html, inline, raw } from "../core/html.js";

// A short list with checkmarks, bullets or numbers: what's included, amenities, the steps of an order.
const STYLES = ["checks", "bullets", "numbers"];
const COLUMNS = ["1", "2"];

// The checkmark, in the style of the Blocks icons (a 1.75 line, no fill).
const CHECK = raw(
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
);

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add items in the panel on the right." },
  ro: { empty: "Adaugă elemente din panoul din dreapta." },
};

export default {
  name: "List",
  category: "Text & images",
  icon: "list",
  description: "A short list with checkmarks, bullets or numbers: what's included, amenities, the steps of an order.",
  tip: "One line per item, with no period at the end; in two columns, up to ten items fit without looking long.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "What we offer", help: "Optional." },
    style: {
      type: "choice",
      label: "Style",
      options: [
        { value: "checks", label: "Checkmarks" },
        { value: "bullets", label: "Bullets" },
        { value: "numbers", label: "Numbers" },
      ],
      default: "checks",
    },
    columns: {
      type: "choice",
      label: "Columns",
      options: [
        { value: "1", label: "1" },
        { value: "2", label: "2" },
      ],
      default: "1",
    },
    items: {
      type: "list",
      label: "Items",
      fields: {
        text: { type: "text", format: true, label: "Text", default: "New item" },
      },
      default: [
        { text: "Free Wi-Fi and outlets at the tables" },
        { text: "Plant-based milk at no extra cost" },
        { text: "A terrace that's open from April to October" },
        { text: "Freshly roasted beans to take home" },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Listă",
      category: "Text și imagini",
      description: "O listă scurtă cu bife, puncte sau numere: ce include, dotări, pașii unei comenzi.",
      tip: "Un rând pe element, fără punct la final; pe două coloane încap până la zece elemente fără să pară lungă.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        style: { label: "Stil", options: { checks: "Bife", bullets: "Puncte", numbers: "Numere" } },
        columns: { label: "Coloane" },
        items: {
          label: "Elemente",
          fields: {
            text: { label: "Text" },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const style = STYLES.includes(p.style) ? p.style : "checks";
    const columns = COLUMNS.includes(String(p.columns)) ? String(p.columns) : "1";
    const items = p.items.filter((i) => i.text);
    if (!items.length && ctx.mode !== "editor") return "";
    const item = (i) => html`<li class="list__item">${style === "checks" ? html`<span class="list__check">${CHECK}</span>` : ""}<span>${inline(i.text)}</span></li>`;
    const classes = `list__items list__items--${style} list__items--${columns}`;
    return html`<div class="b-block list">
      <div class="b-container">
        <div class="list__inner">
          ${p.title ? html`<h2 class="list__title">${inline(p.title)}</h2>` : ""}
          ${!items.length
            ? html`<p class="list__empty">${words.empty}</p>`
            : style === "numbers"
              ? html`<ol class="${classes}">${items.map(item)}</ol>`
              : html`<ul class="${classes}">${items.map(item)}</ul>`}
        </div>
      </div>
    </div>`;
  },

  css: `
    .list { align-self: stretch; }
    .list__inner { max-width: 70ch; text-align: left; }
    .list__title { margin-bottom: 0.75rem; }
    .list__items { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.5rem 2rem; margin: 0; padding: 0; }
    .list__items--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .list__item { display: flex; align-items: flex-start; gap: 0.6rem; line-height: 1.5; }
    /* Checkmarks: our icon, without the browser's marker. */
    .list__items--checks { list-style: none; }
    .list__check { display: grid; place-items: center; flex: none; width: 1.5rem; height: 1.5rem; margin-top: 0.05rem; border-radius: 50%;
      background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); }
    /* Bullets and numbers: the browser's markers, in color. */
    .list__items--bullets { list-style: disc; padding-left: 1.25rem; }
    .list__items--numbers { list-style: decimal; padding-left: 1.5rem; }
    .list__items--bullets .list__item, .list__items--numbers .list__item { display: list-item; padding-left: 0.25rem; }
    .list__items--bullets .list__item::marker, .list__items--numbers .list__item::marker { color: var(--primary); font-weight: 700; }
    .list__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 560px) {
      .list__items.list__items { grid-template-columns: minmax(0, 1fr); }
    }
  `,
};
