import { html } from "../core/html.js";

// A row of big numbers, each with a label under it: "20+ / years in business". Between 2 and 6 look best;
// on a phone they sit two to a row.
const STYLES = ["lines", "cards"];
const ALIGNS = ["left", "center"];

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add numbers in the panel on the right." },
  ro: { empty: "Adaugă cifre din panoul din dreapta." },
};

export default {
  name: "Numbers",
  category: "Sections",
  icon: "stats",
  description: "A row of big numbers with labels: years in business, customers, seats.",
  tip: "Four numbers is just right; write the label as the rest of the sentence (“12 seats inside”), not as a heading.",

  props: {
    style: {
      type: "choice",
      label: "Style",
      options: [
        { value: "lines", label: "Lines" },
        { value: "cards", label: "Cards" },
      ],
      default: "lines",
    },
    align: {
      type: "choice",
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
      ],
      default: "center",
    },
    stats: {
      type: "list",
      label: "Numbers",
      fields: {
        value: { type: "text", label: "Number", default: "20+" },
        label: { type: "text", label: "Label", default: "years in business" },
      },
      default: [
        { value: "2019", label: "the year we opened" },
        { value: "12", label: "seats inside" },
        { value: "40", label: "coffees a day" },
        { value: "1", label: "terrace full of flowers" },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Cifre",
      category: "Secțiuni",
      description: "Un rând de cifre mari cu etichete: ani de activitate, clienți, locuri.",
      tip: "Patru cifre e numărul potrivit; scrie eticheta ca o continuare a cifrei („12 locuri înăuntru”), nu ca un titlu.",
      props: {
        style: { label: "Stil", options: { lines: "Linii", cards: "Carduri" } },
        align: { label: "Aliniere", options: { left: "Stânga", center: "Centru" } },
        stats: {
          label: "Cifre",
          fields: {
            value: { label: "Număr" },
            label: { label: "Etichetă" },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const style = STYLES.includes(p.style) ? p.style : "lines";
    const align = ALIGNS.includes(p.align) ? p.align : "center";
    const stats = p.stats.filter((s) => s.value || s.label);
    if (!stats.length && ctx.mode !== "editor") return "";
    // The number of columns comes from how many numbers there are (2–6); above 6, the grid manages on its own.
    const columns = stats.length >= 2 && stats.length <= 6 ? ` stats__list--${stats.length}` : "";
    return html`<div class="b-block stats stats--${style} stats--${align}">
      <div class="b-container">
        ${stats.length
          ? html`<ul class="stats__list${columns}">
              ${stats.map(
                (s) => html`<li class="stats__item">
                  ${s.value ? html`<strong class="stats__value">${s.value}</strong>` : ""}
                  ${s.label ? html`<span class="stats__label">${s.label}</span>` : ""}
                </li>`,
              )}
            </ul>`
          : html`<p class="stats__empty">${words.empty}</p>`}
      </div>
    </div>`;
  },

  css: `
    .stats { align-self: stretch; }
    .stats__list { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 1rem 0;
      list-style: none; margin: 0; padding: 0; }
    .stats__list--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .stats__list--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .stats__list--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .stats__list--5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .stats__list--6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .stats__item { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; padding: 0.5rem 1.25rem; }
    .stats--left .stats__item { align-items: flex-start; text-align: left; }
    .stats--center .stats__item { align-items: center; text-align: center; }
    .stats__value { font-size: clamp(2.2rem, 4.5cqi, 3.2rem); font-weight: 700; line-height: 1; letter-spacing: -0.02em;
      color: var(--primary); font-variant-numeric: tabular-nums; }
    .stats__label { font-size: 0.95rem; line-height: 1.35; color: color-mix(in srgb, var(--text) 75%, transparent); }
    /* Lines: a band with a line above and below, and dividers between the numbers. */
    .stats--lines .stats__list { padding-block: 1.5rem; border-top: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--text) 12%, transparent); }
    .stats--lines .stats__item { border-left: 1px solid color-mix(in srgb, var(--text) 12%, transparent); }
    .stats--lines .stats__item:first-child { border-left: 0; }
    /* Cards: every number on a soft surface. */
    .stats--cards .stats__list { gap: 1rem; }
    .stats--cards .stats__item { padding: 1.5rem 1.25rem; background: var(--surface); border-radius: var(--radius);
      border: 1px solid color-mix(in srgb, var(--text) 9%, transparent); }
    .stats__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 960px) {
      .stats__list--5, .stats__list--6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .stats--lines .stats__list--5 .stats__item:nth-child(3n + 1),
      .stats--lines .stats__list--6 .stats__item:nth-child(3n + 1) { border-left: 0; }
    }
    @container (max-width: 600px) {
      .stats__list.stats__list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .stats__item { padding-inline: 0.75rem; }
      .stats--lines .stats__list .stats__item:nth-child(even) { border-left: 1px solid color-mix(in srgb, var(--text) 12%, transparent); }
      .stats--lines .stats__list .stats__item:nth-child(odd) { border-left: 0; }
    }
  `,
};
