import { html, inline, paragraphs, url } from "../core/html.js";

export default {
  name: "Cover",
  category: "Sections",
  icon: "hero",
  description: "A big title at the top of the page, with text, buttons and, if you like, a background image.",
  tip: "Start the button with a verb (“Book a table”) and give the image room to breathe: the text turns white over it.",

  props: {
    // format: true → the title can have *italic* or **bold** (see inline in core/html.js).
    title: { type: "text", format: true, label: "Title", default: "Build something *beautiful*" },
    subtitle: {
      type: "longtext",
      label: "Subtitle",
      default: "A sentence or two that say clearly what you offer and why it matters.",
    },
    buttonText: { type: "text", label: "Button text", default: "Get started" },
    buttonLink: { type: "link", label: "Button link", default: "/contact" },
    button2Text: { type: "text", label: "Second button text", default: "", help: "Leave it empty if you don't want a second button." },
    button2Link: { type: "link", label: "Second button link", default: "#" },
    image: { type: "image", label: "Background image", default: "", help: "Optional. The text turns white over the image." },
    align: {
      type: "choice",
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
      ],
      default: "center",
    },
    height: {
      type: "choice",
      label: "Height",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "full", label: "Full screen" },
      ],
      default: "medium",
    },
  },

  i18n: {
    ro: {
      name: "Copertă",
      category: "Secțiuni",
      description: "Titlu mare la începutul paginii, cu text, butoane și, dacă vrei, o imagine pe fundal.",
      tip: "Începe butonul cu un verb („Rezervă o masă”) și lasă imaginea să respire: textul devine alb peste ea.",
      props: {
        title: { label: "Titlu" },
        subtitle: { label: "Subtitlu" },
        buttonText: { label: "Text buton" },
        buttonLink: { label: "Link buton" },
        button2Text: { label: "Text pentru al doilea buton", help: "Lasă gol dacă nu vrei al doilea buton." },
        button2Link: { label: "Link pentru al doilea buton" },
        image: { label: "Imagine de fundal", help: "Opțional. Textul devine alb peste imagine." },
        align: { label: "Aliniere", options: { left: "Stânga", center: "Centru" } },
        height: { label: "Înălțime", options: { small: "Mică", medium: "Medie", full: "Tot ecranul" } },
      },
    },
  },

  // `align` and `height` are always one of their options (the core makes sure of it), so they can go into classes.
  html(p) {
    const withImage = Boolean(p.image);
    return html`<section class="hero hero--${p.align} hero--${p.height} ${withImage ? "hero--image" : ""}">
      ${withImage ? html`<img class="hero__background" src="${url(p.image)}" alt="">` : ""}
      <div class="b-container hero__content">
        ${p.title ? html`<h1>${inline(p.title)}</h1>` : ""}
        ${p.subtitle ? html`<div class="hero__subtitle">${paragraphs(p.subtitle)}</div>` : ""}
        ${p.buttonText || p.button2Text
          ? html`<div class="hero__buttons">
              ${p.buttonText ? html`<a class="b-btn" href="${url(p.buttonLink)}">${p.buttonText}</a>` : ""}
              ${p.button2Text ? html`<a class="b-btn b-btn--outline" href="${url(p.button2Link)}">${p.button2Text}</a>` : ""}
            </div>`
          : ""}
      </div>
    </section>`;
  },

  css: `
    .hero { position: relative; display: flex; align-items: center; overflow: hidden;
      background: color-mix(in srgb, var(--primary) 8%, var(--background)); }
    .hero--small { min-height: 280px; padding-block: 3rem; }
    .hero--medium { min-height: 460px; padding-block: 4rem; }
    .hero--full { min-height: 100vh; padding-block: 4rem; }
    .hero__background { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .hero--image::after { content: ""; position: absolute; inset: 0; background: rgba(0, 0, 0, 0.45); }
    .hero__content { position: relative; z-index: 1; }
    .hero--image .hero__content { color: #fff; }
    .hero--image .b-btn--outline { color: #fff; border-color: #fff; }
    .hero h1 { font-size: clamp(2.2rem, 5cqi, 3.6rem); margin-bottom: 0.4em; }
    .hero h1 em { color: var(--primary); }
    .hero--image h1 em { color: inherit; }
    .hero__subtitle { font-size: 1.2rem; max-width: 60ch; opacity: 0.9; }
    .hero__subtitle > :last-child { margin-bottom: 0; }
    .hero__buttons { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.5rem; }
    .hero--center { text-align: center; }
    .hero--center .hero__subtitle { margin-inline: auto; }
    .hero--center .hero__buttons { justify-content: center; }
  `,
};
