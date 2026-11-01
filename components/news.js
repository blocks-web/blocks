import { html, formatDate, inline, paragraphs, url } from "../core/html.js";

// News or announcements with a date. The newest come first (this can be turned off in the settings).

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add news in the panel on the right." },
  ro: { empty: "Adaugă știri din panoul din dreapta." },
};

export default {
  name: "News",
  category: "Lists",
  icon: "calendar",
  description: "News or announcements with a date, a title and some text; the newest come first.",
  tip: "Give every item a date, or it ends up at the bottom. An item doesn't need a link: not every piece of news needs its own page.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "News", help: "Optional." },
    newestFirst: { type: "checkbox", label: "Newest first", default: true },
    items: {
      type: "list",
      label: "News items",
      fields: {
        date: { type: "date", label: "Date", default: "" },
        title: { type: "text", label: "Title", default: "New announcement" },
        text: { type: "longtext", label: "Text", default: "" },
        link: { type: "link", label: "Link", default: "", help: "Optional. The title links here." },
      },
      default: [
        {
          date: "2026-10-03",
          title: "New beans from Ethiopia",
          text: "This week we're roasting a new batch, with notes of jasmine and peach. Try it as filter coffee or take a bag home.",
          link: "",
        },
        {
          date: "2026-09-12",
          title: "Longer hours on Saturdays",
          text: "On Saturdays we're now open until 8 pm. The terrace stays open as long as the weather is nice.",
          link: "",
        },
        {
          date: "2026-08-20",
          title: "Coffee tasting on August 28",
          text: "An evening with three different beans and their stories. Seats are limited: write to us and we'll save you one.",
          link: "/contact",
        },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Știri",
      category: "Liste",
      description: "Noutăți sau anunțuri cu dată, titlu și text; cele mai noi apar primele.",
      tip: "Pune data la fiecare știre, altfel ajunge la final; o știre fără link e în regulă: nu orice noutate are nevoie de o pagină.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        newestFirst: { label: "Cele mai noi primele" },
        items: {
          label: "Știri",
          fields: {
            date: { label: "Dată" },
            title: { label: "Titlu" },
            text: { label: "Text" },
            link: { label: "Link", help: "Opțional. Titlul duce aici." },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const lang = ctx.site?.lang === "ro" ? "ro" : "en";
    const items = p.items.filter((s) => s.title || s.text);
    if (!items.length && ctx.mode !== "editor") return "";
    // The date is "YYYY-MM-DD", so alphabetical order is also time order. Items without a valid date go last.
    const key = (s) => (formatDate(s.date) ? String(s.date).trim() : "");
    if (p.newestFirst) items.sort((a, b) => key(b).localeCompare(key(a)));

    const item = (s) => {
      const day = String(s.date ?? "").trim();
      const shown = formatDate(day, lang);
      const title = s.link ? html`<a href="${url(s.link)}">${s.title}</a>` : s.title;
      return html`<li class="news__item">
        ${shown ? html`<time class="news__date" datetime="${day}">${shown}</time>` : html`<span class="news__date"></span>`}
        <div class="news__body">
          ${s.title ? html`<h3 class="news__title">${title}</h3>` : ""}
          ${paragraphs(s.text)}
        </div>
      </li>`;
    };

    return html`<div class="b-block news">
      <div class="b-container">
        <div class="news__inner">
          ${p.title ? html`<h2 class="news__heading">${inline(p.title)}</h2>` : ""}
          ${items.length
            ? html`<ol class="news__list">${items.map(item)}</ol>`
            : html`<p class="news__empty">${WORDS[lang].empty}</p>`}
        </div>
      </div>
    </div>`;
  },

  css: `
    .news { align-self: stretch; }
    .news__inner { max-width: 760px; margin-inline: auto; text-align: left; }
    .news__heading { margin-bottom: 0.5rem; }
    .news__list { list-style: none; margin: 0; padding: 0; }
    .news__item { display: grid; grid-template-columns: 9.5rem minmax(0, 1fr); gap: 0.35rem 1.5rem; padding-block: 1.25rem;
      border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent); }
    .news__item:first-child { border-top: 0; }
    .news__date { padding-top: 0.2rem; font-size: 0.9rem; font-variant-numeric: tabular-nums;
      color: color-mix(in srgb, var(--text) 65%, transparent); }
    .news__body > :last-child { margin-bottom: 0; }
    .news__title { margin-bottom: 0.3em; font-size: 1.15rem; }
    .news__title a { color: inherit; text-decoration: none; }
    .news__title a:hover { color: var(--primary); text-decoration: underline; }
    .news__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 560px) {
      .news__item { grid-template-columns: minmax(0, 1fr); gap: 0.25rem; }
      .news__date { padding-top: 0; }
    }
  `,
};
