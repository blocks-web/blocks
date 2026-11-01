import { html, inline, paragraphs, url } from "../core/html.js";

// An image on one side, a title with text and a button on the other: the classic "about us" block.
// On a phone the image moves above the text.
const POSITIONS = ["left", "right"];
const WIDTHS = ["half", "third"];

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Choose an image in the panel on the right." },
  ro: { empty: "Alege o imagine din panoul din dreapta." },
};

export default {
  name: "Image and text",
  category: "Sections",
  icon: "image-text",
  description: "An image on one side, a title with text and a button on the other: the classic “about us” block.",
  tip: "On phones the image moves above the text; switch between left and right from one section to the next to give the page a rhythm.",

  props: {
    image: { type: "image", label: "Image", default: "/assets/demo/barista.svg" },
    alt: {
      type: "text",
      label: "Image description",
      default: "The café's espresso machine, with a cup under it",
      help: "For people who can't see the image, and for search engines.",
    },
    title: { type: "text", format: true, label: "Title", default: "About us" },
    text: {
      type: "longtext",
      label: "Text",
      default:
        "We started in 2019 with one espresso machine, three tables and a lot of stubbornness.\n\nToday we have 12 seats inside, a terrace and, the neighbors say, the best carrot cake in the neighborhood.",
    },
    buttonText: { type: "text", label: "Button text", default: "See what we serve", help: "Leave it empty if you don't want a button." },
    buttonLink: { type: "link", label: "Button link", default: "/products" },
    position: {
      type: "choice",
      label: "Image side",
      options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ],
      default: "left",
    },
    width: {
      type: "choice",
      label: "Image width",
      options: [
        { value: "half", label: "Half" },
        { value: "third", label: "A third" },
      ],
      default: "half",
    },
  },

  i18n: {
    ro: {
      name: "Imagine și text",
      category: "Secțiuni",
      description: "O imagine într-o parte, un titlu cu text și un buton în cealaltă: blocul clasic de „despre noi”.",
      tip: "Pe telefon imaginea trece deasupra textului; alternează stânga–dreapta de la o secțiune la alta ca pagina să aibă ritm.",
      props: {
        image: { label: "Imagine" },
        alt: { label: "Descriere imagine", help: "Pentru cine nu vede imaginea și pentru motoarele de căutare." },
        title: { label: "Titlu" },
        text: { label: "Text" },
        buttonText: { label: "Text buton", help: "Lasă gol dacă nu vrei buton." },
        buttonLink: { label: "Link buton" },
        position: { label: "Imaginea în", options: { left: "Stânga", right: "Dreapta" } },
        width: { label: "Lățimea imaginii", options: { half: "Jumătate", third: "O treime" } },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const position = POSITIONS.includes(p.position) ? p.position : "left";
    const width = WIDTHS.includes(p.width) ? p.width : "half";
    const editor = ctx.mode === "editor";
    if (!p.image && !p.title && !p.text && !editor) return "";
    const image = p.image
      ? html`<img class="image-text__img" src="${url(p.image)}" alt="${p.alt}" loading="lazy" decoding="async">`
      : editor
        ? html`<div class="image-text__empty">${words.empty}</div>`
        : "";
    return html`<div class="b-block image-text image-text--${position} image-text--${width}">
      <div class="b-container image-text__grid">
        ${image ? html`<div class="image-text__image">${image}</div>` : ""}
        <div class="image-text__text">
          ${p.title ? html`<h2>${inline(p.title)}</h2>` : ""}
          ${paragraphs(p.text)}
          ${p.buttonText ? html`<a class="b-btn image-text__button" href="${url(p.buttonLink)}">${p.buttonText}</a>` : ""}
        </div>
      </div>
    </div>`;
  },

  css: `
    .image-text { align-self: stretch; }
    .image-text__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 2.5rem 3.5rem; }
    .image-text--third .image-text__grid { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
    .image-text--right .image-text__image { order: 2; }
    .image-text--right.image-text--third .image-text__grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
    .image-text__img { width: 100%; border-radius: var(--radius); }
    .image-text__text { max-width: 60ch; text-align: left; }
    .image-text__text > :last-child { margin-bottom: 0; }
    .image-text__button { margin-top: 0.75rem; }
    .image-text__button:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent); outline-offset: 3px; }
    .image-text__empty { display: grid; place-items: center; min-height: 12rem; padding: 1rem; text-align: center; opacity: 0.8;
      background: var(--surface); border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent); border-radius: var(--radius); }
    @container (max-width: 720px) {
      .image-text__grid.image-text__grid { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
      .image-text--right .image-text__image { order: 0; }
    }
  `,
};
