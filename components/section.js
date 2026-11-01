import { html } from "../core/html.js";

// A container: other blocks are dragged inside it (the “content” area).
const COLOR = /^#[0-9a-f]{3,8}$/i;

export default {
  name: "Section",
  category: "Page",
  icon: "section",
  description: "A band with a background and some room around it, where you put other blocks.",
  tip: "Alternate sections with a light background and with no background to give the page a rhythm; “Main color” is for one section per page, the one with your call to action.",

  props: {
    background: {
      type: "choice",
      label: "Background",
      options: [
        { value: "none", label: "No background" },
        { value: "surface", label: "Light background" },
        { value: "primary", label: "Main color" },
        { value: "custom", label: "Custom color" },
      ],
      default: "surface",
    },
    color: {
      type: "color",
      label: "Custom color",
      default: "#fef3c7",
      help: "Only used when the background is “Custom color”.",
    },
    spacing: {
      type: "choice",
      label: "Space above and below",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
      default: "medium",
    },
    align: {
      type: "choice",
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
      ],
      default: "left",
    },
  },

  slots: { content: "Content" },

  i18n: {
    ro: {
      name: "Secțiune",
      category: "Pagină",
      description: "O bandă cu fundal și spațiu în jur, în care pui alte blocuri.",
      tip: "Alternează secțiuni cu fundal deschis și fără fundal ca pagina să aibă ritm; „Culoarea principală” e pentru o singură secțiune pe pagină, cea cu îndemnul.",
      props: {
        background: {
          label: "Fundal",
          options: { none: "Fără fundal", surface: "Fundal deschis", primary: "Culoarea principală", custom: "Culoare personalizată" },
        },
        color: { label: "Culoare personalizată", help: "Se folosește doar când fundalul e „Culoare personalizată”." },
        spacing: { label: "Spațiu sus și jos", options: { small: "Mic", medium: "Mediu", large: "Mare" } },
        align: { label: "Aliniere", options: { left: "Stânga", center: "Centru" } },
      },
      slots: { content: "Conținut" },
    },
  },

  html(p, ctx) {
    // Only hex colors (like #fef3c7) are accepted, so no other CSS can slip in.
    // A canvas inside the section covers its overlapping blocks with the same background (--b-grid-background).
    const custom = p.background === "custom" && COLOR.test(p.color) ? `background:${p.color};--b-grid-background:${p.color}` : "";
    return html`<section class="b-block section section--${p.background} section--${p.spacing} section--${p.align}" style="${custom}">
      <div class="b-container section__inner">${ctx.slot("content")}</div>
    </section>`;
  },

  css: `
    .section.section--small { padding-block: 1.5rem; }
    .section.section--medium { padding-block: 3.5rem; }
    .section.section--large { padding-block: 6rem; }
    .section--surface { background: var(--surface); --b-grid-background: var(--surface); }
    .section--primary { background: var(--primary); color: #fff; --b-grid-background: var(--primary); }
    .section--primary a:not(.b-btn) { color: inherit; }
    .section--primary .b-btn { background: #fff; border-color: #fff; color: var(--primary); }
    .section--primary .b-btn--outline { background: transparent; color: #fff; }
    .section.section--primary a:focus-visible, .section.section--primary button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
    .section__inner { display: flex; flex-direction: column; gap: 1.5rem; }
    .section--center .section__inner { align-items: center; text-align: center; }
    /* Empty, it leaves no band in the page on the site; in the editor it shows its hint (like the Free canvas). */
    .section:not(:has(> .section__inner > .b-slot > *)) { display: none; }
  `,
};
