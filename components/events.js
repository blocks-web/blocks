import { html, formatDate, inline, paragraphs, url } from "../core/html.js";

// What's coming up: date, time, place and a description, soonest first. With "Hide past events" on,
// old events disappear from the site by themselves (in the editor they all show, faded).
// "Today" is worked out at render time: on the server at every request, in the static export at export time.

// A date (local time) as "YYYY-MM-DD", like the value of a "date" field.
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// `days` days from now: the defaults are always in the future, so the block works right away.
function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { past: "This has passed: it no longer shows on the site.", empty: "Add events in the panel on the right." },
  ro: { past: "A trecut: pe site nu se mai vede.", empty: "Adaugă evenimente din panoul din dreapta." },
};

export default {
  name: "Events",
  category: "Lists",
  icon: "events",
  description: "What's coming up: date, time, place and a description, soonest first.",
  tip: "With “Hide past events” on, old events disappear from the site by themselves.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "Coming up", help: "Optional." },
    hidePast: {
      type: "checkbox",
      label: "Hide past events",
      default: true,
      help: "In the editor you see them all; on the site, only today's and later ones. On a site published without a server, “today” is the day you published it.",
    },
    events: {
      type: "list",
      label: "Events",
      fields: {
        date: { type: "date", label: "Date", default: "" },
        time: { type: "text", label: "Time", default: "", help: "Free text: “7 pm”, “from 10 am”." },
        title: { type: "text", label: "Title", default: "New event" },
        place: { type: "text", label: "Place", default: "" },
        text: { type: "longtext", label: "Text", default: "" },
        buttonText: { type: "text", label: "Button text", default: "", help: "Optional, for example “Book a seat”." },
        link: { type: "link", label: "Link", default: "" },
      },
      default: [
        {
          date: daysFromNow(16),
          time: "7 pm",
          title: "New bean tasting",
          place: "At the café",
          text: "Three different beans and the stories behind them. Only twelve seats, so book early.",
          buttonText: "Book a seat",
          link: "/contact",
        },
        {
          date: daysFromNow(30),
          time: "6 pm",
          title: "Latte art evening",
          place: "At the café",
          text: "Learn to pour a heart and a leaf, with our milk and our espresso machine. For beginners.",
          buttonText: "",
          link: "",
        },
        {
          date: daysFromNow(51),
          time: "from 10 am",
          title: "Winter fair on the terrace",
          place: "On the terrace",
          text: "Gifts from local makers, mulled wine and Turkish coffee.",
          buttonText: "",
          link: "",
        },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Evenimente",
      category: "Liste",
      description: "Ce urmează: dată, oră, loc și o descriere, cu cele mai apropiate primele.",
      tip: "Cu „Ascunde ce a trecut” pornit, evenimentele vechi dispar singure de pe site.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        hidePast: {
          label: "Ascunde ce a trecut",
          help: "În editor se văd toate; pe site, doar cele de azi încolo. Pe un site publicat fără server, „azi” e ziua în care l-ai publicat.",
        },
        events: {
          label: "Evenimente",
          fields: {
            date: { label: "Dată" },
            time: { label: "Oră", help: "Text liber: „19:00”, „de la 10”." },
            title: { label: "Titlu" },
            place: { label: "Loc" },
            text: { label: "Text" },
            buttonText: { label: "Text buton", help: "Opțional, de exemplu „Rezervă un loc”." },
            link: { label: "Link" },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const lang = ctx.site?.lang === "ro" ? "ro" : "en";
    const words = WORDS[lang];
    const editor = ctx.mode === "editor";
    const today = isoDate(new Date());
    const dateOf = (e) => (formatDate(e.date) ? String(e.date).trim() : "");
    const isPast = (e) => dateOf(e) !== "" && dateOf(e) < today;
    let events = p.events.filter((e) => e.title || e.text);
    if (p.hidePast && !editor) events = events.filter((e) => !isPast(e));
    if (!events.length && !editor) return "";
    // The date is "YYYY-MM-DD", so alphabetical order is also time order; without a valid date → at the end.
    events.sort((a, b) => (dateOf(a) || "9").localeCompare(dateOf(b) || "9"));

    const event = (e) => {
      const date = dateOf(e);
      const day = date ? String(Number(date.slice(8, 10))) : "";
      const month = formatDate(date, lang).replace(/[\d,]/g, "").trim();
      const meta = [e.time, e.place].filter(Boolean);
      const past = editor && p.hidePast && isPast(e);
      return html`<li class="events__item${past ? " events__item--past" : ""}">
        ${date
          ? html`<time class="events__date" datetime="${date}"><span class="events__day">${day}</span><span class="events__month">${month.slice(0, 3)}</span></time>`
          : html`<span class="events__date events__date--none" aria-hidden="true"></span>`}
        <div class="events__body">
          ${e.title ? html`<h3 class="events__title">${e.title}</h3>` : ""}
          ${meta.length ? html`<p class="events__meta">${meta.map((m, i) => (i ? html` <span aria-hidden="true">·</span> ${m}` : m))}</p>` : ""}
          ${e.text ? html`<div class="events__text">${paragraphs(e.text)}</div>` : ""}
          ${e.buttonText && e.link ? html`<a class="b-btn b-btn--outline events__button" href="${url(e.link)}">${e.buttonText}</a>` : ""}
          ${past ? html`<p class="events__note">${words.past}</p>` : ""}
        </div>
      </li>`;
    };

    return html`<div class="b-block events">
      <div class="b-container">
        <div class="events__inner">
          ${p.title ? html`<h2 class="events__heading">${inline(p.title)}</h2>` : ""}
          ${events.length
            ? html`<ol class="events__list">${events.map(event)}</ol>`
            : html`<p class="events__empty">${words.empty}</p>`}
        </div>
      </div>
    </div>`;
  },

  css: `
    .events { align-self: stretch; }
    .events__inner { max-width: 760px; margin-inline: auto; text-align: left; }
    .events__heading { margin-bottom: 1rem; }
    .events__list { list-style: none; margin: 0; padding: 0; }
    .events__item { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: 1.25rem; padding-block: 1.25rem;
      border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent); }
    .events__item:first-child { border-top: 0; }
    .events__item--past { opacity: 0.55; }
    .events__date { display: flex; flex-direction: column; align-items: center; justify-content: center; align-self: start; height: 4.5rem;
      border-radius: var(--radius); background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary); line-height: 1; }
    .events__date--none { background: var(--surface); }
    .events__day { font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .events__month { margin-top: 0.2rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
    .events__body > :last-child { margin-bottom: 0; }
    .events__title { margin-bottom: 0.2em; font-size: 1.2rem; }
    .events__meta { margin-bottom: 0.5em; font-size: 0.9rem; font-weight: 600; color: color-mix(in srgb, var(--text) 65%, transparent); }
    .events__text p { margin-bottom: 0.6em; }
    .events__button { margin-top: 0.6rem; padding: 0.5em 1.1em; font-size: 0.95rem; }
    .events__note { margin: 0.5rem 0 0; font-size: 0.85rem; font-style: italic; }
    .events__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 480px) {
      .events__item { grid-template-columns: 3.75rem minmax(0, 1fr); gap: 1rem; }
      .events__date { height: 3.75rem; }
      .events__day { font-size: 1.35rem; }
    }
  `,
};
