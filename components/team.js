import { html, inline, paragraphs, url } from "../core/html.js";

// The people behind the business: a round photo (or their initials, until you have photos), a name,
// a role and a few lines.
const COLUMNS = ["2", "3", "4"];

// The initials of a name, for when there's no photo: "Emma Carter" → "EC".
function initials(name) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0].toUpperCase())
    .join("");
}

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add people in the panel on the right." },
  ro: { empty: "Adaugă persoane din panoul din dreapta." },
};

export default {
  name: "Team",
  category: "Lists",
  icon: "team",
  description: "The people behind the business: a photo, a name, a role and a few lines about each.",
  tip: "Square photos with the face in the middle look best (they become round); without a photo their initials show, so the block works before you have photos.",

  props: {
    title: { type: "text", format: true, label: "Title", default: "The team", help: "Optional." },
    subtitle: { type: "longtext", label: "Subtitle", default: "Three people, one café. You'll find all of us behind the counter." },
    columns: {
      type: "choice",
      label: "People per row",
      options: [
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ],
      default: "3",
    },
    people: {
      type: "list",
      label: "People",
      fields: {
        image: { type: "image", label: "Photo", default: "", help: "Optional. Without a photo, their initials show." },
        name: { type: "text", label: "Name", default: "First Last" },
        role: { type: "text", label: "Role", default: "", help: "For example “Barista” or “Founder”." },
        text: { type: "longtext", label: "Text", default: "" },
        link: { type: "link", label: "Link", default: "", help: "Optional: a page or “mailto:ana@example.com”. The name links there." },
      },
      default: [
        {
          image: "",
          name: "Emma Carter",
          role: "Founder and head barista",
          text: "She opened Luna in 2019 with one espresso machine and three tables. She still picks the beans.",
          link: "",
        },
        { image: "", name: "Mike Russo", role: "Roaster", text: "He roasts the beans every Tuesday and knows every batch by heart.", link: "" },
        { image: "", name: "Anna Price", role: "Pastry chef", text: "The carrot cake is hers. So are the croissants, ready at 7 in the morning.", link: "" },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Echipă",
      category: "Liste",
      description: "Oamenii din spatele firmei: poză, nume, rol și câteva rânduri despre fiecare.",
      tip: "Pozele pătrate, cu fața la mijloc, arată cel mai bine (devin rotunde); fără poză apar inițialele, așa că blocul merge și până faci pozele.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        subtitle: { label: "Subtitlu" },
        columns: { label: "Persoane pe rând" },
        people: {
          label: "Persoane",
          fields: {
            image: { label: "Poză", help: "Opțional. Fără poză apar inițialele." },
            name: { label: "Nume" },
            role: { label: "Rol", help: "De exemplu „Barista” sau „Fondatoare”." },
            text: { label: "Text" },
            link: { label: "Link", help: "Opțional: o pagină sau „mailto:ana@exemplu.ro”. Numele duce acolo." },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const columns = COLUMNS.includes(String(p.columns)) ? String(p.columns) : "3";
    const people = p.people.filter((x) => x.name || x.image);
    if (!people.length && ctx.mode !== "editor") return "";

    const person = (x) => {
      const letters = initials(x.name);
      const name = x.link ? html`<a href="${url(x.link)}">${x.name}</a>` : x.name;
      return html`<li class="team__person">
        ${x.image
          ? html`<img class="team__photo" src="${url(x.image)}" alt="" loading="lazy" decoding="async">`
          : letters
            ? html`<span class="team__photo team__photo--initials" aria-hidden="true">${letters}</span>`
            : ""}
        ${x.name ? html`<h3 class="team__name">${name}</h3>` : ""}
        ${x.role ? html`<p class="team__role">${x.role}</p>` : ""}
        ${x.text ? html`<div class="team__text">${paragraphs(x.text)}</div>` : ""}
      </li>`;
    };

    return html`<div class="b-block team">
      <div class="b-container">
        ${p.title || p.subtitle
          ? html`<div class="team__intro">
              ${p.title ? html`<h2>${inline(p.title)}</h2>` : ""}
              ${paragraphs(p.subtitle)}
            </div>`
          : ""}
        ${people.length
          ? html`<ul class="team__grid team__grid--${columns}">${people.map(person)}</ul>`
          : html`<p class="team__empty">${words.empty}</p>`}
      </div>
    </div>`;
  },

  css: `
    .team { align-self: stretch; }
    .team__intro { max-width: 60ch; margin: 0 auto 2rem; text-align: center; }
    .team__intro > :last-child { margin-bottom: 0; }
    .team__intro p { opacity: 0.85; font-size: 1.1rem; }
    .team__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2rem 1.5rem; list-style: none; margin: 0; padding: 0; }
    .team__grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .team__grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .team__person { display: flex; flex-direction: column; align-items: center; min-width: 0; text-align: center; color: var(--text); }
    .team__photo { width: 7rem; height: 7rem; margin-bottom: 1rem; border-radius: 50%; object-fit: cover; }
    .team__photo--initials { display: grid; place-items: center; background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary);
      font-size: 2rem; font-weight: 700; }
    .team__name { margin-bottom: 0.15em; font-size: 1.15rem; }
    .team__name a { color: inherit; text-decoration: none; }
    .team__name a:hover { color: var(--primary); text-decoration: underline; }
    .team__role { margin-bottom: 0.6em; font-size: 0.9rem; font-weight: 600; color: var(--primary); }
    .team__text { font-size: 0.95rem; color: color-mix(in srgb, var(--text) 78%, transparent); }
    .team__text p { margin-bottom: 0.5em; }
    .team__text > :last-child { margin-bottom: 0; }
    .team a:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 60%, transparent); outline-offset: 2px; border-radius: 4px; }
    .team__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 960px) {
      .team__grid--3, .team__grid--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @container (max-width: 480px) {
      .team__grid.team__grid { grid-template-columns: minmax(0, 1fr); }
    }
  `,
};
