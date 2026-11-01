import { html, url } from "../core/html.js";

// A row of logos: partners, suppliers, “as seen in”. The logos keep their proportions: the height
// is fixed, the width comes from the image.
const HEIGHTS = ["small", "medium", "large"];

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add logos in the panel on the right." },
  ro: { empty: "Adaugă sigle din panoul din dreapta." },
};

export default {
  name: "Logos",
  category: "Sections",
  icon: "logos",
  description: "The logos of your partners, suppliers or sponsors, in a row.",
  tip: "Use logos with a transparent background (PNG or SVG); with “Black and white” on, the row looks even, however colorful the logos are.",

  props: {
    label: { type: "text", label: "Label", default: "Partners", help: "Optional. A word or two above the logos." },
    grayscale: { type: "checkbox", label: "Black and white (in color on hover)", default: true },
    height: {
      type: "choice",
      label: "Logo height",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
      default: "medium",
    },
    logos: {
      type: "list",
      label: "Logos",
      fields: {
        image: { type: "image", label: "Logo", default: "" },
        name: { type: "text", label: "Name", default: "", help: "The company's name: screen readers read it, and it shows if there's no image." },
        link: { type: "link", label: "Link", default: "", help: "Optional. It opens in a new tab." },
      },
      default: [
        { image: "/assets/demo/logos/north-roasters.svg", name: "North Roasters", link: "" },
        { image: "/assets/demo/logos/sunny-bakery.svg", name: "Sunny Bakery", link: "" },
        { image: "/assets/demo/logos/hillside-dairy.svg", name: "Hillside Dairy", link: "" },
        { image: "/assets/demo/logos/green-market.svg", name: "Green Market", link: "" },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Sigle",
      category: "Secțiuni",
      description: "Siglele partenerilor, furnizorilor sau sponsorilor, pe un rând.",
      tip: "Folosește sigle cu fundal transparent (PNG sau SVG); cu „Alb-negru” pornit, rândul arată unitar chiar dacă siglele sunt pestrițe.",
      props: {
        label: { label: "Etichetă", help: "Opțional. Un cuvânt-două deasupra siglelor." },
        grayscale: { label: "Alb-negru, colorate la trecerea mouse-ului" },
        height: { label: "Înălțimea siglelor", options: { small: "Mică", medium: "Medie", large: "Mare" } },
        logos: {
          label: "Sigle",
          fields: {
            image: { label: "Siglă" },
            name: { label: "Nume", help: "Numele firmei: îl citesc cititoarele de ecran și apare dacă lipsește imaginea." },
            link: { label: "Link", help: "Opțional. Se deschide într-o filă nouă." },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const height = HEIGHTS.includes(p.height) ? p.height : "medium";
    const logos = p.logos.filter((l) => l.image || l.name);
    if (!logos.length && ctx.mode !== "editor") return "";
    const logo = (l) => {
      // Without an image the name stays, so people can still see who it is.
      const content = l.image
        ? html`<img class="logos__image" src="${url(l.image)}" alt="${l.name}" loading="lazy" decoding="async">`
        : html`<span class="logos__name">${l.name}</span>`;
      return html`<li class="logos__item">
        ${l.link ? html`<a class="logos__link" href="${url(l.link)}" target="_blank" rel="noopener">${content}</a>` : content}
      </li>`;
    };
    return html`<div class="b-block logos logos--${height}${p.grayscale ? " logos--gray" : ""}">
      <div class="b-container">
        ${p.label ? html`<p class="logos__label">${p.label}</p>` : ""}
        ${logos.length
          ? html`<ul class="logos__list">${logos.map(logo)}</ul>`
          : html`<p class="logos__empty">${words.empty}</p>`}
      </div>
    </div>`;
  },

  css: `
    .logos { align-self: stretch; --logos-height: 2.75rem; text-align: center; }
    .logos--small { --logos-height: 2rem; }
    .logos--large { --logos-height: 3.75rem; }
    .logos__label { margin-bottom: 1.25rem; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
      color: color-mix(in srgb, var(--text) 60%, transparent); }
    .logos__list { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 1.5rem 3rem;
      list-style: none; margin: 0; padding: 0; }
    .logos__item { display: flex; align-items: center; min-width: 0; }
    .logos__link { display: block; border-radius: calc(var(--radius) * 0.5); }
    /* A fixed height, the width from the image, but never wider than a phone screen. */
    .logos__image { display: block; height: var(--logos-height); width: auto; max-width: min(12rem, 40cqi); object-fit: contain; }
    .logos__name { font-size: 1.05rem; font-weight: 600; }
    .logos--gray .logos__image, .logos--gray .logos__name { filter: grayscale(1); opacity: 0.65;
      transition: filter 0.15s ease-out, opacity 0.15s ease-out; }
    .logos--gray .logos__item:hover .logos__image, .logos--gray .logos__item:focus-within .logos__image,
    .logos--gray .logos__item:hover .logos__name, .logos--gray .logos__item:focus-within .logos__name { filter: none; opacity: 1; }
    .logos__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 560px) {
      .logos__list { gap: 1.25rem 2rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .logos--gray .logos__image, .logos--gray .logos__name { transition: none; }
    }
  `,
};
