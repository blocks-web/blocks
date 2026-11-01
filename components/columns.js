import { html } from "../core/html.js";

// Two to four columns, side by side. On a phone they stack one under the other.
const COUNTS = ["2", "3", "4"];
const SPACINGS = ["small", "medium", "large"];
const ALIGNS = ["top", "center", "bottom"];

export default {
  name: "Columns",
  category: "Page",
  icon: "columns",
  description: "Splits the row into 2, 3 or 4 columns; drag blocks into each one.",
  tip: "On phones the columns stack one under the other, in order; “Reverse the order on phones” is for when the image is on the right and you want it to come first.",

  props: {
    columns: {
      type: "choice",
      label: "Number of columns",
      options: [
        { value: "2", label: "2 columns" },
        { value: "3", label: "3 columns" },
        { value: "4", label: "4 columns" },
      ],
      default: "2",
    },
    spacing: {
      type: "choice",
      label: "Space between columns",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
      default: "medium",
    },
    align: {
      type: "choice",
      label: "Vertical alignment",
      options: [
        { value: "top", label: "Top" },
        { value: "center", label: "Center" },
        { value: "bottom", label: "Bottom" },
      ],
      default: "top",
    },
    reverseOnPhone: {
      type: "checkbox",
      label: "Reverse the order on phones",
      default: false,
      help: "On small screens, the last column comes first (handy when the image is on the right).",
    },
  },

  slots: { c1: "Column 1", c2: "Column 2", c3: "Column 3", c4: "Column 4" },

  i18n: {
    ro: {
      name: "Coloane",
      category: "Pagină",
      description: "Împarte rândul în 2, 3 sau 4 coloane și trage blocuri în fiecare.",
      tip: "Pe telefon coloanele se așază una sub alta, în ordine; „Inversează ordinea pe telefon” e pentru când imaginea e în dreapta și vrei să apară prima.",
      props: {
        columns: { label: "Număr de coloane", options: { 2: "2 coloane", 3: "3 coloane", 4: "4 coloane" } },
        spacing: { label: "Spațiu între coloane", options: { small: "Mic", medium: "Mediu", large: "Mare" } },
        align: { label: "Aliniere verticală", options: { top: "Sus", center: "Centru", bottom: "Jos" } },
        reverseOnPhone: {
          label: "Inversează ordinea pe telefon",
          help: "Pe ecrane mici, ultima coloană apare prima (util când imaginea e în dreapta).",
        },
      },
      slots: { c1: "Coloana 1", c2: "Coloana 2", c3: "Coloana 3", c4: "Coloana 4" },
    },
  },

  html(p, ctx) {
    // Only known values make it into the classes.
    const count = COUNTS.includes(String(p.columns)) ? String(p.columns) : "2";
    const spacing = SPACINGS.includes(p.spacing) ? p.spacing : "medium";
    const align = ALIGNS.includes(p.align) ? p.align : "top";
    const columns = [];
    for (let i = 1; i <= Number(count); i++) {
      columns.push(html`<div class="columns__col">${ctx.slot(`c${i}`)}</div>`);
    }
    return html`<div class="b-block columns">
      <div class="b-container">
        <div class="columns__grid columns__grid--${count} columns__grid--spacing-${spacing} columns__grid--${align} ${p.reverseOnPhone ? "columns__grid--reversed" : ""}">${columns}</div>
      </div>
    </div>`;
  },

  css: `
    .columns { align-self: stretch; }
    .columns__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem; }
    .columns__grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .columns__grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .columns__grid--spacing-small { gap: 1rem; }
    .columns__grid--spacing-large { gap: 3.5rem; }
    .columns__grid--top { align-items: start; }
    .columns__grid--center { align-items: center; }
    .columns__grid--bottom { align-items: end; }
    /* Every column is a container: a block inside it lays itself out by the column's width, not the screen's. */
    .columns__col { display: flex; flex-direction: column; gap: 1.25rem; min-width: 0; container-type: inline-size; }
    /* With no block in any column, the site doesn't show an empty gap in the page; in the editor every column has its hint. */
    .columns:not(:has(.columns__col > .b-slot > *)) { display: none; }
    @container (max-width: 960px) {
      .columns__grid--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @container (max-width: 720px) {
      .columns__grid.columns__grid { grid-template-columns: minmax(0, 1fr); }
      .columns__grid.columns__grid--reversed { display: flex; flex-direction: column-reverse; align-items: stretch; }
    }
  `,
};
