import { html, inline, paragraphs } from "../core/html.js";

const ALIGNS = ["left", "center"];

export default {
  name: "Text",
  category: "Text & images",
  icon: "text",
  description: "A title and a few paragraphs.",
  tip: "An empty line starts a new paragraph, and a line that starts with “- ” becomes a list item; **bold**, *italic* and [link](/page) work in the title too.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "About us" },
    headingLevel: {
      type: "choice",
      label: "Title role",
      options: [
        { value: "h2", label: "Section title" },
        { value: "h1", label: "The page's main title" },
      ],
      default: "h2",
      help: "Every page should have a single main title (screen readers and search engines use it).",
    },
    text: {
      type: "longtext",
      label: "Text",
      default: "Write your text here.\n\nLeave an empty line to start a new paragraph.",
      help: "An empty line starts a new paragraph; a line that starts with “- ” becomes a list item.",
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

  i18n: {
    ro: {
      name: "Text",
      category: "Text și imagini",
      description: "Un titlu și câteva paragrafe.",
      tip: "Un rând gol începe un paragraf nou, iar un rând care începe cu „- ” devine element de listă; **îngroșat**, *înclinat* și [link](/pagina) merg și în titlu.",
      props: {
        title: { label: "Titlu" },
        headingLevel: {
          label: "Rolul titlului",
          help: "Fiecare pagină ar trebui să aibă un singur titlu principal (îl folosesc cititoarele de ecran și motoarele de căutare).",
          options: { h2: "Titlu de secțiune", h1: "Titlul principal al paginii" },
        },
        text: { label: "Text", help: "Un rând gol începe un paragraf nou; un rând care începe cu „- ” devine element de listă." },
        align: { label: "Aliniere", options: { left: "Stânga", center: "Centru" } },
      },
    },
  },

  html(p) {
    const align = ALIGNS.includes(p.align) ? p.align : "left";
    return html`<div class="b-block text text--${align}">
      <div class="b-container">
        <div class="text__inner">
          ${p.title ? (p.headingLevel === "h1" ? html`<h1>${inline(p.title)}</h1>` : html`<h2>${inline(p.title)}</h2>`) : ""}
          ${paragraphs(p.text)}
        </div>
      </div>
    </div>`;
  },

  css: `
    .text__inner { max-width: 70ch; }
    .text__inner > :last-child { margin-bottom: 0; }
    .text--center .text__inner { margin-inline: auto; text-align: center; }
  `,
};
