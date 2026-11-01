import { html, paragraphs, url } from "../core/html.js";

// The initials of a name, for when there's no photo: "Emma Carter" → "EC".
function initials(name) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0].toUpperCase())
    .join("");
}

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Write the quote in the panel on the right." },
  ro: { empty: "Scrie citatul în panoul din dreapta." },
};

export default {
  name: "Quote",
  category: "Text & images",
  icon: "quote",
  description: "What a customer says about you, with their name and photo.",
  tip: "A short, concrete quote (“the best flat white in town”) beats three lines of praise; for several reviews, put three Quotes in Columns.",

  props: {
    text: {
      type: "longtext",
      label: "Quote",
      default: "We came for the coffee and stayed for the people. The warmest place in town on a Monday morning.",
    },
    author: { type: "text", label: "Author", default: "Daniel Brooks" },
    role: { type: "text", label: "Who they are", default: "A regular since 2020", help: "Optional. For example their job or their town." },
    image: { type: "image", label: "Photo", default: "", help: "Optional. Without a photo, their initials show." },
  },

  i18n: {
    ro: {
      name: "Citat",
      category: "Text și imagini",
      description: "Ce spune un client despre tine, cu nume și poză.",
      tip: "Un citat scurt și concret („cel mai bun flat white din oraș”) bate trei rânduri de laude; pentru mai multe păreri, pune trei Citate în Coloane.",
      props: {
        text: { label: "Citat" },
        author: { label: "Autor" },
        role: { label: "Cine e", help: "Opțional. De exemplu meseria sau orașul." },
        image: { label: "Poză", help: "Opțional. Fără poză apar inițialele." },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    if (!p.text) {
      return ctx.mode === "editor" ? html`<div class="b-block quote"><div class="b-container"><p class="quote__empty">${words.empty}</p></div></div>` : "";
    }
    const letters = initials(p.author);
    return html`<div class="b-block quote">
      <div class="b-container">
        <figure class="quote__figure">
          <blockquote class="quote__text">${paragraphs(p.text)}</blockquote>
          ${p.author || p.role
            ? html`<figcaption class="quote__author">
                ${p.image
                  ? html`<img class="quote__photo" src="${url(p.image)}" alt="" loading="lazy" decoding="async">`
                  : letters
                    ? html`<span class="quote__photo quote__photo--initials" aria-hidden="true">${letters}</span>`
                    : ""}
                <span class="quote__who">
                  ${p.author ? html`<strong class="quote__name">${p.author}</strong>` : ""}
                  ${p.role ? html`<span class="quote__role">${p.role}</span>` : ""}
                </span>
              </figcaption>`
            : ""}
        </figure>
      </div>
    </div>`;
  },

  css: `
    .quote { align-self: stretch; }
    .quote__figure { position: relative; max-width: 46rem; margin: 0 auto; padding: 2.75rem 2rem 2rem; text-align: center;
      color: var(--text); background: var(--surface); border-radius: var(--radius); }
    /* The ” quote mark, as in the quote icon (docs/DESIGN.md). */
    .quote__figure::before { content: "”"; position: absolute; top: -0.15em; left: 50%; transform: translateX(-50%);
      font-family: Georgia, "Times New Roman", serif; font-size: 5.5rem; line-height: 1; color: var(--primary); }
    .quote__text { margin: 0; font-size: clamp(1.1rem, 2.4cqi, 1.35rem); line-height: 1.55; font-style: italic; }
    .quote__text > :last-child { margin-bottom: 0; }
    .quote__author { display: inline-flex; align-items: center; gap: 0.85rem; margin-top: 1.5rem; text-align: left; }
    .quote__photo { width: 3.25rem; height: 3.25rem; flex: none; border-radius: 50%; object-fit: cover; }
    .quote__photo--initials { display: grid; place-items: center; background: var(--primary); color: #fff; font-weight: 700; }
    .quote__who { display: flex; flex-direction: column; line-height: 1.3; }
    .quote__role { font-size: 0.9rem; opacity: 0.75; }
    .quote__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 560px) {
      .quote__figure { padding: 2.5rem 1.25rem 1.5rem; }
    }
  `,
};
