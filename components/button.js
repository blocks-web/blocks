import { html, url } from "../core/html.js";

const STYLES = ["solid", "outline"];
const SIZES = ["normal", "large"];
const ALIGNS = ["left", "center", "right"];

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Write the button text." },
  ro: { empty: "Scrie textul butonului." },
};

export default {
  name: "Button",
  category: "Text & images",
  icon: "button",
  description: "A button that takes people to a page or to another site.",
  tip: "Say what happens when it's clicked (“See the menu”, not “Click here”); “Outline only” is for a second, less important button.",

  props: {
    text: { type: "text", label: "Text", default: "Learn more" },
    link: { type: "link", label: "Link", default: "/contact" },
    style: {
      type: "choice",
      label: "Style",
      options: [
        { value: "solid", label: "Solid" },
        { value: "outline", label: "Outline only" },
      ],
      default: "solid",
    },
    size: {
      type: "choice",
      label: "Size",
      options: [
        { value: "normal", label: "Normal" },
        { value: "large", label: "Large" },
      ],
      default: "normal",
    },
    align: {
      type: "choice",
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
      default: "left",
    },
  },

  i18n: {
    ro: {
      name: "Buton",
      category: "Text și imagini",
      description: "Un buton care duce la o pagină sau la alt site.",
      tip: "Scrie în el ce se întâmplă la apăsare („Vezi meniul”, nu „Click aici”); „Doar contur” e pentru al doilea buton, cel mai puțin important.",
      props: {
        text: { label: "Text" },
        link: { label: "Link" },
        style: { label: "Stil", options: { solid: "Plin", outline: "Doar contur" } },
        size: { label: "Mărime", options: { normal: "Normală", large: "Mare" } },
        align: { label: "Aliniere", options: { left: "Stânga", center: "Centru", right: "Dreapta" } },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    if (!p.text) return ctx.mode === "editor" ? html`<div class="b-block button"><div class="b-container button__empty">${words.empty}</div></div>` : "";
    const style = STYLES.includes(p.style) ? p.style : "solid";
    const size = SIZES.includes(p.size) ? p.size : "normal";
    const align = ALIGNS.includes(p.align) ? p.align : "left";
    const classes = `b-btn ${style === "outline" ? "b-btn--outline" : ""} button__btn button__btn--${size}`;
    return html`<div class="b-block button">
      <div class="b-container button__row button__row--${align}">
        ${p.link ? html`<a class="${classes}" href="${url(p.link)}">${p.text}</a>` : html`<span class="${classes}">${p.text}</span>`}
      </div>
    </div>`;
  },

  css: `
    .button__row { display: flex; }
    .button__row--center { justify-content: center; }
    .button__row--right { justify-content: flex-end; }
    .button__btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent); outline-offset: 3px; }
    .button__btn--large { padding: 0.95em 2em; font-size: 1.125rem; }
    .button__empty { padding: 0.75rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
  `,
};
