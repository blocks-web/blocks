import { html, fold, inline } from "../core/html.js";

// Opening hours, day by day. The days are written the way people say them (“Monday–Friday”,
// “Saturday & Sunday”, “Holidays”), in English or in Romanian; on the site, today's row shows in
// bold. The days are recognized here, while rendering (data-days="1,2,3"), and js() only compares
// them with today: a row that isn't understood is never highlighted.

// The days of the week in order (Monday first), each with its number in Date#getDay() (Sunday is 0)
// and the words that name it, in English and in Romanian, without accents (see fold).
const WEEK = [
  { day: 1, words: ["monday", "mon", "luni"] },
  { day: 2, words: ["tuesday", "tues", "tue", "marti"] },
  { day: 3, words: ["wednesday", "wed", "miercuri"] },
  { day: 4, words: ["thursday", "thurs", "thur", "thu", "joi"] },
  { day: 5, words: ["friday", "fri", "vineri"] },
  { day: 6, words: ["saturday", "sat", "sambata"] },
  { day: 0, words: ["sunday", "sun", "duminica"] },
];
const POSITION = new Map(WEEK.flatMap((d, i) => d.words.map((word) => [word, i])));
// A day's name, also in the plural ("Saturdays").
const DAY = `(${[...POSITION.keys()].join("|")})s?`;
const RANGE = new RegExp(`\\b${DAY}(?:\\s*[–—-]\\s*|\\s+(?:to|through|thru|pana la|pana)\\s+)${DAY}\\b`, "g");
const SINGLE = new RegExp(`\\b${DAY}\\b`, "g");
const EVERY_DAY = /\b(daily|every ?day|all week|7 days a week|24\/7|zilnic|in fiecare zi|toata saptamana|non-?stop)\b/;
const WEEKDAYS = /\b(weekdays|zile lucratoare)\b/;
const WEEKEND = /\bweekends?\b/;
const CLOSED = /\b(closed|inchis)\b/;

// "Monday–Friday" → [1,2,3,4,5]; "Sat, Sun" → [6,0]; "Daily" → all of them; "Holidays" → [].
function daysIn(text) {
  const t = fold(text);
  if (EVERY_DAY.test(t)) return [1, 2, 3, 4, 5, 6, 0];
  const found = new Set();
  for (const m of t.matchAll(RANGE)) {
    // A range goes forward through the week, up to the second day ("Friday–Monday" works too).
    const from = POSITION.get(m[1]);
    const to = POSITION.get(m[2]);
    for (let i = from; ; i = (i + 1) % 7) {
      found.add(WEEK[i].day);
      if (i === to) break;
    }
  }
  if (WEEKDAYS.test(t)) for (const day of [1, 2, 3, 4, 5]) found.add(day);
  if (WEEKEND.test(t)) for (const day of [6, 0]) found.add(day);
  for (const m of t.matchAll(SINGLE)) found.add(WEEK[POSITION.get(m[1])].day);
  return [...found];
}

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add rows in the panel on the right." },
  ro: { empty: "Adaugă rânduri din panoul din dreapta." },
};

export default {
  name: "Opening hours",
  category: "Contact",
  icon: "hours",
  description: "Your opening hours, day by day: “Mon–Fri 8 am–8 pm, Sat 9 am–6 pm, Sun closed”.",
  tip: "Write the days the way you'd say them (“Monday–Friday”, “Holidays”); on the site, today's row shows in bold, and a “Closed” row matters as much as an open one.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "Opening hours", help: "Optional." },
    rows: {
      type: "list",
      label: "Rows",
      fields: {
        days: { type: "text", label: "Days", default: "Monday–Friday" },
        hours: { type: "text", label: "Hours", default: "8 am–8 pm", help: "Or “Closed”." },
      },
      default: [
        { days: "Monday–Friday", hours: "8 am–8 pm" },
        { days: "Saturday", hours: "9 am–8 pm" },
        { days: "Sunday", hours: "9 am–6 pm" },
        { days: "Holidays", hours: "Closed" },
      ],
    },
    note: { type: "text", format: true, label: "Note", default: "", help: "Optional, under the hours: “The terrace is open when the weather is nice.”" },
    highlightToday: { type: "checkbox", label: "Highlight today", default: true },
  },

  i18n: {
    ro: {
      name: "Program",
      category: "Contact",
      description: "Orarul, pe zile: „Luni–Vineri 8–20, Sâmbătă 9–18, Duminică închis”.",
      tip: "Scrie zilele cum vorbești („Luni–Vineri”, „Sărbători”); pe site, ziua de azi apare îngroșată, iar un rând cu „Închis” e la fel de important ca unul deschis.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        rows: {
          label: "Rânduri",
          fields: {
            days: { label: "Zile" },
            hours: { label: "Ore", help: "Sau „Închis”." },
          },
        },
        note: { label: "Notă", help: "Opțional, sub program: „Terasa e deschisă cât e vreme bună.”" },
        highlightToday: { label: "Evidențiază ziua de azi" },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const rows = p.rows.filter((r) => r.days || r.hours);
    if (!rows.length && ctx.mode !== "editor") return "";
    const row = (r) => {
      const days = p.highlightToday ? daysIn(r.days) : [];
      const closed = CLOSED.test(fold(r.hours));
      return html`<li class="hours__row${closed ? " hours__row--closed" : ""}"${days.length ? html` data-days="${days.join(",")}"` : ""}>
        <span class="hours__days">${r.days}</span>
        <span class="hours__time">${r.hours}</span>
      </li>`;
    };
    return html`<div class="b-block hours">
      <div class="b-container">
        <div class="hours__inner">
          ${p.title ? html`<h2 class="hours__title">${inline(p.title)}</h2>` : ""}
          ${rows.length
            ? html`<ul class="hours__list">${rows.map(row)}</ul>`
            : html`<p class="hours__empty">${words.empty}</p>`}
          ${p.note ? html`<p class="hours__note">${inline(p.note)}</p>` : ""}
        </div>
      </div>
    </div>`;
  },

  css: `
    .hours { align-self: stretch; }
    .hours__inner { max-width: 480px; text-align: left; }
    .hours__title { margin-bottom: 0.75rem; }
    .hours__list { list-style: none; margin: 0; padding: 0; }
    .hours__row { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; padding: 0.55rem 0;
      border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent); }
    .hours__row:first-child { border-top: 0; }
    .hours__time { flex: none; font-variant-numeric: tabular-nums; }
    .hours__row--closed .hours__time { color: color-mix(in srgb, var(--text) 60%, transparent); }
    .hours__row--today { font-weight: 700; color: var(--primary); }
    .hours__row--today .hours__time { color: inherit; }
    .hours__note { margin: 0.75rem 0 0; font-size: 0.9rem; color: color-mix(in srgb, var(--text) 70%, transparent); }
    .hours__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
  `,

  js(el, p, api) {
    // In the editor nothing is highlighted, so all the rows look the same.
    if (api.mode === "editor") return;
    const today = String(new Date().getDay());
    for (const row of el.querySelectorAll(".hours__row[data-days]")) {
      if (row.dataset.days.split(",").includes(today)) row.classList.add("hours__row--today");
    }
  },
};
