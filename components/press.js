import { html, formatDate, inline, paragraphs, raw, url } from "../core/html.js";

// What newspapers and blogs have written: the source, the date and an excerpt, on cards. With a
// link, the whole card can be clicked.
const COLUMNS = ["2", "3"];
const EXTERNAL = /^(https?:)?\/\//i;

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add articles in the panel on the right." },
  ro: { empty: "Adaugă articole din panoul din dreapta." },
};

export default {
  name: "Press",
  category: "Lists",
  icon: "press",
  description: "What newspapers and blogs have written about you: the source, the date and an excerpt.",
  tip: "Quote one sentence, not a whole paragraph, and add the link to the article; without a link, the card stays plain text.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "In the press", help: "Optional." },
    subtitle: { type: "longtext", label: "Subtitle", default: "" },
    columns: {
      type: "choice",
      label: "Cards per row",
      options: [
        { value: "2", label: "2" },
        { value: "3", label: "3" },
      ],
      default: "3",
    },
    newestFirst: { type: "checkbox", label: "Newest first", default: true },
    articles: {
      type: "list",
      label: "Articles",
      fields: {
        source: { type: "text", label: "Source", default: "Local paper", help: "The publication's name. With a link, the whole card leads there." },
        date: { type: "date", label: "Date", default: "" },
        text: { type: "longtext", label: "Excerpt", default: "" },
        link: { type: "link", label: "Link", default: "", help: "Optional. A link to another site opens in a new tab." },
      },
      default: [
        {
          source: "The Neighborhood Gazette",
          date: "2026-03-14",
          text: "The best carrot cake in town comes from a 12-seat café on Linden Street.",
          link: "https://example.com/gazette/luna-cafe",
        },
        {
          source: "The “Coffee Break” blog",
          date: "2025-11-02",
          text: "Luna is the kind of place where the barista remembers what you drink. The V60 with the beans of the week: jasmine and peach, just as promised.",
          link: "https://example.com/blog/luna-cafe",
        },
        {
          source: "Morning Radio",
          date: "2025-06-21",
          text: "A report from the flower terrace: how one espresso machine and three tables grew into a café with its own roaster.",
          link: "",
        },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Presă",
      category: "Liste",
      description: "Ce au scris ziarele și blogurile despre tine: sursa, data și un fragment.",
      tip: "Citează o propoziție, nu un paragraf, și pune linkul spre articol; fără link, cardul rămâne text simplu.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        subtitle: { label: "Subtitlu" },
        columns: { label: "Carduri pe rând" },
        newestFirst: { label: "Cele mai noi primele" },
        articles: {
          label: "Articole",
          fields: {
            source: { label: "Sursă", help: "Numele publicației. Cu un link, tot cardul duce acolo." },
            date: { label: "Dată" },
            text: { label: "Fragment" },
            link: { label: "Link", help: "Opțional. Un link spre alt site se deschide într-o filă nouă." },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const lang = ctx.site?.lang === "ro" ? "ro" : "en";
    const columns = COLUMNS.includes(String(p.columns)) ? String(p.columns) : "3";
    const articles = p.articles.filter((a) => a.source || a.text);
    if (!articles.length && ctx.mode !== "editor") return "";
    // The date is "YYYY-MM-DD", so alphabetical order is also time order. Articles without a valid date go last.
    const key = (a) => (formatDate(a.date) ? String(a.date).trim() : "");
    if (p.newestFirst) articles.sort((a, b) => key(b).localeCompare(key(a)));

    const article = (a) => {
      const day = String(a.date ?? "").trim();
      const shown = formatDate(day, lang);
      const address = url(a.link);
      const external = EXTERNAL.test(address);
      // The link sits on the source's name; through CSS it covers the whole card.
      const source =
        a.link && a.source
          ? html`<a class="press__link" href="${address}"${external ? raw(' target="_blank" rel="noopener"') : ""}>${a.source}${external ? html`<span class="press__arrow" aria-hidden="true"> ↗</span>` : ""}</a>`
          : a.source;
      return html`<li class="press__card">
        <div class="press__top">
          ${a.source ? html`<span class="press__source">${source}</span>` : ""}
          ${shown ? html`<time class="press__date" datetime="${day}">${shown}</time>` : ""}
        </div>
        ${a.text ? html`<div class="press__text">${paragraphs(a.text)}</div>` : ""}
      </li>`;
    };

    return html`<div class="b-block press">
      <div class="b-container">
        ${p.title || p.subtitle
          ? html`<div class="press__intro">
              ${p.title ? html`<h2>${inline(p.title)}</h2>` : ""}
              ${paragraphs(p.subtitle)}
            </div>`
          : ""}
        ${articles.length
          ? html`<ul class="press__grid press__grid--${columns}">${articles.map(article)}</ul>`
          : html`<p class="press__empty">${WORDS[lang].empty}</p>`}
      </div>
    </div>`;
  },

  css: `
    .press { align-self: stretch; }
    .press__intro { max-width: 60ch; margin: 0 auto 2rem; text-align: center; }
    .press__intro > :last-child { margin-bottom: 0; }
    .press__intro p { opacity: 0.85; font-size: 1.1rem; }
    .press__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem;
      list-style: none; margin: 0; padding: 0; text-align: left; }
    .press__grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .press__card { position: relative; display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem 1.35rem 1.4rem;
      color: var(--text); background: var(--surface); border: 1px solid color-mix(in srgb, var(--text) 9%, transparent);
      border-radius: var(--radius); transition: border-color 0.15s ease-out, transform 0.15s ease-out; }
    .press__card:has(.press__link):hover { border-color: color-mix(in srgb, var(--primary) 45%, transparent); transform: translateY(-2px); }
    .press__top { display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; }
    .press__source { font-weight: 700; }
    .press__link { color: inherit; text-decoration: none; }
    .press__link:hover { color: var(--primary); }
    /* The link covers the whole card; the focus ring shows on the card. */
    .press__link::after { content: ""; position: absolute; inset: 0; border-radius: var(--radius); }
    .press__link:focus-visible { outline: none; }
    .press__link:focus-visible::after { outline: 3px solid color-mix(in srgb, var(--primary) 60%, transparent); outline-offset: 2px; }
    .press__arrow { font-size: 0.85em; opacity: 0.7; }
    .press__date { font-size: 0.9rem; font-variant-numeric: tabular-nums; color: color-mix(in srgb, var(--text) 65%, transparent); }
    .press__text { line-height: 1.55; }
    .press__text p { margin-bottom: 0.75em; }
    .press__text > :last-child { margin-bottom: 0; }
    /* A link written in the excerpt stays clickable, above the one that covers the card. */
    .press__text a { position: relative; z-index: 1; }
    .press__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 960px) {
      .press__grid--3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @container (max-width: 560px) {
      .press__grid.press__grid { grid-template-columns: minmax(0, 1fr); }
    }
    @media (prefers-reduced-motion: reduce) {
      .press__card { transition: none; }
      .press__card:has(.press__link):hover { transform: none; }
    }
  `,
};
