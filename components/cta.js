import { html, inline, paragraphs, url } from "../core/html.js";

// A colored band with a sentence and a button: "Book a table", "Call us", "Sign up".
// The most common pattern on a small site, in a single block.
const BACKGROUNDS = ["primary", "surface", "none"];
const ALIGNS = ["left", "center"];

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Write the title and the button text in the panel on the right." },
  ro: { empty: "Scrie titlul și textul butonului în panoul din dreapta." },
};

export default {
  name: "Call to action",
  category: "Sections",
  icon: "cta",
  description: "A sentence and a button on a colored band: “Book a table”, “Call us”, “Sign up”.",
  tip: "Put it at the end of the page, once visitors know what you offer; one button persuades better than two.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "Have a question, or want to book a table?" },
    text: { type: "longtext", label: "Text", default: "Write to us and we'll reply the same day." },
    buttonText: { type: "text", label: "Button text", default: "Contact us" },
    buttonLink: { type: "link", label: "Button link", default: "/contact" },
    button2Text: { type: "text", label: "Second button text", default: "", help: "Leave it empty if you don't want a second button." },
    button2Link: { type: "link", label: "Second button link", default: "" },
    background: {
      type: "choice",
      label: "Background",
      options: [
        { value: "primary", label: "Main color" },
        { value: "surface", label: "Light background" },
        { value: "none", label: "No background" },
      ],
      default: "primary",
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
  },

  i18n: {
    ro: {
      name: "Îndemn",
      category: "Secțiuni",
      description: "O propoziție și un buton pe o bandă colorată: „Rezervă o masă”, „Sună-ne”, „Înscrie-te”.",
      tip: "Pune-l la finalul paginii, după ce vizitatorul a aflat ce oferi; un singur buton convinge mai bine decât două.",
      props: {
        title: { label: "Titlu" },
        text: { label: "Text" },
        buttonText: { label: "Text buton" },
        buttonLink: { label: "Link buton" },
        button2Text: { label: "Text pentru al doilea buton", help: "Lasă gol dacă nu vrei al doilea buton." },
        button2Link: { label: "Link pentru al doilea buton" },
        background: { label: "Fundal", options: { primary: "Culoarea principală", surface: "Fundal deschis", none: "Fără fundal" } },
        align: { label: "Aliniere", options: { left: "Stânga", center: "Centru" } },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const background = BACKGROUNDS.includes(p.background) ? p.background : "primary";
    const align = ALIGNS.includes(p.align) ? p.align : "center";
    if (!p.title && !p.text && !p.buttonText) {
      return ctx.mode === "editor" ? html`<div class="b-block cta"><div class="b-container"><p class="cta__empty">${words.empty}</p></div></div>` : "";
    }
    return html`<section class="b-block cta cta--${background} cta--${align}">
      <div class="b-container cta__inner">
        <div class="cta__text">
          ${p.title ? html`<h2 class="cta__title">${inline(p.title)}</h2>` : ""}
          ${p.text ? html`<div class="cta__paragraphs">${paragraphs(p.text)}</div>` : ""}
        </div>
        ${p.buttonText || p.button2Text
          ? html`<div class="cta__buttons">
              ${p.buttonText ? html`<a class="b-btn cta__button" href="${url(p.buttonLink)}">${p.buttonText}</a>` : ""}
              ${p.button2Text ? html`<a class="b-btn b-btn--outline cta__button" href="${url(p.button2Link)}">${p.button2Text}</a>` : ""}
            </div>`
          : ""}
      </div>
    </section>`;
  },

  css: `
    .cta { align-self: stretch; }
    /* The band always has room to breathe, even inside a section. */
    .cta.cta { padding-block: 3.5rem; }
    .cta--primary { background: var(--primary); color: #fff; }
    .cta--surface { background: var(--surface); }
    .cta__inner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem 3rem; }
    .cta--center .cta__inner { flex-direction: column; justify-content: center; text-align: center; }
    .cta__text { max-width: 60ch; }
    .cta__title { margin-bottom: 0.3em; font-size: clamp(1.5rem, 3.2cqi, 2.1rem); }
    .cta__paragraphs { font-size: 1.1rem; opacity: 0.9; }
    .cta__paragraphs > :last-child { margin-bottom: 0; }
    .cta__buttons { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .cta--center .cta__buttons { justify-content: center; }
    .cta__button { padding: 0.95em 2em; font-size: 1.05rem; }
    .cta--primary .cta__button { background: #fff; border-color: #fff; color: var(--primary); }
    .cta--primary .cta__button.b-btn--outline { background: transparent; color: #fff; }
    .cta--primary a:not(.b-btn) { color: inherit; }
    .cta--primary .cta__button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
    .cta__button:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent); outline-offset: 3px; }
    .cta__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 720px) {
      .cta.cta { padding-block: 2.5rem; }
      .cta__inner { flex-direction: column; align-items: flex-start; }
      .cta--center .cta__inner { align-items: center; }
    }
  `,
};
