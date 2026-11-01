import { html } from "../core/html.js";

const HEIGHTS = ["small", "medium", "large", "x-large"];

export default {
  name: "Spacer",
  category: "Page",
  icon: "spacer",
  description: "Empty space between blocks, with a thin line if you like.",
  tip: "Blocks already have room between them; use a Spacer only when two sections without a background run into each other.",

  props: {
    height: {
      type: "choice",
      label: "Height",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
        { value: "x-large", label: "Extra large" },
      ],
      default: "medium",
    },
    line: { type: "checkbox", label: "Show a line in the middle", default: false },
  },

  i18n: {
    ro: {
      name: "Spațiu",
      category: "Pagină",
      description: "Spațiu gol între blocuri, cu o linie subțire dacă vrei.",
      tip: "Blocurile au deja aer între ele; folosește Spațiu doar când două secțiuni fără fundal se lipesc vizual.",
      props: {
        height: { label: "Înălțime", options: { small: "Mic", medium: "Mediu", large: "Mare", "x-large": "Foarte mare" } },
        line: { label: "Arată o linie la mijloc" },
      },
    },
  },

  html(p, ctx) {
    const height = HEIGHTS.includes(p.height) ? p.height : "medium";
    // In the editor it's visible, so it can be grabbed and moved.
    const editor = ctx.mode === "editor" ? "spacer--editor" : "";
    return html`<div class="spacer spacer--${height} ${editor}" aria-hidden="true">
      ${p.line ? html`<div class="b-container"><hr class="spacer__line"></div>` : ""}
    </div>`;
  },

  css: `
    .spacer { display: grid; align-content: center; flex-shrink: 0; align-self: stretch; height: 3rem; }
    .spacer--small { height: 1.5rem; }
    .spacer--large { height: 5rem; }
    .spacer--x-large { height: 8rem; }
    .spacer__line { border: 0; border-top: 1px solid color-mix(in srgb, var(--text) 15%, transparent); margin: 0; }
    .spacer--editor { background: repeating-linear-gradient(-45deg, transparent 0 8px, color-mix(in srgb, var(--text) 6%, transparent) 8px 9px); }
  `,
};
