import { html, paragraphs, url } from "../core/html.js";

// The “Extra” area (social media, opening hours, logos) sits between the links and the copyright line.

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { site: "My site", links: "Footer links" },
  ro: { site: "Site-ul meu", links: "Linkuri în subsol" },
};

export default {
  name: "Footer",
  category: "Page",
  icon: "footer",
  description: "The bottom of your site: a few words, links, the copyright line and an area for social media or opening hours.",
  tip: "Whatever you put in the “Extra” area (Social media, Opening hours, Logos) shows on every page; leave “Copyright” empty to show the site name with the year.",

  props: {
    text: {
      type: "longtext",
      label: "Text",
      default: "A few words about you or your business: what you do and where people can find you.",
    },
    links: {
      type: "list",
      label: "Links",
      fields: {
        text: { type: "text", label: "Text", default: "New page" },
        link: { type: "link", label: "Link", default: "/" },
      },
      default: [
        { text: "Home", link: "/" },
        { text: "Contact", link: "/contact" },
      ],
    },
    copyright: { type: "text", label: "Copyright", default: "", help: "Leave it empty for “© site name”." },
    showYear: { type: "checkbox", label: "Add the current year", default: true },
  },

  slots: { extra: "Extra" },

  i18n: {
    ro: {
      name: "Subsol",
      category: "Pagină",
      description: "Partea de jos a site-ului: câteva cuvinte, linkuri, drepturile de autor și o zonă pentru rețele sau program.",
      tip: "Tot ce pui în zona „Extra” (Rețele sociale, Program, Sigle) apare pe fiecare pagină; lasă „Drepturi de autor” gol și apare numele site-ului cu anul.",
      props: {
        text: { label: "Text" },
        links: {
          label: "Linkuri",
          fields: {
            text: { label: "Text" },
            link: { label: "Link" },
          },
        },
        copyright: { label: "Drepturi de autor", help: "Lasă gol pentru „© numele site-ului”." },
        showYear: { label: "Adaugă anul curent" },
      },
      slots: { extra: "Extra" },
    },
  },

  html(p, ctx) {
    const site = ctx.site || {};
    const words = WORDS[site.lang === "ro" ? "ro" : "en"];
    const name = site.name || words.site;
    const copyright = p.copyright || `© ${name}`;
    // A link to a page the static export leaves out (members only) isn't shown.
    const links = p.links.filter((l) => l.text && ctx.reachable(l.link));
    // The year is worked out when the page is rendered (in the static export: when it's exported).
    const year = p.showYear ? ` ${new Date().getFullYear()}` : "";

    return html`<footer class="footer">
      <div class="b-container">
        <div class="footer__top">
          <div class="footer__about">
            <p class="footer__name">${name}</p>
            ${paragraphs(p.text)}
          </div>
          ${links.length
            ? html`<nav class="footer__nav" aria-label="${words.links}">
                <ul class="footer__links">
                  ${links.map((l) => html`<li><a href="${url(l.link)}">${l.text}</a></li>`)}
                </ul>
              </nav>`
            : ""}
        </div>
        <div class="footer__extra">${ctx.slot("extra")}</div>
        <p class="footer__copyright">${copyright}${year}</p>
      </div>
    </footer>`;
  },

  css: `
    .footer { padding-block: 3rem 1.5rem; background: var(--surface); font-size: 0.95rem;
      border-top: 1px solid color-mix(in srgb, var(--text) 8%, transparent); }
    .footer__top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2rem 3rem; }
    .footer__about { flex: 1 1 280px; max-width: 46ch; }
    .footer__about p { color: color-mix(in srgb, var(--text) 82%, transparent); }
    .footer__about > :last-child { margin-bottom: 0; }
    .footer p.footer__name { margin-bottom: 0.5rem; color: var(--text); font-weight: 800; font-size: 1.1rem; }
    .footer__links { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; list-style: none; margin: 0; padding: 0; }
    .footer__links a { color: var(--text); font-weight: 500; text-decoration: none; }
    .footer__links a:hover { color: var(--primary); text-decoration: underline; }
    .footer a:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent); outline-offset: 3px; border-radius: 4px; }
    /* The “Extra” area: the blocks dragged here sit one under the other; empty, it takes no room. */
    .footer__extra { display: flex; flex-direction: column; gap: 1.25rem; }
    .footer__extra:has([data-c], .b-empty) { margin-top: 2rem; }
    .footer__extra .b-block { padding-block: 0; }
    .footer__copyright { margin: 2rem 0 0; padding-top: 1.25rem; font-size: 0.875rem;
      color: color-mix(in srgb, var(--text) 75%, transparent);
      border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent); }
  `,
};
