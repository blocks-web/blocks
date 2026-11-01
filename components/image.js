import { html, inline, url } from "../core/html.js";

const WIDTHS = ["small", "medium", "full"];

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Choose an image in the panel on the right." },
  ro: { empty: "Alege o imagine din panoul din dreapta." },
};

export default {
  name: "Image",
  category: "Text & images",
  icon: "image",
  description: "An image, with a caption and a link if you want.",
  tip: "Write the description for people who can't see the image (search engines read it too); “Medium” width suits almost any photo.",

  props: {
    src: { type: "image", label: "Image", default: "/assets/demo/interior.svg" },
    alt: {
      type: "text",
      label: "Image description",
      default: "A drawing of a café interior",
      help: "A short sentence about what's in the picture, for people who can't see it. Screen readers and search engines read it.",
    },
    caption: { type: "text", format: true, label: "Caption", default: "", help: "Optional. It shows under the image." },
    width: {
      type: "choice",
      label: "Width",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "full", label: "Full width" },
      ],
      default: "medium",
    },
    rounded: { type: "checkbox", label: "Round the image's corners", default: true },
    link: { type: "link", label: "Link", default: "", help: "Optional. Clicking the image takes people here." },
  },

  i18n: {
    ro: {
      name: "Imagine",
      category: "Text și imagini",
      description: "O imagine, cu legendă și link dacă vrei.",
      tip: "Scrie descrierea pentru cine nu vede imaginea (o citesc și motoarele de căutare); „Lățime medie” e potrivită pentru aproape orice poză.",
      props: {
        src: { label: "Imagine" },
        alt: {
          label: "Descriere imagine",
          help: "O propoziție scurtă despre ce se vede, pentru cine nu vede imaginea. O citesc cititoarele de ecran și motoarele de căutare.",
        },
        caption: { label: "Legendă", help: "Opțional. Apare sub imagine." },
        width: { label: "Lățime", options: { small: "Mică", medium: "Medie", full: "Toată lățimea" } },
        rounded: { label: "Rotunjește colțurile imaginii" },
        link: { label: "Link", help: "Opțional. Imaginea duce aici când e apăsată." },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const width = WIDTHS.includes(p.width) ? p.width : "medium";
    let content;
    if (!p.src) {
      if (ctx.mode !== "editor") return "";
      content = html`<div class="image__empty">${words.empty}</div>`;
    } else {
      const img = html`<img class="image__img" src="${url(p.src)}" alt="${p.alt}" loading="lazy" decoding="async">`;
      content = p.link ? html`<a class="image__link" href="${url(p.link)}">${img}</a>` : img;
    }
    return html`<div class="b-block image">
      <div class="b-container">
        <figure class="image__figure image__figure--${width} ${p.rounded ? "image__figure--rounded" : ""}">
          ${content}
          ${p.caption ? html`<figcaption class="image__caption">${inline(p.caption)}</figcaption>` : ""}
        </figure>
      </div>
    </div>`;
  },

  css: `
    .image { align-self: stretch; }
    .image__figure { margin: 0 auto; }
    .image__figure--small { max-width: 360px; }
    .image__figure--medium { max-width: 680px; }
    .image__img { width: 100%; }
    .image__figure--rounded .image__img, .image__figure--rounded .image__empty { border-radius: var(--radius); }
    .image__link { display: block; border-radius: var(--radius); }
    .image__link:hover .image__img { filter: brightness(1.05); }
    .image__link:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 60%, transparent); outline-offset: 3px; }
    .image__caption { margin-top: 0.6rem; font-size: 0.9rem; text-align: center; opacity: 0.8; }
    /* On a canvas, when the image fills its cell, the caption sits on it, at the bottom (otherwise it would be covered). */
    .b-cell--fill .image__caption { position: absolute; inset: auto 0 0; z-index: 1; margin: 0; padding: 0.45rem 0.75rem;
      color: #fff; opacity: 1; background: rgba(20, 14, 10, 0.55); }
    .image__empty { display: grid; place-items: center; min-height: 10rem; padding: 1rem; text-align: center;
      background: var(--surface); border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent); }
  `,
};
