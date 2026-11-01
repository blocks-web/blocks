// The first half of the bundled blocks: Button, Cards, Numbers, Quote, Embed code, Columns, My account,
// Members only, Team, Cover, Events, Form, Contact form, Gallery, Map, Image, Image and text, Call to action
// and Sign up. Names, icons and categories, the Romanian editor texts (i18n.ro), clean rendering in every
// mode with the defaults and with everything empty, escaping, what each block does on its own, and the
// form's server side (form.server.js).
//
// The blocks are copied into a temporary project (with core/), so the other bundled blocks don't matter here.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createProject } from "../server/project.js";
import { startServer } from "../server/server.js";
import { renderParts, validateComponent } from "../core/render.js";
import { componentSource, cookieFrom, makeProject, PROJECT_ROOT, removeProject, sendJson, writeFiles } from "./helpers.js";

// id → [icon, palette category]
const EXPECTED = {
  button: ["button", "Text & images"],
  cards: ["cards", "Sections"],
  stats: ["stats", "Sections"],
  quote: ["quote", "Text & images"],
  embed: ["code", "Page"],
  columns: ["columns", "Page"],
  account: ["account", "Members"],
  "members-only": ["members", "Members"],
  team: ["team", "Lists"],
  hero: ["hero", "Sections"],
  events: ["events", "Lists"],
  form: ["form", "Contact"],
  "contact-form": ["form", "Contact"],
  gallery: ["gallery", "Text & images"],
  map: ["map", "Contact"],
  image: ["image", "Text & images"],
  "image-text": ["image-text", "Sections"],
  cta: ["cta", "Sections"],
  signup: ["signup", "Members"],
};

const NAMES = {
  button: "Button",
  cards: "Cards",
  stats: "Numbers",
  quote: "Quote",
  embed: "Embed code",
  columns: "Columns",
  account: "My account",
  "members-only": "Members only",
  team: "Team",
  hero: "Cover",
  events: "Events",
  form: "Form",
  "contact-form": "Contact form",
  gallery: "Gallery",
  map: "Map",
  image: "Image",
  "image-text": "Image and text",
  cta: "Call to action",
  signup: "Sign up",
};

// Icon names are the ids of the bundled blocks, plus a few generic ones (docs/DESIGN.md, “Icons”).
const ICONS = [
  ..."button cards stats quote embed columns account members-only team hero events form contact-form gallery map image image-text cta signup".split(" "),
  ..."faq timeline list locations login navbar canvas press pricing hours social section logos spacer news footer text video".split(" "),
  ..."heading members link star calendar code block".split(" "),
];

// The palette categories and their Romanian names.
const CATEGORIES = {
  Sections: "Secțiuni",
  "Text & images": "Text și imagini",
  Lists: "Liste",
  Contact: "Contact",
  Members: "Membri",
  Page: "Pagină",
};

// s and t with a cedilla (U+015E/F, U+0162/3), which Romanian doesn't use: it writes ș ț, with a comma below.
const CEDILLA = new RegExp(`[${String.fromCharCode(0x15e, 0x15f, 0x162, 0x163)}]`);
const ROMANIAN_LETTERS = /[ăâîșțĂÂÎȘȚ]/;

const FILES = [...Object.keys(EXPECTED).map((id) => `${id}.js`), "form.server.js", "contact-form.server.js"];

// A plain block to drag into areas.
const NOTE = componentSource(`{ name: "Note", html: () => html\`<p class="note">A note</p>\` }`);

const MODES = ["editor", "site", "static"];
const SITE = { name: "Luna Café", loginPage: "/login" };
const RO = { ...SITE, lang: "ro" };
const ANA = { id: "u", name: "Ana", email: "ana@example.com" };
const BAD = "<script>alert(1)</script>";
const JS = "javascript:alert(1)";

// Today (local time) as "YYYY-MM-DD", the way the Events block works it out.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let root;
let components;
before(async () => {
  root = makeProject({ "components/note.js": NOTE });
  for (const file of FILES) cpSync(join(PROJECT_ROOT, "components", file), join(root, "components", file));
  components = await createProject(root, { warn: assert.fail, error: assert.fail }).loadComponents();
});
after(() => removeProject(root));

// Renders a single block and returns only what's inside its wrapper.
function render(type, props = {}, mode = "site", { site = SITE, slots, user = null } = {}) {
  const errors = [];
  const { body } = renderParts({
    page: { blocks: [{ id: "x", type, props, slots }] },
    site,
    components,
    mode,
    user,
    onError: (e) => errors.push(e),
  });
  assert.deepEqual(errors, [], `${type} (${mode})`);
  return body.match(/data-id="x">([^]*)<\/div><\/div><\/main>/)[1];
}

// "Empty" settings: lists without items, empty texts, checkboxes off.
function empty(type) {
  return Object.fromEntries(
    Object.entries(components[type].props).map(([key, field]) => [key, field.type === "list" ? [] : field.type === "checkbox" ? false : ""]),
  );
}

describe("the first half of the bundled blocks", () => {
  test("each has its English name, a named icon, a palette category, a description and a tip", () => {
    assert.deepEqual(
      Object.keys(components).filter((id) => id !== "note").sort(),
      Object.keys(EXPECTED).sort(),
    );
    for (const [id, [icon, category]] of Object.entries(EXPECTED)) {
      const c = components[id];
      assert.equal(c.name, NAMES[id], id);
      assert.equal(c.icon, icon, id);
      assert.ok(ICONS.includes(icon), `${id}: “${icon}” isn't a known icon name`);
      assert.equal(c.category, category, id);
      assert.ok(Object.hasOwn(CATEGORIES, category), `${id}: the category “${category}” isn't in the palette`);
      for (const key of ["description", "tip"]) {
        assert.equal(typeof c[key], "string", `${id}.${key}`);
        assert.match(c[key], /^\S.*\.$/, `${id}.${key}: a sentence that ends with a period`);
        assert.ok(!c[key].includes("\n"), `${id}.${key}: on a single line`);
      }
    }
  });

  test("none has warnings from validateComponent", () => {
    for (const id of Object.keys(EXPECTED)) assert.deepEqual(validateComponent(components[id]), [], id);
  });

  test("i18n.ro has the Romanian editor texts: name, category, description, tip, every setting, option and area", () => {
    // Options whose labels are only digits ("2", "3") read the same in both languages.
    const needsWords = (field) => field.type === "choice" && field.options.some((o) => typeof o === "object" && !/^\d+$/.test(o.label));
    const settings = (schema, texts, where) => {
      assert.deepEqual(Object.keys(texts || {}).sort(), Object.keys(schema).sort(), `${where}: the same settings`);
      for (const [key, field] of Object.entries(schema)) {
        const t = texts[key];
        assert.ok(typeof t.label === "string" && t.label.trim(), `${where}.${key}: label`);
        assert.equal(typeof t.help === "string", typeof field.help === "string", `${where}.${key}: help`);
        if (needsWords(field) || t.options) {
          assert.deepEqual(Object.keys(t.options || {}).sort(), field.options.map((o) => o.value).sort(), `${where}.${key}: options`);
        }
        if (field.type === "list") settings(field.fields, t.fields, `${where}.${key}`);
      }
    };
    for (const id of Object.keys(EXPECTED)) {
      const c = components[id];
      const ro = c.i18n?.ro;
      assert.ok(ro && typeof ro === "object", `${id}: i18n.ro`);
      assert.equal(ro.category, CATEGORIES[c.category], id);
      for (const key of ["name", "description", "tip"]) assert.ok(typeof ro[key] === "string" && ro[key].trim(), `${id}: i18n.ro.${key}`);
      for (const key of ["description", "tip"]) assert.match(ro[key], /^\S.*\.$/, `${id}: i18n.ro.${key}`);
      assert.notEqual(ro.name, c.name, id);
      settings(c.props, ro.props, id);
      assert.deepEqual(Object.keys(ro.slots || {}).sort(), Object.keys(c.slots || {}).sort(), `${id}: areas`);
      for (const [key, label] of Object.entries(ro.slots || {})) assert.ok(typeof label === "string" && label.trim(), `${id}: area ${key}`);
      assert.ok(!CEDILLA.test(JSON.stringify(c.i18n)), `${id}: ș and ț with a comma below, not a cedilla`);
      // And the English texts are English.
      const english = JSON.stringify({ name: c.name, description: c.description, tip: c.tip, props: c.props, slots: c.slots });
      assert.ok(!ROMANIAN_LETTERS.test(english), `${id}: Romanian letters in the English texts`);
    }
  });

  test("each renders with its defaults and with everything empty, in every mode, on an English and a Romanian site", () => {
    for (const id of Object.keys(EXPECTED)) {
      for (const site of [SITE, RO]) {
        for (const mode of MODES) {
          const user = mode === "site" ? ANA : null;
          const out = render(id, {}, mode, { site, user });
          if (mode === "editor") assert.ok(out.trim(), `${id}: something shows in the editor`);
          render(id, empty(id), mode, { site, user });
        }
      }
    }
  });

  test("no choice or number lets a class or a style slip in: a hostile value falls back to the default", () => {
    const HOSTILE = 'left zz-sneaky b-cell--circle" style="color:red';
    for (const id of Object.keys(EXPECTED)) {
      const props = {};
      for (const [key, field] of Object.entries(components[id].props || {})) {
        if (field.type === "choice" || field.type === "number") props[key] = HOSTILE;
        if (field.type === "list") {
          const item = {};
          for (const [k, f] of Object.entries(field.fields || {})) if (f.type === "choice" || f.type === "number") item[k] = HOSTILE;
          props[key] = [item, item];
        }
      }
      for (const mode of MODES) {
        const out = render(id, props, mode);
        assert.ok(!out.includes("zz-sneaky") && !out.includes("color:red"), `${id} (${mode})`);
      }
    }
  });

  test("the words a block writes by itself follow the site's language: English by default, Romanian with lang “ro”", () => {
    const cases = [
      ["button", { text: "" }, "editor", "Write the button text.", "Scrie textul butonului."],
      ["cards", { cards: [] }, "editor", "Add cards in the panel on the right.", "Adaugă carduri din panoul din dreapta."],
      ["stats", { stats: [] }, "editor", "Add numbers in the panel on the right.", "Adaugă cifre din panoul din dreapta."],
      ["team", { people: [] }, "editor", "Add people in the panel on the right.", "Adaugă persoane din panoul din dreapta."],
      ["gallery", { images: [] }, "editor", "Add images in the panel on the right.", "Adaugă imagini din panoul din dreapta."],
      ["form", { fields: [{ label: "Phone", type: "phone", required: false }] }, "site", "(optional)", "(opțional)"],
      ["form", {}, "editor", "open the page with “View page” to try it", "încearcă-l pe site"],
      ["members-only", {}, "editor", "Only visible to logged-in members", "Vizibil doar pentru membrii intrați în cont"],
      ["account", {}, "editor", "(example in the editor)", "(exemplu în editor)"],
      ["map", { showMap: true }, "site", 'title="Map: 12 Linden Street"', 'title="Hartă: 12 Linden Street"'],
      ["map", { showMap: true }, "editor", "<strong>Google map</strong>", "<strong>Hartă Google</strong>"],
      ["embed", { code: "<p>Hi</p>" }, "editor", 'title="Embed code"', 'title="Cod HTML"'],
      ["embed", {}, "editor", "Paste the HTML code of a widget (bookings, reviews…) in the panel on the right.", "Lipește codul HTML al unui widget (rezervări, recenzii…) în panoul din dreapta."],
      ["signup", {}, "site", "Confirm password", "Repetă parola"],
      ["signup", {}, "site", "At least 15 characters.", "Cel puțin 15 caractere."],
      ["events", { events: [{ date: "2099-12-01", title: "Fair" }] }, "site", ">Dec</span>", ">dec</span>"],
      ["cta", { title: "", text: "", buttonText: "" }, "editor", "Write the title and the button text", "Scrie titlul și textul butonului"],
    ];
    for (const [id, props, mode, english, romanian] of cases) {
      const en = render(id, props, mode);
      const ro = render(id, props, mode, { site: RO });
      assert.ok(en.includes(english) && !en.includes(romanian), `${id}: ${english}`);
      assert.ok(ro.includes(romanian) && !ro.includes(english), `${id}: ${romanian}`);
    }
  });

  test("blocks lay themselves out by their container (container queries, cqi), not by the screen width", () => {
    for (const id of Object.keys(EXPECTED)) {
      const css = String(components[id].css || "");
      // Only the gallery's window, which covers the whole screen, depends on the screen.
      assert.equal([...css.matchAll(/@media \(max-width/g)].length, id === "gallery" ? 1 : 0, id);
      assert.ok(!/\d(\.\d+)?vw/.test(css), `${id}: vw instead of cqi`);
    }
  });
});

describe("empty blocks and lists", () => {
  test("empty: nothing on the site or in the static export, a friendly hint only in the editor", () => {
    for (const id of ["stats", "team", "events", "form", "cards", "gallery", "cta", "map", "image-text", "quote", "image"]) {
      assert.equal(render(id, empty(id), "site"), "", id);
      assert.equal(render(id, empty(id), "static"), "", id);
      const editor = render(id, empty(id), "editor");
      assert.ok(editor.includes(`class="${id}__empty"`), `${id}: a hint in the editor`);
      assert.match(editor, /in the panel on the right\./, id);
    }
    for (const id of ["button", "embed"]) {
      assert.equal(render(id, empty(id), "site"), "", id);
      assert.ok(render(id, empty(id), "editor").includes(`${id}__empty`), id);
    }
  });

  test("a list of empty items is like an empty list", () => {
    assert.equal(render("stats", { stats: [{ value: "", label: "" }] }), "");
    assert.equal(render("team", { people: [{ name: "", image: "", role: "Barista" }] }), "");
    assert.equal(render("events", { events: [{ title: "", text: "", date: "2099-01-01" }] }), "");
    assert.equal(render("form", { fields: [{ label: "  ", type: "text" }] }), "");
    assert.equal(render("cards", { cards: [{ title: "", text: "", image: "", link: "/x" }] }), "");
    assert.equal(render("gallery", { images: [{ image: "", description: "x" }] }), "");
  });

  test("bad texts: <script> shows as text, never as a tag", () => {
    const cases = {
      button: { text: BAD },
      cards: { title: BAD, subtitle: BAD, cards: [{ title: BAD, text: BAD, linkText: BAD, link: "/x" }] },
      stats: { stats: [{ value: BAD, label: BAD }] },
      quote: { text: BAD, author: BAD, role: BAD },
      account: { greeting: BAD, guestMessage: BAD, logoutText: BAD, loginText: BAD },
      team: { title: BAD, subtitle: BAD, people: [{ image: "/a.svg", name: BAD, role: BAD, text: BAD, link: "/x" }] },
      hero: { title: BAD, subtitle: BAD, buttonText: BAD, button2Text: BAD },
      events: { title: BAD, events: [{ date: BAD, time: BAD, title: BAD, place: BAD, text: BAD, buttonText: BAD, link: "/x" }] },
      form: { title: BAD, text: BAD, buttonText: BAD, fields: [{ label: BAD, type: "choice", options: `${BAD},b` }, { label: BAD, type: BAD }] },
      gallery: { title: BAD, images: [{ image: "/a.svg", description: BAD }] },
      map: { address: BAD, linkText: BAD, showMap: true },
      image: { alt: BAD, caption: BAD },
      "image-text": { image: "/a.svg", alt: BAD, title: BAD, text: BAD, buttonText: BAD },
      cta: { title: BAD, text: BAD, buttonText: BAD, button2Text: BAD },
      signup: { title: BAD, loginQuestion: BAD, loginLinkText: BAD, buttonText: BAD },
    };
    for (const [id, props] of Object.entries(cases)) {
      for (const mode of MODES) {
        const out = render(id, props, mode);
        assert.ok(!out.includes("<script"), `${id} (${mode})`);
        assert.ok(out.includes("&lt;script&gt;"), `${id} (${mode}): the text stays visible, escaped`);
      }
    }
  });

  test("javascript: links become “#” everywhere (href and src)", () => {
    const cases = {
      button: { text: "Go", link: JS },
      cards: { cards: [{ title: "T", image: JS, linkText: "More", link: JS }] },
      quote: { image: JS },
      team: { people: [{ name: "Ana", image: JS, link: JS }] },
      hero: { image: JS, buttonText: "A", buttonLink: JS, button2Text: "B", button2Link: JS },
      events: { events: [{ title: "E", date: "2099-01-01", buttonText: "Come", link: JS }] },
      gallery: { images: [{ image: JS, description: "x" }] },
      image: { src: JS, link: JS },
      "image-text": { image: JS, buttonText: "A", buttonLink: JS },
      cta: { buttonText: "A", buttonLink: JS, button2Text: "B", button2Link: JS },
      signup: { loginLink: JS },
    };
    for (const [id, props] of Object.entries(cases)) {
      const out = render(id, props);
      assert.ok(!out.includes("javascript:"), id);
      assert.ok(out.includes('href="#"') || out.includes('src="#"'), id);
    }
    const site = { loginPage: JS };
    assert.ok(render("account", {}, "site", { site }).includes('href="#"'));
    assert.ok(render("members-only", {}, "site", { site, slots: { content: [{ id: "n", type: "note" }] } }).includes('href="#"'));
  });
});

describe("Button", () => {
  test("a link or, without a link, plain text; the style, size and alignment as classes", () => {
    const out = render("button", { text: "See the menu", link: "/products", style: "outline", size: "large", align: "right" });
    assert.ok(out.includes('<div class="b-container button__row button__row--right">'));
    assert.ok(out.includes('<a class="b-btn b-btn--outline button__btn button__btn--large" href="/products">See the menu</a>'));
    const plain = render("button", { link: "" });
    assert.match(plain, /<span class="b-btn +button__btn button__btn--normal">Learn more<\/span>/);
    assert.ok(plain.includes("button__row--left"));
    assert.equal(render("button", { text: "" }), "");
  });
});

describe("Cards", () => {
  test("a link without link text makes the title the link; with link text, a link under the text", () => {
    const out = render("cards", {
      columns: "2",
      cards: [
        { title: "Coffee", text: "", image: "", linkText: "", link: "/products" },
        { title: "Cake", text: "", image: "/cake.svg", linkText: "More", link: "/cakes" },
      ],
    });
    assert.ok(out.includes('<ul class="cards__grid cards__grid--2">'));
    assert.ok(out.includes('<h3 class="cards__title"><a href="/products">Coffee</a></h3>'));
    assert.ok(out.includes('<img class="cards__image" src="/cake.svg" alt="" loading="lazy" decoding="async">'));
    assert.ok(out.includes('<a class="cards__link" href="/cakes">More<span aria-hidden="true"> →</span></a>'));
    assert.ok(render("cards", { columns: "5" }).includes("cards__grid--3"));
    assert.ok(render("cards").includes('href="/products"'), "the default link points to the English page");
  });
});

describe("Numbers", () => {
  test("a class for how many numbers there are (2–6), the style and the alignment; unknown values fall back to the defaults", () => {
    const four = render("stats");
    assert.ok(four.includes('class="b-block stats stats--lines stats--center"'));
    assert.ok(four.includes('<ul class="stats__list stats__list--4">'));
    assert.ok(four.includes('<strong class="stats__value">2019</strong>'));
    assert.ok(four.includes('<span class="stats__label">the year we opened</span>'));
    const two = render("stats", { style: "cards", align: "left", stats: [{ value: "20+", label: "years" }, { value: "3" }] });
    assert.ok(two.includes("stats--cards stats--left"));
    assert.ok(two.includes("stats__list--2"));
    assert.ok(render("stats", { style: "neon", align: "top" }).includes("stats--lines stats--center"));
  });

  test("a single number, or more than six: no column class, the grid manages on its own", () => {
    assert.ok(render("stats", { stats: [{ value: "1", label: "x" }] }).includes('<ul class="stats__list">'));
    const seven = render("stats", { stats: Array.from({ length: 7 }, (_, i) => ({ value: String(i), label: "x" })) });
    assert.ok(seven.includes('<ul class="stats__list">'));
    assert.equal(seven.split("stats__item").length - 1, 7);
  });
});

describe("Quote", () => {
  test("the text with paragraphs, the author with a photo or their initials, and who they are", () => {
    const out = render("quote", { text: "The *best* place\n\nTruly.", author: "Ioana Dima", role: "A regular" });
    assert.ok(out.includes('<blockquote class="quote__text"><p>The <em>best</em> place</p><p>Truly.</p></blockquote>'));
    assert.ok(out.includes('<span class="quote__photo quote__photo--initials" aria-hidden="true">ID</span>'));
    assert.ok(out.includes('<strong class="quote__name">Ioana Dima</strong>'));
    assert.ok(out.includes('<span class="quote__role">A regular</span>'));
    assert.ok(render("quote", { image: "/ana.jpg" }).includes('<img class="quote__photo" src="/ana.jpg" alt="" loading="lazy" decoding="async">'));
    assert.ok(!render("quote", { author: "", role: "" }).includes("quote__author"));
  });
});

describe("Team", () => {
  test("a round photo or initials, a name with a link, a role, a text with paragraphs; the columns as a class", () => {
    const out = render("team", {
      title: "Our *team*",
      subtitle: "",
      columns: "4",
      people: [
        { image: "/a.jpg", name: "Ioana Dima", role: "Barista", text: "One\n\nTwo", link: "mailto:ioana@example.com" },
        { image: "", name: "mihai", role: "", text: "", link: "" },
        { image: "", name: "Ana-Maria Pop Ionescu", role: "", text: "", link: "/about" },
      ],
    });
    assert.ok(out.includes("<h2>Our <em>team</em></h2>"));
    assert.ok(out.includes('<ul class="team__grid team__grid--4">'));
    assert.ok(out.includes('<img class="team__photo" src="/a.jpg" alt="" loading="lazy" decoding="async">'));
    assert.ok(out.includes('<h3 class="team__name"><a href="mailto:ioana@example.com">Ioana Dima</a></h3>'));
    assert.ok(out.includes('<p class="team__role">Barista</p>'));
    assert.ok(out.includes('<div class="team__text"><p>One</p><p>Two</p></div>'));
    assert.ok(out.includes('<span class="team__photo team__photo--initials" aria-hidden="true">M</span>'));
    assert.ok(out.includes('aria-hidden="true">AP</span>'));
    assert.ok(out.includes('<h3 class="team__name"><a href="/about">Ana-Maria Pop Ionescu</a></h3>'));
    assert.ok(render("team", { columns: "9" }).includes("team__grid--3"));
  });
});

describe("Cover", () => {
  test("the title with *emphasis*, the subtitle with paragraphs, one or two buttons, the image behind", () => {
    const out = render("hero", { title: "Good *coffee*", subtitle: "One **two**\n\nThree", button2Text: "Menu", button2Link: "/products" });
    assert.ok(out.includes('<section class="hero hero--center hero--medium ">'));
    assert.ok(out.includes("<h1>Good <em>coffee</em></h1>"));
    assert.ok(out.includes('<div class="hero__subtitle"><p>One <strong>two</strong></p><p>Three</p></div>'));
    assert.ok(out.includes('<a class="b-btn" href="/contact">Get started</a>'));
    assert.ok(out.includes('<a class="b-btn b-btn--outline" href="/products">Menu</a>'));
    const image = render("hero", { image: "/cafe.jpg", align: "left", height: "full" });
    assert.ok(image.includes('<section class="hero hero--left hero--full hero--image">'));
    assert.ok(image.includes('<img class="hero__background" src="/cafe.jpg" alt="">'));
    assert.ok(render("hero", { align: "top", height: "giant" }).includes("hero--center hero--medium"));
    assert.equal(components.hero.props.title.format, true);
  });
});

describe("Events", () => {
  const events = [
    { date: "2099-12-01", time: "7 pm", title: "Far", place: "Terrace", text: "a", buttonText: "Come", link: "/contact" },
    { date: "2000-01-01", time: "", title: "Past", place: "", text: "b", buttonText: "", link: "" },
    { date: "not a date", time: "", title: "No date", place: "", text: "c", buttonText: "", link: "" },
    { date: "2099-03-05", time: "from 10 am", title: "Soon", place: "", text: "", buttonText: "Come", link: "" },
    { date: today(), time: "", title: "Today", place: "", text: "", buttonText: "", link: "" },
  ];
  const titles = (out) => [...out.matchAll(/<h3 class="events__title">([^<]+)/g)].map((m) => m[1]);

  test("on the site: soonest first, today shows, past ones disappear, no valid date at the end", () => {
    const out = render("events", { events });
    assert.deepEqual(titles(out), ["Today", "Soon", "Far", "No date"]);
    assert.ok(out.includes('<time class="events__date" datetime="2099-12-01"><span class="events__day">1</span><span class="events__month">Dec</span></time>'));
    assert.ok(out.includes('<p class="events__meta">7 pm <span aria-hidden="true">·</span> Terrace</p>'));
    assert.ok(out.includes('<p class="events__meta">from 10 am</p>'));
    assert.ok(out.includes('<a class="b-btn b-btn--outline events__button" href="/contact">Come</a>'));
    // A button without a link doesn't show.
    assert.equal(out.split("events__button").length - 1, 1);
    assert.ok(out.includes('<span class="events__date events__date--none" aria-hidden="true"></span>'));
    assert.equal(render("events", { events: [events[1]] }), "");
    assert.equal(render("events", { events: [events[1]] }, "static"), "");
  });

  test("with “Hide past events” off they all show; in the editor they all show, the past ones marked", () => {
    assert.deepEqual(titles(render("events", { events, hidePast: false })), ["Past", "Today", "Soon", "Far", "No date"]);
    const editor = render("events", { events }, "editor");
    assert.deepEqual(titles(editor), ["Past", "Today", "Soon", "Far", "No date"]);
    assert.equal(editor.split("events__item--past").length - 1, 1);
    assert.ok(editor.includes("This has passed: it no longer shows on the site."));
    assert.ok(!render("events", { events, hidePast: false }, "editor").includes("events__item--past"));
  });

  test("the defaults are in the future, so the block shows something right away", () => {
    for (const e of components.events.props.events.default) assert.ok(e.date > today(), e.title);
    assert.equal(titles(render("events")).length, 3);
  });
});

describe("Call to action", () => {
  test("a formatted title, text with paragraphs, one or two buttons; the background and alignment as classes", () => {
    const out = render("cta", {
      title: "Book *today*",
      text: "One\n\nTwo",
      buttonText: "Call",
      buttonLink: "tel:+40700000000",
      button2Text: "Write",
      button2Link: "/contact",
      background: "surface",
      align: "left",
    });
    assert.ok(out.includes('<section class="b-block cta cta--surface cta--left">'));
    assert.ok(out.includes('<h2 class="cta__title">Book <em>today</em></h2>'));
    assert.ok(out.includes('<div class="cta__paragraphs"><p>One</p><p>Two</p></div>'));
    assert.ok(out.includes('<a class="b-btn cta__button" href="tel:+40700000000">Call</a>'));
    assert.ok(out.includes('<a class="b-btn b-btn--outline cta__button" href="/contact">Write</a>'));
    const one = render("cta");
    assert.ok(one.includes("cta--primary cta--center"));
    assert.equal(one.split('cta__button"').length - 1, 1);
    assert.ok(render("cta", { background: "pink", align: "bottom" }).includes("cta--primary cta--center"));
  });
});

describe("Image", () => {
  test("the description as alt, the width and the rounded corners as classes, a link around the image", () => {
    const out = render("image", { src: "/a.jpg", alt: "A cup", width: "small", rounded: true, link: "/products" });
    assert.ok(out.includes('<figure class="image__figure image__figure--small image__figure--rounded">'));
    assert.ok(out.includes('<a class="image__link" href="/products"><img class="image__img" src="/a.jpg" alt="A cup" loading="lazy" decoding="async"></a>'));
    assert.ok(render("image", { width: "huge", rounded: false }).includes('class="image__figure image__figure--medium "'));
    // On a canvas, over an image that fills its cell, the caption sits on the image.
    assert.ok(components.image.css.includes(".b-cell--fill .image__caption"));
  });

  test("the caption accepts formatting and stays escaped", () => {
    const out = render("image", { caption: "Photo: [Ana](https://ana.example.com) <b>" });
    assert.ok(out.includes('Photo: <a href="https://ana.example.com" target="_blank" rel="noopener">Ana</a> &lt;b&gt;</figcaption>'));
    for (const [id, key] of [["cards", "title"], ["image", "caption"], ["team", "title"], ["events", "title"], ["cta", "title"], ["image-text", "title"], ["form", "title"]]) {
      assert.equal(components[id].props[key].format, true, `${id}.${key}`);
    }
    assert.ok(render("cards", { title: "What **you'll find**" }).includes("<h2>What <strong>you&#39;ll find</strong></h2>"));
  });
});

describe("Image and text", () => {
  test("the image with its description, a formatted title, paragraphs, a button; the position and width as classes", () => {
    const out = render("image-text", { position: "right", width: "third", title: "About *us*", text: "One\n\nTwo", alt: "Espresso machine", buttonText: "See", buttonLink: "/products" });
    assert.ok(out.includes('class="b-block image-text image-text--right image-text--third"'));
    assert.ok(out.includes('<img class="image-text__img" src="/assets/demo/barista.svg" alt="Espresso machine" loading="lazy" decoding="async">'));
    assert.ok(out.includes("<h2>About <em>us</em></h2>"));
    assert.ok(out.includes("<p>One</p><p>Two</p>"));
    assert.ok(out.includes('<a class="b-btn image-text__button" href="/products">See</a>'));
    assert.ok(render("image-text", { position: "top", width: "all" }).includes("image-text--left image-text--half"));
    // No button text: no button; no image on the site: only the text; in the editor: an empty spot.
    assert.ok(!render("image-text", { buttonText: "" }).includes("image-text__button"));
    assert.ok(!render("image-text", { image: "" }).includes("image-text__image"));
    assert.ok(render("image-text", { image: "" }, "editor").includes("Choose an image in the panel on the right."));
  });
});

describe("Gallery", () => {
  test("every image is a link to its file, with the description as alt and data-description; the columns as a class", () => {
    const out = render("gallery", { title: "Our place", columns: "4", images: [{ image: "/a.jpg", description: "The counter" }, { image: "", description: "skipped" }] });
    assert.ok(out.includes('<h2 class="gallery__title">Our place</h2>'));
    assert.ok(out.includes('<ul class="gallery__grid gallery__grid--4">'));
    assert.ok(out.includes('<a class="gallery__item" href="/a.jpg" data-index="0" data-description="The counter">'));
    assert.ok(out.includes('<img src="/a.jpg" alt="The counter" loading="lazy" decoding="async">'));
    assert.ok(!out.includes("skipped"));
    assert.ok(render("gallery", { columns: "x" }).includes("gallery__grid--3"));
  });
});

describe("Map", () => {
  test("by default: the address and a link to Google Maps, no iframe, in every mode", () => {
    for (const mode of MODES) {
      const out = render("map", {}, mode);
      assert.ok(!out.includes("<iframe"), mode);
      assert.ok(out.includes('<p class="map__address">12 Linden Street</p>'), mode);
      assert.ok(
        out.includes(
          '<a class="map__link" href="https://www.google.com/maps/search/?api=1&amp;query=12%20Linden%20Street" target="_blank" rel="noopener">View on the map<span aria-hidden="true"> ↗</span></a>',
        ),
        mode,
      );
    }
  });

  test("with the checkbox on: a Google iframe on the site and in the static export, an empty frame in the editor; the link stays under the map", () => {
    const site = render("map", { showMap: true, zoom: "city", height: "large", address: 'St. "A" & B' });
    assert.ok(site.includes('<iframe class="map__iframe" src="https://www.google.com/maps?q=St.%20%22A%22%20%26%20B&z=12&output=embed" title="Map: St. &quot;A&quot; &amp; B"'));
    assert.ok(site.includes('loading="lazy"'));
    assert.ok(site.includes("map__frame--large"));
    assert.ok(site.includes('<p class="map__below"><a class="map__link"'));
    assert.ok(render("map", { showMap: true }, "static").includes("<iframe"));
    const editor = render("map", { showMap: true }, "editor");
    assert.ok(!editor.includes("<iframe"));
    assert.ok(editor.includes("<strong>Google map</strong>"));
    assert.ok(render("map", { showMap: true, zoom: "x", height: "y" }).includes("&z=16&output=embed"));
    assert.equal(components.map.props.showMap.help, "The map is loaded from Google when visitors open the page.");
    assert.equal(components.map.props.showMap.default, false);
  });

  test("the Google map starts only with a real check, and the zoom comes only from the list", () => {
    const iframe = (props) => render("map", { address: "St. Y", ...props }).includes("<iframe");
    assert.equal(iframe({ showMap: "false" }), false);
    assert.equal(iframe({ showMap: 1 }), false);
    assert.equal(iframe({ showMap: true }), true);
    const out = render("map", { address: "St. Y", showMap: true, zoom: "__proto__" });
    assert.ok(out.includes("z=16") && !out.includes("object"), out);
  });

  test("no address: nothing on the site, a hint in the editor; no link text, no link", () => {
    assert.equal(render("map", { address: "  " }), "");
    assert.ok(render("map", { address: "" }, "editor").includes("Write the address in the panel on the right."));
    assert.ok(!render("map", { linkText: "" }).includes("map__link"));
  });
});

describe("Embed code", () => {
  test("on the site the code goes in exactly as it is; empty → nothing", () => {
    const code = '<iframe src="https://maps.example.com/x" width="600"></iframe><script>x()</script>';
    assert.ok(render("embed", { code }).includes(`<div class="embed__content">${code}</div>`));
    assert.ok(render("embed", { code }, "static").includes(`<div class="embed__content">${code}</div>`));
    assert.equal(render("embed", { code: "" }), "");
    assert.equal(render("embed", { code: "  \n " }, "static"), "");
    assert.equal(render("embed", { code: { a: 1 } }), ""); // not text → like empty
  });

  // The text of the srcdoc attribute, as the browser reads it.
  const srcdoc = (out) =>
    out
      .match(/ srcdoc="([^"]*)"/)[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#96;/g, "`")
      .replace(/&amp;/g, "&");

  test("in the editor: the code runs isolated, in a sandboxed frame without allow-same-origin", () => {
    const code = '<script>parent.document.title = "hacked"; fetch("/_api/pages/index", { method: "PUT" })</script><img src=x onerror="alert(1)">';
    const out = render("embed", { code }, "editor");
    assert.match(out, /<iframe class="embed__frame" sandbox="allow-scripts allow-popups allow-forms" srcdoc="[^"]*"\s+title="Embed code" loading="lazy"><\/iframe>/);
    assert.ok(!out.includes("allow-same-origin"));
    assert.ok(!out.includes("allow-top-navigation") && !out.includes("allow-popups-to-escape-sandbox"));
    // Nothing of the code is in the editor's page, outside the (escaped) attribute.
    assert.ok(!/<script|<img|onerror="/i.test(out), out);
    assert.equal(out.match(/<iframe/g).length, 1);
    const doc = srcdoc(out);
    assert.ok(doc.endsWith(`<body>${code}</body></html>`), doc);
    // The measuring script comes before the code: broken code can't swallow it.
    assert.ok(doc.indexOf("parent.postMessage(Math.ceil(") < doc.indexOf("<body>"));
  });

  test("in the editor: code that tries to break out of the attribute stays inside", () => {
    for (const code of ['"><script>alert(1)</script>', "'><b>x</b>", "</iframe><script>alert(2)</script>", "&quot;><i>y</i>"]) {
      const out = render("embed", { code }, "editor");
      assert.equal(out.match(/<iframe/g).length, 1, code);
      assert.ok(!/<script|<b>|<i>/.test(out), out);
      assert.ok(srcdoc(out).endsWith(`<body>${code}</body></html>`), code);
    }
  });

  test("in the editor: the frame has the site's font and colors; empty → a place to paste", () => {
    const { body } = renderParts({
      page: { blocks: [{ id: "x", type: "embed", props: { code: "<p>Hello</p>" } }] },
      site: { theme: { text: "#123456", font: "Georgia, serif" } },
      components,
      mode: "editor",
    });
    const doc = srcdoc(body);
    assert.ok(doc.includes("--text:#123456;") && doc.includes("--font:Georgia, serif;"), doc);
    assert.ok(doc.includes("body{font-family:var(--font);color:var(--text)}"));
    assert.ok(render("embed", {}, "editor").includes("Paste the HTML code of a widget (bookings, reviews…) in the panel on the right."));
  });

  test("js(): takes the height only from its own frame, only as a number, between 40 and 4000 px; it stops", () => {
    const listeners = new Set();
    const win = { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
    const frame = { contentWindow: { frame: true }, style: {} };
    const el = { ownerDocument: { defaultView: win }, querySelector: (sel) => (sel === ".embed__frame" ? frame : null) };
    const stops = [];
    components.embed.js(el, {}, { mode: "editor", onStop: (fn) => stops.push(fn) });
    assert.equal(listeners.size, 1);
    const send = (data, source = frame.contentWindow) => [...listeners].forEach((fn) => fn({ data, source }));
    send(300);
    assert.equal(frame.style.height, "300px");
    for (const [data, source] of [[999, { other: true }], [999, null], ["999", undefined], [{ h: 999 }, undefined], [NaN, undefined], [Infinity, undefined]]) {
      send(data, source === undefined ? frame.contentWindow : source);
      assert.equal(frame.style.height, "300px", String(data));
    }
    send(123.2);
    assert.equal(frame.style.height, "124px");
    send(-50);
    assert.equal(frame.style.height, "40px");
    send(1e9);
    assert.equal(frame.style.height, "4000px");
    stops.forEach((fn) => fn());
    assert.equal(listeners.size, 0);
    // On the site there is no frame (even if some code had its class): it listens to nothing.
    components.embed.js({ ownerDocument: { defaultView: win }, querySelector: () => null }, {}, { mode: "editor", onStop: assert.fail });
    components.embed.js(el, {}, { mode: "site", onStop: assert.fail });
    assert.equal(listeners.size, 0);
  });
});

describe("Columns", () => {
  test("2, 3 or 4 columns, each an area; the spacing, the alignment and the order on phones as classes", () => {
    const out = render("columns", { columns: "3", spacing: "large", align: "bottom", reverseOnPhone: true }, "editor");
    assert.ok(out.includes('class="columns__grid columns__grid--3 columns__grid--spacing-large columns__grid--bottom columns__grid--reversed"'));
    assert.equal(out.split('class="columns__col"').length - 1, 3);
    for (const n of [1, 2, 3]) assert.ok(out.includes(`data-slot="x:c${n}"`) && out.includes(`Drag a block into “Column ${n}”`), `c${n}`);
    assert.ok(!out.includes('data-slot="x:c4"'));
    assert.ok(render("columns", { columns: "7", spacing: "huge", align: "x" }, "editor").includes("columns__grid--2 columns__grid--spacing-medium columns__grid--top"));
  });

  test("a column that doesn't show (Column 3 with 2 columns) doesn't reach the page", () => {
    const slots = { c3: [{ id: "n", type: "note", props: {} }] };
    assert.ok(!render("columns", { columns: "2" }, "site", { slots }).includes("A note"));
    assert.ok(render("columns", { columns: "3" }, "site", { slots }).includes("A note"));
  });

  test("empty, it leaves no band on the site; in the editor every column has its hint", () => {
    assert.ok(components.columns.css.includes(".columns:not(:has(.columns__col > .b-slot > *)) { display: none; }"));
    assert.ok(components.columns.css.includes("container-type: inline-size"));
    assert.ok(render("columns", {}, "editor").includes("b-empty"));
  });
});

describe("Members only", () => {
  const slots = { content: [{ id: "n", type: "note", props: {} }] };

  test("empty, it asks nobody to log in; with something inside, a visitor sees the message and never the content", () => {
    assert.equal(render("members-only", {}, "site").trim(), "");
    const out = render("members-only", {}, "site", { slots });
    assert.ok(out.includes("members-only__locked"));
    assert.ok(!out.includes('data-id="n"') && !out.includes("A note"), "the content doesn't reach the visitor");
    assert.ok(out.includes('<a class="b-btn members-only__login" href="/login">Log in</a>'));
    // The static export has no accounts.
    assert.equal(render("members-only", {}, "static", { slots }), "");
  });

  test("a logged-in member sees the content as if it were on the page; the editor shows the area", () => {
    const member = render("members-only", {}, "site", { slots, user: ANA });
    assert.ok(member.includes('<div class="members-only__open">') && member.includes("A note"));
    assert.ok(!member.includes("members-only__locked"));
    assert.ok(render("members-only", {}, "editor").includes("Drag a block into “Members-only content”"));
    assert.ok(render("members-only", {}, "editor", { slots }).includes("A note"));
  });

  test("the log in button goes to the site's login page", () => {
    assert.ok(render("members-only", {}, "site", { slots, site: { loginPage: "/members/login" } }).includes('href="/members/login"'));
    assert.ok(render("members-only", {}, "site", { slots, site: {} }).includes('href="/login"'));
    assert.ok(!render("members-only", { buttonText: "" }, "site", { slots }).includes("members-only__login"));
  });
});

describe("My account", () => {
  test("on the site: the member's greeting, email and log out button; a visitor gets the message and a log in button", () => {
    const out = render("account", {}, "site", { user: ANA });
    assert.ok(out.includes('<h2 class="account__greeting">Hi, Ana!</h2>'));
    assert.ok(out.includes('<p class="account__email">ana@example.com</p>'));
    assert.ok(out.includes('<span class="account__avatar" aria-hidden="true">A</span>'));
    assert.ok(out.includes('<button class="b-btn b-btn--outline account__logout" type="button">Log out</button>'));
    const guest = render("account");
    assert.ok(guest.includes("<p>You&#39;re not logged in. Log in to see your account details.</p>"));
    assert.ok(guest.includes('<a class="b-btn account__login" href="/login">Log in</a>'));
  });

  test("in the editor, an example; in the static export nobody is logged in, and there is no log in button", () => {
    const editor = render("account", {}, "editor");
    assert.ok(editor.includes("Hi, Ana!") && editor.includes("(example in the editor)"));
    const out = render("account", {}, "static", { user: ANA });
    assert.ok(out.includes("account__card--guest") && !out.includes("account__login"));
  });

  test("the member's name and email are escaped", () => {
    const out = render("account", {}, "site", { user: { id: "u", name: BAD, email: BAD } });
    assert.ok(!out.includes("<script") && out.includes("&lt;script&gt;"));
  });
});

describe("Form", () => {
  test("every kind of field becomes its element, named f<position> with data-field; the optional ones are marked", () => {
    const out = render("form", {
      fields: [
        { label: "Name", type: "text", required: true, options: "" },
        { label: "", type: "text", required: true, options: "" },
        { label: "Email", type: "email", required: true, options: "" },
        { label: "Phone", type: "phone", required: false, options: "" },
        { label: "Message", type: "longtext", required: true, options: "" },
        { label: "I agree", type: "checkbox", required: true, options: "" },
        { label: "When", type: "choice", required: false, options: " Morning, ,Evening " },
        { label: "Odd", type: "file", required: false, options: "" },
      ],
    });
    assert.ok(out.includes('<input type="text" maxlength="200" name="f0" data-field="0" required >'));
    assert.ok(!out.includes('name="f1"'));
    assert.ok(out.includes('<input type="email" maxlength="200" autocomplete="email" inputmode="email" name="f2" data-field="2" required >'));
    // The label is a single element, with "(optional)" on the same line.
    assert.ok(
      out.includes(
        '<span class="form__label">Phone <span class="form__optional">(optional)</span></span><input type="tel" maxlength="40" autocomplete="tel" name="f3" data-field="3"  >',
      ),
    );
    assert.ok(out.includes('<textarea name="f4" data-field="4" rows="5" maxlength="5000" required ></textarea>'));
    assert.ok(out.includes('<label class="b-field form__checkbox"><input type="checkbox" name="f5" data-field="5" required > <span class="form__label">I agree</span></label>'));
    assert.ok(out.includes('<select name="f6" data-field="6"  >'));
    assert.ok(out.includes('<option value="">Choose…</option>'));
    assert.ok(out.includes('<option value="Morning">Morning</option><option value="Evening">Evening</option>'));
    // An unknown kind falls back to text.
    assert.ok(out.includes('<input type="text" maxlength="200" name="f7" data-field="7"  >'));
    // The trap for robots.
    assert.ok(out.includes('<input name="website" tabindex="-1" autocomplete="off">'));
  });

  test("in the static export the fields are disabled and the message shows; it needs a server", () => {
    const out = render("form", {}, "static");
    assert.ok(out.includes("You can&#39;t send messages from here. You&#39;ll find our contact details on the site."));
    assert.equal(out.split("disabled").length - 1, 4);
    assert.equal(components.form.needsServer, true);
    assert.ok(!render("form").includes("disabled"));
  });

  test("js(): an error from the server goes away when the browser stops the next try or a field changes", async () => {
    const on = (target) => {
      target.listeners = {};
      target.addEventListener = (type, fn) => (target.listeners[type] ||= []).push(fn);
      target.fire = (type, event = {}) => Promise.all((target.listeners[type] || []).map((fn) => fn({ preventDefault() {}, ...event })));
      return target;
    };
    // A form with one field, its js() started with the given answer from the server.
    const start = (answer) => {
      const field = on({ type: "text", tagName: "INPUT", value: "x", dataset: { field: "0" }, validity: {}, setCustomValidity() {} });
      const message = { className: "b-message", textContent: "" };
      const form = on({
        querySelector: (sel) => (sel === ".b-message" ? message : { disabled: false }),
        querySelectorAll: () => [field],
        elements: {},
        reset() {},
      });
      const el = { dataset: { id: "f1" }, ownerDocument: { documentElement: { lang: "en" } }, querySelector: () => form };
      components.form.js(el, { successMessage: "Thanks" }, { mode: "site", post: async () => answer });
      return { form, message };
    };
    globalThis.location = { pathname: "/contact" };
    try {
      const { form, message } = start({ ok: false, data: { error: "“Phone” can only contain digits." } });
      for (const clear of [() => form.fire("invalid"), () => form.fire("input"), () => form.fire("change")]) {
        await form.fire("submit");
        assert.equal(message.textContent, "“Phone” can only contain digits.");
        assert.equal(message.className, "b-message b-message--error");
        await clear();
        assert.equal(message.textContent, "");
        assert.equal(message.className, "b-message");
      }
      // A message that isn't an error (after sending) stays while the visitor types again.
      const sent = start({ ok: true, data: {} });
      await sent.form.fire("submit");
      assert.equal(sent.message.textContent, "Thanks");
      await sent.form.fire("input");
      assert.equal(sent.message.textContent, "Thanks");
    } finally {
      delete globalThis.location;
    }
  });

  test("Contact form is an alias: the same html and js, with name, email and message ready", () => {
    const alias = components["contact-form"];
    assert.equal(alias.alias, "form");
    // The loader loads every file with "?v=", so the alias has another instance of form.js: we compare the code.
    assert.equal(String(alias.html), String(components.form.html));
    assert.equal(String(alias.js), String(components.form.js));
    assert.equal(alias.needsServer, true);
    assert.deepEqual(alias.props.fields.default.map((f) => [f.label, f.type]), [["Name", "text"], ["Email", "email"], ["Message", "longtext"]]);
    assert.equal(alias.i18n.ro.name, "Formular de contact");
    assert.deepEqual(alias.i18n.ro.props, components.form.i18n.ro.props);
    const out = render("contact-form", { title: "Write to us" });
    assert.ok(out.includes('name="f0"') && out.includes('type="email"') && out.includes("<textarea"));
    assert.ok(out.includes(">Send message</button>"));
  });
});

describe("Sign up", () => {
  test("name, email, the password with its help and its repeat; the title as h2 or h1; the log in link", () => {
    const out = render("signup", {}, "site", { site: { loginPage: "/members/login" } });
    assert.ok(out.includes('<h2 class="signup__title">Create an account</h2>'));
    assert.ok(out.includes('<input name="name" required maxlength="80" autocomplete="name" >'));
    assert.ok(out.includes('<label for="x-password">Password</label>'));
    assert.ok(out.includes('aria-describedby="x-password-help"'));
    assert.ok(out.includes('<small class="signup__help" id="x-password-help">At least 15 characters. A short sentence is easy to remember.</small>'));
    assert.ok(out.includes('name="confirm" required minlength="15"'));
    assert.ok(out.includes('<p class="signup__other">Already have an account? <a class="signup__link" href="/members/login">Log in</a></p>'));
    assert.ok(render("signup", { headingLevel: "h1" }).includes('<h1 class="signup__title">'));
    assert.ok(render("signup", { headingLevel: "h3" }).includes('<h2 class="signup__title">'));
    assert.ok(render("signup", {}, "site", { site: {} }).includes('href="/login"'));
    assert.ok(render("signup", { loginLink: "/enter" }).includes('href="/enter"'));
  });

  test("in the static export the fields are disabled and the message shows; it needs a server", () => {
    const out = render("signup", {}, "static");
    assert.equal(out.split("disabled").length - 1, 5);
    assert.ok(out.includes("Creating an account isn&#39;t available on this site."));
    assert.equal(components.signup.needsServer, true);
    assert.ok(!render("signup").includes("disabled"));
  });
});

describe("js(): back to the page after logging in", () => {
  // Just enough of a link for js(): getAttribute / setAttribute on href.
  const fakeLink = (href) => {
    const attributes = { href };
    return { getAttribute: (k) => attributes[k] ?? null, setAttribute: (k, v) => (attributes[k] = v), get href() { return attributes.href; } };
  };
  // Runs fn with a global `location`, as in the browser.
  const withLocation = (value, fn) => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, "location");
    Object.defineProperty(globalThis, "location", { value, configurable: true, writable: true });
    try {
      return fn();
    } finally {
      if (saved) Object.defineProperty(globalThis, "location", saved);
      else delete globalThis.location;
    }
  };

  test("Members only and My account add ?next= with the current page to their log in link, only on the site", () => {
    withLocation({ pathname: "/offers", search: "?a=1" }, () => {
      for (const [id, selector] of [["members-only", ".members-only__login"], ["account", ".account__login"]]) {
        const link = fakeLink("/login");
        components[id].js({ querySelector: (sel) => (sel === selector ? link : null) }, {}, { mode: "site" });
        assert.equal(link.href, "/login?next=%2Foffers%3Fa%3D1", id);
        const other = fakeLink("/login?x=1");
        components[id].js({ querySelector: (sel) => (sel === selector ? other : null) }, {}, { mode: "site" });
        assert.equal(other.href, "/login?x=1&next=%2Foffers%3Fa%3D1", id);
        const editor = fakeLink("/login");
        components[id].js({ querySelector: (sel) => (sel === selector ? editor : null) }, {}, { mode: "editor" });
        assert.equal(editor.href, "/login", `${id}: not in the editor`);
      }
    });
  });

  test("Sign up passes on only a safe ?next= (a path on the same site) to its log in link", () => {
    const run = (search) => {
      const link = fakeLink("/login");
      const input = () => ({ addEventListener() {}, setCustomValidity() {}, value: "", validity: {} });
      const form = { querySelector: () => ({ className: "" }), elements: { name: input(), email: input(), password: input(), confirm: input() }, addEventListener() {} };
      const el = { querySelector: (sel) => (sel === ".signup__form" ? form : sel === ".signup__link" ? link : null) };
      withLocation({ pathname: "/signup", search, origin: "https://luna.example.com" }, () => components.signup.js(el, {}, { mode: "site" }));
      return link.href;
    };
    assert.equal(run("?next=%2Fmembers%3Fx%3D1"), "/login?next=%2Fmembers%3Fx%3D1");
    for (const bad of ["?next=//evil.example.com", "?next=https://evil.example.com", "?next=%2F%5Cevil.example.com", "?next=javascript:alert(1)", "?next=%2Fa%20b", ""]) {
      assert.equal(run(bad), "/login", bad);
    }
  });

  test("Sign up: the browser's own messages in the page's language; “don't match” wins; an old error goes away", () => {
    const field = (value = "") => ({
      value,
      validity: {},
      on: {},
      addEventListener(type, fn) { (this.on[type] ||= []).push(fn); },
      setCustomValidity(text) { this.custom = text; this.validity = { ...this.validity, customError: Boolean(text) }; },
      fire(type) { for (const fn of this.on[type] || []) fn(); },
    });
    const run = (lang) => {
      const message = { className: "b-message b-message--error", textContent: "The password can't be …" };
      const fields = { name: field(), email: field(), password: field(), confirm: field() };
      const form = { ...field(), elements: fields, querySelector: (sel) => (sel === ".b-message" ? message : {}) };
      const el = { ownerDocument: { documentElement: { lang } }, querySelector: (sel) => (sel === ".signup__form" ? form : null) };
      withLocation({ pathname: "/signup", search: "", origin: "https://luna.example.com" }, () => components.signup.js(el, {}, { mode: "site" }));
      return { message, form, ...fields };
    };
    for (const [lang, fill, short, mismatch] of [
      ["en", "Please fill in this field.", "The password must be at least 15 characters long.", "The passwords don't match."],
      ["ro", "Completează acest câmp.", "Parola trebuie să aibă cel puțin 15 caractere.", "Parolele nu se potrivesc."],
    ]) {
      const p = run(lang);
      p.name.validity = { valueMissing: true };
      p.name.fire("invalid");
      assert.equal(p.name.custom, fill, lang);
      p.name.fire("input");
      assert.equal(p.name.custom, "", lang);
      p.password.validity = { tooShort: true };
      p.password.fire("invalid");
      assert.ok(p.password.custom.startsWith(short), lang);
      // Different passwords: our message stays, the browser's check doesn't replace it.
      p.password.value = "a long and easy sentence";
      p.confirm.value = "another long sentence";
      p.confirm.fire("input");
      assert.equal(p.confirm.custom, mismatch, lang);
      p.confirm.fire("invalid");
      assert.equal(p.confirm.custom, mismatch, lang);
      p.confirm.value = p.password.value;
      p.confirm.fire("input");
      assert.equal(p.confirm.custom, "", lang);
      // The browser stops the next try: the old message from the server goes.
      p.form.fire("invalid");
      assert.equal(p.message.textContent, "", lang);
      assert.equal(p.message.className, "b-message", lang);
    }
  });
});

// components/form.server.js: the server checks the answers against the fields on the PAGE, not against what
// the visitor sends, and only for a form the visitor sees (ctx.block). The project sits in a temporary folder,
// with the form, its alias, a few container blocks and core/.
describe("form.server.js", () => {
  const fields = [
    { label: "Name", type: "text", required: true, options: "" },
    { label: "Email", type: "email", required: true, options: "" },
    { label: "Phone", type: "phone", required: false, options: "" },
    { label: "When", type: "choice", required: false, options: "Morning, Evening" },
    { label: "I agree", type: "checkbox", required: true, options: "" },
    { label: "", type: "text", required: true, options: "" },
    { label: "Message", type: "longtext", required: true, options: "" },
  ];
  const form = (id, props) => ({ id, type: "form", props });
  const oneField = (id) => form(id, { fields: [{ label: "Text", type: "text", required: true }] });
  const SECTION = componentSource(`{ name: "Section", slots: { content: "Content" }, html: (p, ctx) => html\`<section>\${ctx.slot("content")}</section>\` }`);
  const PROJECT = {
    "site.json": { name: "Test Site" },
    "components/note.js": NOTE,
    "components/section.js": SECTION,
    "pages/index.json": { title: "Home", blocks: [] },
    "pages/contact.json": {
      title: "Contact",
      blocks: [
        { id: "txt", type: "note", props: {} },
        { id: "sec", type: "section", props: {}, slots: { content: [form("f1", { title: "Write to us", fields })] } },
        { id: "old", type: "contact-form", props: { title: "Old contact" } },
        form("empty", { fields: [] }),
        form("no-field", { fields: [{ label: " ", type: "text" }] }),
      ],
    },
    "pages/_footer.json": { blocks: [form("fs", { fields: [{ label: "Email", type: "email", required: true }] })] },
    // Forms an anonymous visitor doesn't see: on a members-only page, in "Members only", in a column
    // that doesn't show (Columns with 2 columns, the form in the third).
    "pages/secret.json": { title: "Secret", access: "members", blocks: [oneField("fm")] },
    "pages/hidden.json": {
      title: "Hidden",
      blocks: [
        { id: "mo", type: "members-only", props: {}, slots: { content: [oneField("fmo")] } },
        { id: "col", type: "columns", props: { columns: "2" }, slots: { c3: [oneField("fh")] } },
      ],
    },
    "pages/no-zones.json": { title: "No zones", zones: false, blocks: [] },
  };
  const good = { page: "/contact", block: "f1", values: ["Ana", "Ana@Example.com", "", "Evening", true, "", "Hi!"], website: "" };

  let project;
  let srv;
  let port;
  let proxy;

  before(async () => {
    // Every test picks its address through X-Forwarded-For (it only counts with TRUST_PROXY=1).
    proxy = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "1";
    project = makeProject(PROJECT);
    for (const file of ["form.js", "form.server.js", "contact-form.js", "contact-form.server.js", "columns.js", "members-only.js"]) {
      cpSync(join(PROJECT_ROOT, "components", file), join(project, "components", file));
    }
    srv = await startServer({ root: project, mode: "start", host: "127.0.0.1", port: 0, quiet: true });
    port = srv.port;
  });
  after(async () => {
    if (proxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = proxy;
    await srv?.close();
    removeProject(project);
  });

  const submit = (body, headers = {}) => sendJson(port, "/api/c/form/submit", body, { headers });
  const messages = () => JSON.parse(readFileSync(join(project, "data/messages.json"), "utf8"));
  // Every test takes another address, so the limit of 5 messages doesn't get mixed up.
  let n = 0;
  const ip = () => ({ "x-forwarded-for": `10.0.${Math.floor(n / 250)}.${++n % 250}` });

  test("a good message is saved with the field labels, cleaned, and with the fields for “node blocks.js messages”", async () => {
    const res = await submit(good);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.json(), { ok: true });
    const [m] = messages();
    assert.equal(m.form, "Write to us");
    assert.equal(m.page, "/contact");
    assert.deepEqual(m.answers, [
      { label: "Name", value: "Ana" },
      { label: "Email", value: "ana@example.com" },
      { label: "Phone", value: "" },
      { label: "When", value: "Evening" },
      { label: "I agree", value: true },
      { label: "Message", value: "Hi!" },
    ]);
    assert.equal(m.name, "Ana");
    assert.equal(m.email, "ana@example.com");
    assert.equal(m.phone, "");
    assert.equal(m.message, "Name: Ana\nEmail: ana@example.com\nPhone: \nWhen: Evening\nI agree: yes\nMessage: Hi!");
    assert.equal(typeof m.id, "string");
    assert.equal(typeof m.created, "string");
  });

  test("each field is checked by its kind, with messages for humans", async () => {
    const cases = [
      [["", "a@b.example", "", "", true, "", "x"], "Please fill in “Name”."],
      [["A", "not-an-email", "", "", true, "", "x"], "“Email” doesn't look like a valid email address."],
      [["A", "a@b.example", "abc", "", true, "", "x"], "“Phone” can only contain digits, spaces and + ( ) - . /"],
      [["A", "a@b.example", "", "Night", true, "", "x"], "Please choose an option for “When”."],
      [["A", "a@b.example", "", "", false, "", "x"], "Please check “I agree”."],
      [["A", "a@b.example", "", "", "yes", "", "x"], "Please check “I agree”."],
      [["A", "a@b.example", "", "", true, "", ""], "Please fill in “Message”."],
      [["A", "a@b.example", "", "", true, "", "   \n\t "], "Please fill in “Message”."],
      [["x".repeat(201), "a@b.example", "", "", true, "", "x"], "“Name” is too long (200 characters at most)."],
      [["A", "a@b.example", "", "", true, "", "x".repeat(5001)], "“Message” is too long (5000 characters at most)."],
      [["A", `${"a".repeat(196)}@b.ro`, "", "", true, "", "x"], "“Email” is too long (200 characters at most)."],
    ];
    for (const [values, message] of cases) {
      const res = await submit({ ...good, values }, ip());
      assert.equal(res.status, 400, message);
      assert.equal(res.json().error, message);
    }
    // Optional fields can be missing altogether.
    const short = await submit({ ...good, values: ["A", "a@b.example", undefined, null, true, "", "x"] }, ip());
    assert.equal(short.status, 200, short.text);
  });

  test("hostile answers stay text: HTML, control characters, objects, numbers", async () => {
    const res = await submit(
      { ...good, values: ["<b>Ana</b>\u0007\u001b[31m\u0000", "A@B.EXAMPLE", "+40 (700) 000-000", "", true, { a: 1 }, "Line 1\r\nLine 2\u0000\u001b\u2028Line 3"] },
      ip(),
    );
    assert.equal(res.status, 200, res.text);
    const m = messages().at(-1);
    assert.equal(m.answers[0].value, "<b>Ana</b> [31m");
    assert.equal(m.answers[1].value, "a@b.example");
    assert.equal(m.answers[2].value, "+40 (700) 000-000");
    assert.equal(m.answers[5].value, "Line 1\nLine 2\nLine 3");
    for (const a of m.answers) assert.ok(typeof a.value === "string" || typeof a.value === "boolean");
    assert.ok(!JSON.stringify(m).includes("\\u0000") && !JSON.stringify(m).includes("\\u001b"));
    // A number or an object instead of text is like an empty field.
    const number = await submit({ ...good, values: [5, "a@b.example", "", "", true, "", "x"] }, ip());
    assert.equal(number.json().error, "Please fill in “Name”.");
  });

  test("the fields don't come from the visitor: “fields” in the body is ignored, and so are extra values", async () => {
    const res = await submit(
      { ...good, fields: [{ label: "Password", type: "text" }], values: ["A", "a@b.example", "", "", true, "", "x", "extra", "<script>"], moreValues: "x" },
      ip(),
    );
    assert.equal(res.status, 200, res.text);
    const m = messages().at(-1);
    assert.equal(m.answers.length, 6);
    assert.ok(!JSON.stringify(m).includes("Password") && !JSON.stringify(m).includes("extra"));
    for (const values of [{}, "abc", null, 5, { 0: "A", 1: "a@b.example" }]) {
      const r = await submit({ ...good, values }, ip());
      assert.equal(r.status, 400, JSON.stringify(values));
      assert.equal(r.json().error, "Please fill in “Name”.");
    }
  });

  test("the block must exist on the page asked for and be a form; otherwise 404, and nothing is saved", async () => {
    const before = messages().length;
    const cases = [
      { ...good, block: "does-not-exist" },
      { ...good, block: "txt" },
      { ...good, block: "sec" },
      { ...good, page: "/" },
      { ...good, page: "/does-not-exist" },
      { ...good, page: "../contact" },
      { ...good, page: "/../../etc/passwd" },
      { ...good, page: "/Contact" },
      { ...good, page: "" },
      { ...good, page: 5 },
      { ...good, page: ["/contact"] },
      { ...good, block: "" },
      { ...good, block: "f1/../f1" },
      { ...good, block: ["f1"] },
      { ...good, block: { toString: () => "f1" } },
      { ...good, block: "x".repeat(65) },
      { ...good, block: "empty" },
      { ...good, block: "no-field" },
      { values: good.values },
      {},
    ];
    for (const body of cases) {
      const res = await submit(body, ip());
      assert.equal(res.status, 404, JSON.stringify(body));
      assert.match(res.json().error, /^This form /);
    }
    assert.equal(messages().length, before);
    // The page can also be written with a "/" at the end, or with a query and a hash.
    assert.equal((await submit({ ...good, page: "/contact/" }, ip())).status, 200);
    assert.equal((await submit({ ...good, page: "/contact?x=1#y" }, ip())).status, 200);
  });

  test("a “contact-form” block (the alias) is checked against its own fields: name, email, message", async () => {
    const wrong = await submit({ page: "/contact", block: "old", values: ["Ana", "nope", "x"] }, ip());
    assert.equal(wrong.status, 400);
    assert.equal(wrong.json().error, "“Email” doesn't look like a valid email address.");
    const ok = await submit({ page: "/contact", block: "old", values: ["Ana", "ana@example.com", "Hi"] }, ip());
    assert.equal(ok.status, 200, ok.text);
    const m = messages().at(-1);
    assert.equal(m.form, "Old contact");
    assert.deepEqual(m.answers.map((a) => a.label), ["Name", "Email", "Message"]);
    // The alias's own route answers with the same rules.
    const own = await sendJson(port, "/api/c/contact-form/submit", { page: "/contact", block: "old", values: ["Ana", "ana@example.com", "Hi"] }, { headers: ip() });
    assert.equal(own.status, 200, own.text);
  });

  test("a form in the shared footer is found from any page", async () => {
    const res = await submit({ page: "/", block: "fs", values: ["ana@example.com"] }, ip());
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(messages().at(-1).answers, [{ label: "Email", value: "ana@example.com" }]);
    assert.equal(messages().at(-1).page, "/");
  });

  test("a block of another kind, written on a page under the form's id, isn't accepted", async () => {
    writeFiles(project, {
      "pages/fake.json": { title: "Fake", blocks: [{ id: "t", type: "note", props: {} }, { id: "s", type: "section", props: {}, slots: { content: [] } }] },
    });
    for (const block of ["t", "s"]) {
      const res = await submit({ page: "/fake", block, values: ["x"] }, ip());
      assert.equal(res.status, 404, block);
    }
  });

  test("only the forms the visitor sees: not on a members-only page, in “Members only” or in a hidden area", async () => {
    const before = messages().length;
    const write = (page, block, headers = ip()) => submit({ page, block, values: ["hello"] }, headers);
    for (const [page, block] of [["/secret", "fm"], ["/hidden", "fmo"], ["/hidden", "fh"], ["/no-zones", "fs"]]) {
      const res = await write(page, block);
      assert.equal(res.status, 404, `${page} ${block}`);
      assert.match(res.json().error, /This form is no longer on the page/);
    }
    assert.equal(messages().length, before);
    // Logged in, they see the form on the members-only page and the one in "Members only".
    const account = await sendJson(port, "/api/auth/register", { name: "Ana", email: "ana@example.com", password: "a password that is long enough" }, { headers: ip() });
    assert.equal(account.status, 200, account.text);
    const cookie = cookieFrom(account);
    assert.equal((await write("/secret", "fm", { ...ip(), cookie })).status, 200);
    assert.equal((await write("/hidden", "fmo", { ...ip(), cookie })).status, 200);
    // The third column doesn't show for members either.
    assert.equal((await write("/hidden", "fh", { ...ip(), cookie })).status, 404);
    assert.equal(messages().length, before + 2);
  });

  test("at an address that doesn't exist, the form on the 404 page answers (like the page itself)", async () => {
    writeFiles(project, { "pages/404.json": { title: "Not found", blocks: [oneField("f404")] } });
    try {
      const res = await submit({ page: "/does-not-exist-at-all", block: "f404", values: ["hello"] }, ip());
      assert.equal(res.status, 200, res.text);
      assert.equal(messages().at(-1).page, "/does-not-exist-at-all");
      assert.equal((await submit({ page: "/contact", block: "f404", values: ["hello"] }, ip())).status, 404, "not from a page that exists");
    } finally {
      rmSync(join(project, "pages/404.json"));
    }
  });

  test("wrong attempts count too (30 in 10 minutes); IPv6 counts by its /64 network", async () => {
    const address = ip();
    for (let i = 0; i < 30; i++) assert.equal((await submit({ ...good, values: [] }, address)).status, 400);
    assert.equal((await submit(good, address)).status, 429);
    // 6 addresses in the same /64 network are a single visitor: the sixth message is stopped.
    const v6 = (k) => ({ "x-forwarded-for": `2001:db8:1:2::${k.toString(16)}` });
    for (let i = 1; i <= 5; i++) assert.equal((await submit(good, v6(0x100 + i))).status, 200, `::${i}`);
    assert.equal((await submit(good, v6(0x140))).status, 429);
    assert.equal((await submit(good, { "x-forwarded-for": "2001:db8:1:3::1" })).status, 200, "another /64 network");
    assert.equal((await submit(good, { "x-forwarded-for": "2001:0db8:0001:0002:0000:0000:0000:0abc" })).status, 429, "the same network, written in full");
  });

  test("text without invisible characters that change direction or hide letters; the IP address isn't saved", async () => {
    const res = await submit({ ...good, values: ["QA \u202egnp.exe\u200b\u2066x\u2069\ufeff", "a@b.example", "", "", true, "", "a\u202eb\u061c\nc"] }, ip());
    assert.equal(res.status, 200, res.text);
    const m = messages().at(-1);
    assert.equal(m.answers[0].value, "QA gnp.exex");
    assert.equal(m.answers[5].value, "ab\nc");
    assert.ok(!("ip" in m));
  });

  test("the trap for robots: “thank you”, but nothing saved; the limit of 5 messages in 10 minutes per address", async () => {
    const before = messages().length;
    const robot = await submit({ ...good, website: "http://spam.example" }, ip());
    assert.equal(robot.status, 200);
    assert.deepEqual(robot.json(), { ok: true });
    assert.equal(messages().length, before);

    const address = ip();
    for (let i = 0; i < 5; i++) assert.equal((await submit(good, address)).status, 200);
    const tooMany = await submit(good, address);
    assert.equal(tooMany.status, 429);
    assert.match(tooMany.json().error, /try again in a few minutes/);
    // A wrong message doesn't use up the limit.
    const other = ip();
    for (let i = 0; i < 6; i++) assert.equal((await submit({ ...good, values: [] }, other)).status, 400);
    assert.equal((await submit(good, other)).status, 200);
  });

  test("on a Romanian site (lang “ro”) the visitor's messages are in Romanian, and so are “da” / “nu” in the saved text", async () => {
    writeFiles(project, { "site.json": { name: "Test Site", lang: "ro" } });
    try {
      const wrong = await submit({ ...good, values: ["", "a@b.example", "", "", true, "", "x"] }, ip());
      assert.equal(wrong.json().error, "Completează „Name”.");
      const choice = await submit({ ...good, values: ["A", "a@b.example", "", "Night", true, "", "x"] }, ip());
      assert.equal(choice.json().error, "Alege o variantă la „When”.");
      const gone = await submit({ ...good, block: "nope" }, ip());
      assert.equal(gone.json().error, "Formularul nu mai există pe pagină. Reîncarcă pagina și încearcă din nou.");
      const address = ip();
      for (let i = 0; i < 5; i++) assert.equal((await submit(good, address)).status, 200);
      assert.match((await submit(good, address)).json().error, /peste câteva minute/);
      assert.match(messages().at(-1).message, /\nI agree: da\n/);
    } finally {
      writeFiles(project, { "site.json": { name: "Test Site" } });
    }
  });
});
