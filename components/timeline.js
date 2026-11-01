import { html, inline, paragraphs } from "../core/html.js";

// A vertical timeline: the year in a pill on the left and a line that joins the moments.
// It works just as well with one moment as with twenty.

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add moments in the panel on the right." },
  ro: { empty: "Adaugă momente din panoul din dreapta." },
};

export default {
  name: "Timeline",
  category: "Lists",
  icon: "timeline",
  description: "A vertical timeline: a year, a title and a few lines for each moment.",
  tip: "The year can also be “Spring 2021”; five or six moments tell the story, twenty bury it.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "How we grew", help: "Optional." },
    moments: {
      type: "list",
      label: "Moments",
      fields: {
        year: { type: "text", label: "Year", default: "2026", help: "It can also be “Spring 2021”. Leave it empty to show just a dot on the line." },
        title: { type: "text", label: "Title", default: "New moment" },
        text: { type: "longtext", label: "Text", default: "" },
      },
      default: [
        {
          year: "2019",
          title: "We open with one espresso machine and three tables",
          text: "A tiny room on Linden Street and a short menu: espresso, cappuccino and carrot cake.",
        },
        {
          year: "2020",
          title: "Coffee through the window",
          text: "When nobody could sit inside, we served through the window. The neighbors came by every morning.",
        },
        {
          year: "2021",
          title: "The flower terrace",
          text: "Four tables outside and geraniums in pots. From April to October, it's everyone's favorite spot.",
        },
        {
          year: "2023",
          title: "We start roasting our own",
          text: "A small roaster in the back and our first bags of beans to take home.",
        },
        {
          year: "2026",
          title: "12 seats and a team of five",
          text: "We took down the wall to the old storeroom. Now there's room for everyone, laptops and strollers alike.",
        },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Istoric",
      category: "Liste",
      description: "O cronologie pe verticală: un an, un titlu și câteva rânduri pentru fiecare moment.",
      tip: "Anul poate fi și „Primăvara 2021”; cinci-șase momente spun povestea, douăzeci o îngroapă.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        moments: {
          label: "Momente",
          fields: {
            year: { label: "An", help: "Poate fi și „Primăvara 2021”. Lasă gol ca să apară doar un punct pe linie." },
            title: { label: "Titlu" },
            text: { label: "Text" },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const moments = p.moments.filter((m) => m.year || m.title || m.text);
    if (!moments.length && ctx.mode !== "editor") return "";
    const moment = (m) => html`<li class="timeline__item">
      <div class="timeline__when">
        ${m.year ? html`<span class="timeline__year">${m.year}</span>` : html`<span class="timeline__dot" aria-hidden="true"></span>`}
      </div>
      <div class="timeline__body">
        ${m.title ? html`<h3 class="timeline__title">${m.title}</h3>` : ""}
        ${paragraphs(m.text)}
      </div>
    </li>`;
    return html`<div class="b-block timeline">
      <div class="b-container">
        <div class="timeline__inner">
          ${p.title ? html`<h2 class="timeline__heading">${inline(p.title)}</h2>` : ""}
          ${moments.length
            ? html`<ol class="timeline__list">${moments.map(moment)}</ol>`
            : html`<p class="timeline__empty">${words.empty}</p>`}
        </div>
      </div>
    </div>`;
  },

  css: `
    .timeline { align-self: stretch; }
    .timeline__inner { max-width: 760px; margin-inline: auto; text-align: left; }
    .timeline__heading { margin-bottom: 1.5rem; }
    .timeline__list { list-style: none; margin: 0; padding: 0; }
    .timeline__item { position: relative; display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: 0 1.5rem; padding-bottom: 2rem; }
    .timeline__item:last-child { padding-bottom: 0; }
    /* The line runs through the middle of the year column, behind the pill; it starts and ends at the pills. */
    .timeline__item::before { content: ""; position: absolute; left: calc(3.5rem - 1px); top: 0; bottom: 0; width: 2px;
      background: color-mix(in srgb, var(--primary) 25%, transparent); }
    .timeline__item:first-child::before { top: 0.9rem; }
    .timeline__item:last-child::before { bottom: auto; height: 0.9rem; }
    .timeline__item:only-child::before { display: none; }
    .timeline__when { display: flex; justify-content: center; align-items: flex-start; }
    .timeline__year { position: relative; max-width: 100%; padding: 0.25em 0.8em; border-radius: 999px; background: var(--primary); color: #fff;
      font-size: 0.9rem; font-weight: 700; line-height: 1.4; text-align: center; font-variant-numeric: tabular-nums; }
    .timeline__dot { position: relative; display: block; width: 0.9rem; height: 0.9rem; margin-top: 0.4rem; border-radius: 50%;
      background: var(--primary); box-shadow: 0 0 0 3px var(--background); }
    .timeline__body { padding-top: 0.15rem; }
    .timeline__body > :last-child { margin-bottom: 0; }
    .timeline__title { margin-bottom: 0.35em; font-size: 1.15rem; }
    .timeline__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 560px) {
      .timeline__item { grid-template-columns: 4.5rem minmax(0, 1fr); gap: 0 1rem; padding-bottom: 1.5rem; }
      .timeline__item::before { left: calc(2.25rem - 1px); }
      .timeline__year { padding: 0.2em 0.6em; font-size: 0.8rem; }
    }
  `,
};
