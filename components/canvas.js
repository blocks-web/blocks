import { html } from "../core/html.js";

// A canvas where blocks sit anywhere: you move them, resize them, shape them and layer them.
// The core does the grid, the cells and the stacking on phones (ctx.slot with { free: true }); this
// block only adds the background, the spacing, the width and the minimum height.
const SPACINGS = ["small", "medium", "large"];
const BACKGROUNDS = ["none", "surface", "primary"];
const WIDTHS = ["normal", "full"];

// An integer between min and max (as in safePlacement): a number written as text is accepted,
// anything else → fallback.
function integer(value, min, max, fallback) {
  const n = typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value) ? Number(value) : value;
  return typeof n === "number" && !Number.isNaN(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

export default {
  name: "Free canvas",
  category: "Sections",
  icon: "canvas",
  description: "Put blocks anywhere: move them, resize them, shape them and layer them.",
  tip: "Everything snaps to an invisible grid, so it lines up by itself; on phones, the blocks stack one under the other, from top to bottom.",

  props: {
    minRows: {
      type: "number",
      label: "Minimum height (rows)",
      min: 6,
      max: 60,
      step: 1,
      default: 12,
      help: "A grid row is about as tall as a short line of text, and it grows when the text needs room. The canvas grows by itself when you place blocks lower down.",
    },
    spacing: {
      type: "choice",
      label: "Spacing",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
      default: "medium",
      help: "How much room the canvas has: above, below and between the blocks.",
    },
    background: {
      type: "choice",
      label: "Background",
      options: [
        { value: "none", label: "No background" },
        { value: "surface", label: "Light background" },
        { value: "primary", label: "Main color" },
      ],
      default: "none",
    },
    width: {
      type: "choice",
      label: "Width",
      options: [
        { value: "normal", label: "Normal" },
        { value: "full", label: "Full width" },
      ],
      default: "normal",
    },
  },

  slots: { content: "Content" },

  i18n: {
    ro: {
      name: "Pânză liberă",
      category: "Secțiuni",
      description: "Pui blocurile oriunde: le muți, le mărești, le dai formă și le suprapui.",
      tip: "Totul se lipește de o grilă invizibilă, deci se aliniază singur; pe telefon, blocurile se așază unul sub altul, de sus în jos.",
      props: {
        minRows: {
          label: "Înălțime minimă (rânduri)",
          help: "Un rând al grilei e cât un rând scurt de text și crește când textul cere loc. Pânza crește singură când pui blocuri mai jos.",
        },
        spacing: {
          label: "Spațiu",
          help: "Cât aer are pânza: sus, jos și între blocuri.",
          options: { small: "Mic", medium: "Mediu", large: "Mare" },
        },
        background: { label: "Fundal", options: { none: "Fără fundal", surface: "Fundal deschis", primary: "Culoarea principală" } },
        width: { label: "Lățime", options: { normal: "Normală", full: "Toată lățimea" } },
      },
      slots: { content: "Conținut" },
    },
  },

  html(p, ctx) {
    // Only known values reach the classes; the height is an integer between 6 and 60.
    const spacing = SPACINGS.includes(p.spacing) ? p.spacing : "medium";
    const background = BACKGROUNDS.includes(p.background) ? p.background : "none";
    const width = WIDTHS.includes(p.width) ? p.width : "normal";
    const rows = integer(p.minRows, 6, 60, 12);
    return html`<section class="b-block canvas canvas--${background} canvas--${spacing} canvas--${width}" style="--canvas-rows:${rows}">
      <div class="${width === "full" ? "canvas__inner" : "b-container canvas__inner"}">${ctx.slot("content", { free: true })}</div>
    </section>`;
  },

  css: `
    .canvas { align-self: stretch; }
    .canvas.canvas--small { padding-block: 1.5rem; }
    .canvas.canvas--medium { padding-block: 3rem; }
    .canvas.canvas--large { padding-block: 5rem; }
    .canvas--small .b-grid { --b-grid-gap: 0.5rem; }
    .canvas--large .b-grid { --b-grid-gap: 1.5rem; }
    /* --b-grid-background: the background of a cell placed over a block with text (b-cell--over), the same as the canvas's. */
    .canvas--surface { background: var(--surface); --b-grid-background: var(--surface); }
    .canvas--primary { background: var(--primary); color: #fff; --b-grid-background: var(--primary); }
    .canvas--primary a:not(.b-btn) { color: inherit; }
    .canvas--primary .b-btn { background: #fff; border-color: #fff; color: var(--primary); }
    .canvas--primary .b-btn--outline { background: transparent; color: #fff; }
    .canvas.canvas--primary a:focus-visible, .canvas.canvas--primary button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
    .canvas--full .canvas__inner { width: calc(100% - 2rem); margin-inline: auto; }
    /* The minimum height, in grid rows; on phones the canvas is as tall as its blocks (640px = LIMITS.phone in core/render.js). */
    .canvas__inner { container-type: inline-size; }
    .canvas .b-grid { grid-template-rows: repeat(var(--canvas-rows, 12), minmax(2rem, auto)); }
    @container (width < 640px) { .canvas .b-grid { grid-template-rows: none; } }
    /* Empty, it leaves no gap in the page on the site; in the editor it shows its hint. */
    .canvas:not(:has(.b-cell, .b-empty)) { display: none; }
  `,
};
