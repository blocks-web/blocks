import { html, inline, paragraphs, url } from "../core/html.js";

const COLUMNS = ["2", "3", "4"];

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add cards in the panel on the right." },
  ro: { empty: "Adaugă carduri din panoul din dreapta." },
};

export default {
  name: "Cards",
  category: "Sections",
  icon: "cards",
  description: "Cards with an image, a title and some text, in a grid: services, products, reasons to come.",
  tip: "Three cards per row feels calmest; without an image, a card keeps just its title and text, so it also works for “our values”.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "What you'll find here", help: "Optional. Leave it empty if you don't want a title." },
    subtitle: { type: "longtext", label: "Subtitle", default: "" },
    columns: {
      type: "choice",
      label: "Cards per row",
      options: [
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ],
      default: "3",
    },
    cards: {
      type: "list",
      label: "Cards",
      fields: {
        image: { type: "image", label: "Image", default: "" },
        title: { type: "text", label: "Title", default: "New card" },
        text: { type: "longtext", label: "Text", default: "" },
        linkText: { type: "text", label: "Link text", default: "", help: "Optional, for example “Learn more”." },
        link: { type: "link", label: "Link", default: "" },
      },
      default: [
        {
          image: "/assets/demo/coffee-cups.svg",
          title: "Specialty coffee",
          text: "Beans from small farms, roasted by us every week.",
          linkText: "See the menu",
          link: "/products",
        },
        {
          image: "/assets/demo/carrot-cake.svg",
          title: "Homemade cakes",
          text: "Simple recipes, good ingredients and nothing rushed.",
          linkText: "",
          link: "",
        },
        {
          image: "/assets/demo/terrace.svg",
          title: "A quiet terrace",
          text: "A green corner where you can work, read or just sit in the sun.",
          linkText: "",
          link: "",
        },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Carduri",
      category: "Secțiuni",
      description: "Carduri cu imagine, titlu și text, în grilă: servicii, produse, motive.",
      tip: "Trei carduri pe rând e cel mai liniștit; fără imagine, cardul rămâne doar cu titlu și text, deci merge și pentru „valorile noastre”.",
      props: {
        title: { label: "Titlu", help: "Opțional. Lasă gol dacă nu vrei titlu." },
        subtitle: { label: "Subtitlu" },
        columns: { label: "Carduri pe rând" },
        cards: {
          label: "Carduri",
          fields: {
            image: { label: "Imagine" },
            title: { label: "Titlu" },
            text: { label: "Text" },
            linkText: { label: "Text link", help: "Opțional, de exemplu „Află mai multe”." },
            link: { label: "Link" },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const columns = COLUMNS.includes(String(p.columns)) ? String(p.columns) : "3";
    const cards = p.cards.filter((c) => c.title || c.text || c.image);
    // Without cards, the site doesn't show the title on its own either.
    if (!cards.length && ctx.mode !== "editor") return "";

    const card = (c) => {
      // A link without link text: the title becomes the link.
      const title = c.link && !c.linkText ? html`<a href="${url(c.link)}">${c.title}</a>` : c.title;
      return html`<li class="cards__card">
        ${c.image ? html`<img class="cards__image" src="${url(c.image)}" alt="" loading="lazy" decoding="async">` : ""}
        <div class="cards__body">
          ${c.title ? html`<h3 class="cards__title">${title}</h3>` : ""}
          ${paragraphs(c.text)}
          ${c.link && c.linkText ? html`<a class="cards__link" href="${url(c.link)}">${c.linkText}<span aria-hidden="true"> →</span></a>` : ""}
        </div>
      </li>`;
    };

    return html`<div class="b-block cards">
      <div class="b-container">
        ${p.title || p.subtitle
          ? html`<div class="cards__intro">
              ${p.title ? html`<h2>${inline(p.title)}</h2>` : ""}
              ${paragraphs(p.subtitle)}
            </div>`
          : ""}
        ${cards.length
          ? html`<ul class="cards__grid cards__grid--${columns}">${cards.map(card)}</ul>`
          : ctx.mode === "editor"
            ? html`<p class="cards__empty">${words.empty}</p>`
            : ""}
      </div>
    </div>`;
  },

  css: `
    .cards { align-self: stretch; }
    .cards__intro { max-width: 60ch; margin: 0 auto 2rem; text-align: center; }
    .cards__intro > :last-child { margin-bottom: 0; }
    .cards__intro p { opacity: 0.85; font-size: 1.1rem; }
    .cards__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem;
      list-style: none; margin: 0; padding: 0; text-align: left; }
    .cards__grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .cards__grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .cards__card { display: flex; flex-direction: column; overflow: hidden; color: var(--text);
      background: var(--surface); border: 1px solid color-mix(in srgb, var(--text) 9%, transparent);
      border-radius: var(--radius); }
    .cards__image { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
    .cards__body { display: flex; flex-direction: column; flex: 1; padding: 1.25rem 1.35rem 1.4rem; }
    .cards__body p { margin-bottom: 0.75em; }
    .cards__body > :last-child { margin-bottom: 0; }
    .cards__title { font-size: 1.2rem; margin-bottom: 0.4em; }
    .cards__title a { color: inherit; text-decoration: none; }
    .cards__title a:hover { color: var(--primary); text-decoration: underline; }
    .cards__link { margin-top: auto; padding-top: 0.5rem; font-weight: 600; text-decoration: none; color: var(--primary); }
    .cards__link:hover { text-decoration: underline; }
    .cards a:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 60%, transparent); outline-offset: 2px; border-radius: 4px; }
    .cards__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 960px) {
      .cards__grid--3, .cards__grid--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @container (max-width: 560px) {
      .cards__grid.cards__grid { grid-template-columns: minmax(0, 1fr); }
    }
  `,
};
