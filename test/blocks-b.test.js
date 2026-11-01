// The bundled blocks of the second half: FAQ, Timeline, List, Address (locations), Log in, Header
// (navbar), Free canvas, Press, Prices (pricing), Opening hours, Social media, Section, Logos, Spacer,
// News, Footer, Text and Video.
//
// Each one loads without warnings, carries its Romanian editor texts (i18n.ro), renders with its
// defaults, empty and with hostile values in the editor, on the site and in the static export, and
// keeps its safety behavior (escaping, url(), only known values in classes). The Free canvas has
// its own suite in canvas-block.test.js.
//
// The blocks are copied into a temporary project, so this file doesn't depend on the other bundled blocks.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createProject } from "../server/project.js";
import { renderParts, validateComponent } from "../core/render.js";
import { makeProject, PROJECT_ROOT, removeProject } from "./helpers.js";

// id → [icon, category, name, Romanian name, Romanian category]
const EXPECTED = {
  faq: ["faq", "Lists", "FAQ", "Întrebări frecvente", "Liste"],
  timeline: ["timeline", "Lists", "Timeline", "Istoric", "Liste"],
  list: ["list", "Text & images", "List", "Listă", "Text și imagini"],
  locations: ["locations", "Contact", "Address", "Adresă", "Contact"],
  login: ["login", "Members", "Log in", "Intrare în cont", "Membri"],
  navbar: ["navbar", "Page", "Header", "Antet", "Pagină"],
  canvas: ["canvas", "Sections", "Free canvas", "Pânză liberă", "Secțiuni"],
  press: ["press", "Lists", "Press", "Presă", "Liste"],
  pricing: ["pricing", "Lists", "Prices", "Prețuri", "Liste"],
  hours: ["hours", "Contact", "Opening hours", "Program", "Contact"],
  social: ["social", "Contact", "Social media", "Rețele sociale", "Contact"],
  section: ["section", "Page", "Section", "Secțiune", "Pagină"],
  logos: ["logos", "Sections", "Logos", "Sigle", "Secțiuni"],
  spacer: ["spacer", "Page", "Spacer", "Spațiu", "Pagină"],
  news: ["calendar", "Lists", "News", "Știri", "Liste"],
  footer: ["footer", "Page", "Footer", "Subsol", "Pagină"],
  text: ["text", "Text & images", "Text", "Text", "Text și imagini"],
  video: ["video", "Text & images", "Video", "Video", "Text și imagini"],
};
const IDS = Object.keys(EXPECTED);
const MODES = ["editor", "site", "static"];
// The blocks built around a list: empty, they show nothing on the site and a hint in the editor.
const LISTS = ["faq", "timeline", "list", "locations", "press", "pricing", "hours", "social", "logos", "news"];

// U+2028 and U+2029, built from their codes so this file never holds them literally.
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`);
const EVIL = "<script>alert(1)</script>";
const JS = "javascript:alert(1)";
const USER = { id: "u", name: "Ana", email: "ana@example.com" };

let root;
let components;
before(async () => {
  root = makeProject();
  for (const id of IDS) cpSync(join(PROJECT_ROOT, "components", `${id}.js`), join(root, "components", `${id}.js`));
  components = await createProject(root, { warn: assert.fail, error: assert.fail }).loadComponents();
});
after(() => removeProject(root));

// Renders one block and returns only what is inside its wrapper. Every render error fails the test.
function render(type, props = {}, mode = "site", { slots, lang, user, site, missingPages } = {}) {
  const errors = [];
  const { body } = renderParts({
    page: { blocks: [{ id: "x", type, props, slots }] },
    site: { name: "Luna Café", loginPage: "/login", ...(lang ? { lang } : {}), ...site },
    components,
    mode,
    user: mode === "site" ? (user === undefined ? USER : user) : null,
    onError: (e) => errors.push(`${e.type}: ${e.error?.message || "missing"}`),
    missingPages,
  });
  assert.deepEqual(errors, [], `${type} (${mode})`);
  return body.match(/data-id="x">([^]*)<\/div><\/div><\/main>/)[1];
}

// "Empty" props: lists without items, empty texts, checkboxes off.
function empty(type) {
  return Object.fromEntries(
    Object.entries(components[type].props || {}).map(([key, field]) => [key, field.type === "list" ? [] : field.type === "checkbox" ? false : ""]),
  );
}

describe("the blocks of this half", () => {
  test("load without warnings, with their icon, palette category and name", () => {
    assert.deepEqual(Object.keys(components).sort(), [...IDS].sort());
    for (const [id, [icon, category, name]] of Object.entries(EXPECTED)) {
      const c = components[id];
      assert.equal(c.icon, icon, id);
      assert.equal(c.category, category, id);
      assert.equal(c.name, name, id);
      assert.deepEqual(validateComponent(c), [], id);
    }
    assert.equal(components.login.needsServer, true);
    assert.deepEqual(components.section.slots, { content: "Content" });
    assert.deepEqual(components.canvas.slots, { content: "Content" });
    assert.deepEqual(components.footer.slots, { extra: "Extra" });
  });

  test("each has a description and a tip: one sentence on one line, ending with a period", () => {
    for (const [id, c] of Object.entries(components)) {
      for (const key of ["description", "tip"]) {
        assert.equal(typeof c[key], "string", `${id}.${key}`);
        assert.match(c[key], /^\S.*\.$/, `${id}.${key}`);
        assert.ok(!c[key].includes("\n"), `${id}.${key}`);
        assert.match(c.i18n.ro[key], /^\S.*\.$/, `${id}.i18n.ro.${key}`);
      }
    }
  });

  test("i18n.ro carries the Romanian editor texts for every setting, list field, option and area, and nothing more", () => {
    // A Romanian label for each field; a help only where the English one has a help; every option of a
    // choice whose labels aren't just its values (like "2" or "3").
    const check = (schema, ro, where) => {
      assert.deepEqual(Object.keys(ro || {}).sort(), Object.keys(schema).sort(), where);
      for (const [key, field] of Object.entries(schema)) {
        const at = `${where}.${key}`;
        const t = ro[key];
        assert.equal(typeof t.label, "string", `${at}.label`);
        assert.ok(t.label.trim(), `${at}.label`);
        assert.equal("help" in t, "help" in field, `${at}.help`);
        if (field.type === "choice") {
          const plain = field.options.every((o) => o.label === o.value);
          if (plain) assert.equal(t.options, undefined, `${at}.options`);
          else assert.deepEqual(Object.keys(t.options || {}), field.options.map((o) => o.value), `${at}.options`);
        } else assert.equal(t.options, undefined, `${at}.options`);
        if (field.type === "list") check(field.fields, t.fields, `${at}.fields`);
        else assert.equal(t.fields, undefined, `${at}.fields`);
      }
    };
    for (const [id, [, , , roName, roCategory]] of Object.entries(EXPECTED)) {
      const c = components[id];
      const ro = c.i18n?.ro;
      assert.ok(ro, id);
      assert.deepEqual(Object.keys(c.i18n), ["ro"], id);
      assert.equal(ro.name, roName, id);
      assert.equal(ro.category, roCategory, id);
      check(c.props, ro.props, `${id}.props`);
      if (c.slots) assert.deepEqual(Object.keys(ro.slots), Object.keys(c.slots), id);
      else assert.equal(ro.slots, undefined, id);
    }
    assert.deepEqual(components.section.i18n.ro.slots, { content: "Conținut" });
    assert.deepEqual(components.footer.i18n.ro.slots, { extra: "Extra" });
  });

  test("the Romanian texts use ș and ț with a comma below, and the English ones have no Romanian letters", () => {
    for (const id of IDS) {
      const source = readFileSync(join(PROJECT_ROOT, "components", `${id}.js`), "utf8");
      assert.ok(!/[\u015f\u0163\u015e\u0162]/.test(source), `${id}: s or t with a cedilla`);
      assert.ok(!LINE_SEPARATORS.test(source), `${id}: U+2028/U+2029`);
      const c = components[id];
      const english = JSON.stringify([c.name, c.category, c.description, c.tip, c.props, c.slots]);
      assert.ok(!/[ăâîșțĂÂÎȘȚ„]/.test(english), `${id}: Romanian text outside i18n.ro`);
    }
  });

  test("render with their defaults in the editor, on the site and in the export, and show something in the editor", () => {
    for (const id of IDS) {
      for (const mode of MODES) {
        const out = render(id, {}, mode);
        if (mode === "editor") assert.ok(out.trim(), `${id}: something shows in the editor`);
        assert.ok(!out.includes("__empty"), `${id} (${mode}): no "empty" hint with the defaults`);
      }
    }
  });

  test("render with empty settings: the list blocks show nothing on the site and a hint in the editor", () => {
    for (const id of IDS) for (const mode of MODES) render(id, empty(id), mode);
    for (const id of LISTS) {
      assert.equal(render(id, empty(id), "site"), "", id);
      assert.equal(render(id, empty(id), "static"), "", id);
      const editor = render(id, empty(id), "editor");
      assert.ok(editor.includes(`class="${id}__empty"`), id);
      assert.match(editor, /in the panel on the right\./, id);
      assert.match(render(id, empty(id), "editor", { lang: "ro" }), /din panoul din dreapta\./, `${id} (ro)`);
    }
  });

  test("a list with empty items is like an empty list", () => {
    assert.equal(render("faq", { questions: [{ question: "", answer: "x" }] }), "");
    assert.equal(render("timeline", { moments: [{ year: "", title: "", text: "" }] }), "");
    assert.equal(render("list", { items: [{ text: "" }] }), "");
    assert.equal(render("locations", { places: [{ name: "", address: "", phone: "0700" }] }), "");
    assert.equal(render("press", { articles: [{ source: "", date: "2026-01-01", text: "", link: "/x" }] }), "");
    assert.equal(render("pricing", { items: [{ name: "", description: "x", price: "", tag: "New" }] }), "");
    assert.equal(render("hours", { rows: [{ days: "", hours: "" }] }), "");
    assert.equal(render("social", { links: [{ network: "facebook", link: "" }] }), "");
    assert.equal(render("logos", { logos: [{ image: "", name: "", link: "/x" }] }), "");
    assert.equal(render("news", { items: [{ title: "", text: "", date: "2026-01-01" }] }), "");
  });

  test("no choice or number lets a class or a style slip in: a hostile value becomes the default", () => {
    const HOSTILE = 'left zz-sneaky b-cell--circle" style="color:red';
    for (const [id, c] of Object.entries(components)) {
      const props = {};
      for (const [key, field] of Object.entries(c.props || {})) {
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
    // A custom section color only gets in as a hex color.
    assert.ok(render("section", { background: "custom", color: "#123abc" }).includes('style="background:#123abc;--b-grid-background:#123abc"'));
    assert.ok(render("section", { background: "custom", color: "red;}</style><script>" }).includes('style=""'));
  });

  test("hostile texts: <script> shows as text, never as a tag", () => {
    const cases = {
      faq: { title: EVIL, questions: [{ question: EVIL, answer: EVIL }] },
      timeline: { title: EVIL, moments: [{ year: EVIL, title: EVIL, text: EVIL }] },
      list: { title: EVIL, items: [{ text: EVIL }] },
      locations: { title: EVIL, mapText: EVIL, places: [{ label: EVIL, name: EVIL, address: EVIL, hours: EVIL, phone: EVIL, tags: `${EVIL},${EVIL}`, mapLink: "/m" }] },
      login: { title: EVIL, buttonText: EVIL, signupQuestion: EVIL, signupLinkText: EVIL, noServerMessage: EVIL },
      navbar: { logoText: EVIL, links: [{ text: EVIL, link: "/" }], buttonText: EVIL, showAccount: true, loginText: EVIL, greeting: EVIL, logoutText: EVIL },
      press: { title: EVIL, subtitle: EVIL, articles: [{ source: EVIL, date: EVIL, text: EVIL, link: "/x" }] },
      pricing: { title: EVIL, subtitle: EVIL, items: [{ name: EVIL, description: EVIL, price: EVIL, tag: EVIL }] },
      hours: { title: EVIL, note: EVIL, rows: [{ days: EVIL, hours: EVIL }] },
      social: { label: EVIL, showNames: true, links: [{ network: EVIL, link: "https://example.com" }] },
      logos: { label: EVIL, logos: [{ image: "/a.svg", name: EVIL, link: "" }, { image: "", name: EVIL }] },
      news: { title: EVIL, items: [{ date: EVIL, title: EVIL, text: EVIL, link: "/x" }] },
      footer: { text: EVIL, links: [{ text: EVIL, link: "/" }], copyright: EVIL },
      text: { title: EVIL, text: EVIL },
      video: { url: "https://youtu.be/abcdefghijk", title: EVIL },
    };
    for (const [id, props] of Object.entries(cases)) {
      for (const mode of MODES) {
        const out = render(id, props, mode);
        assert.ok(!out.includes("<script"), `${id} (${mode})`);
        if (!(id === "video" && mode === "editor")) assert.ok(out.includes("&lt;script&gt;"), `${id} (${mode}): the text stays visible, escaped`);
      }
    }
    // The site's name and the logged-in user's name are text too.
    const header = render("navbar", { showAccount: true }, "site", { site: { name: EVIL }, user: { id: "u", name: EVIL, email: "x@example.com" } });
    assert.ok(!header.includes("<script") && header.split("&lt;script&gt;").length === 3, header);
    assert.ok(!render("footer", {}, "site", { site: { name: EVIL } }).includes("<script"));
  });

  test("javascript: links become “#” everywhere (href and src)", () => {
    const cases = {
      locations: { places: [{ name: "L", address: "a", mapLink: JS }] },
      login: { signupLink: JS },
      navbar: { logoImage: JS, links: [{ text: "A", link: JS }], buttonText: "B", buttonLink: JS },
      press: { articles: [{ source: "Z", date: "", text: "t", link: JS }] },
      social: { links: [{ network: "website", link: JS }, { network: "whatsapp", link: JS }, { network: "facebook", link: `  ${JS}` }] },
      logos: { logos: [{ image: JS, name: "X", link: JS }] },
      news: { items: [{ title: "T", link: JS }] },
      footer: { links: [{ text: "A", link: JS }] },
      list: { items: [{ text: `[x](${JS})` }] },
      faq: { questions: [{ question: "Q", answer: `[x](${JS})` }] },
      text: { title: `[x](${JS})`, text: `[y](${JS})` },
    };
    for (const [id, props] of Object.entries(cases)) {
      const out = render(id, props);
      assert.ok(!out.includes("javascript:"), id);
      assert.ok(out.includes('href="#"') || out.includes('src="#"'), id);
    }
    assert.ok(render("logos", { logos: [{ image: JS, name: "X" }] }).includes('src="#"'));
    assert.ok(render("navbar", {}, "site", { site: { loginPage: JS } }).includes('href="/"'));
  });

  test("they lay themselves out by their container, not the screen (only the header's phone menu uses @media)", () => {
    for (const [id, c] of Object.entries(components)) {
      const css = String(c.css || "");
      assert.equal([...css.matchAll(/@media \(max-width/g)].length, id === "navbar" ? 1 : 0, id);
      assert.ok(!/\d(\.\d+)?vw/.test(css), `${id}: vw instead of cqi`);
      assert.ok(!/--(primar|fundal|suprafata|raza)\b|b-bloc\b|b-caseta|b-grila|b-gol\b|b-btn--contur/.test(css), `${id}: an old Romanian class or variable`);
    }
  });
});

describe("FAQ, Timeline, List, Text: formatting", () => {
  test("FAQ: <details> with the question; the answer has paragraphs with formatting", () => {
    const out = render("faq", { title: "Questions", questions: [{ question: "Plant milk?", answer: "Yes, [ask us](/contact).\n\nAlways." }] });
    assert.ok(out.includes('<h2 class="faq__title">Questions</h2>'));
    assert.ok(out.includes('<summary class="faq__question"><span>Plant milk?</span><span class="faq__sign" aria-hidden="true"></span></summary>'));
    assert.ok(out.includes('<div class="faq__answer"><p>Yes, <a href="/contact">ask us</a>.</p><p>Always.</p></div>'));
  });

  test("Timeline: the year in a pill, a title and paragraphs; without a year, a dot; one moment or twenty", () => {
    const out = render("timeline", { title: "How we *grew*", moments: [{ year: "2019", title: "Start", text: "One **two**\n\nThree" }, { year: "", title: "No year", text: "" }] });
    assert.ok(out.includes('<h2 class="timeline__heading">How we <em>grew</em></h2>'));
    assert.ok(out.includes('<span class="timeline__year">2019</span>'));
    assert.ok(out.includes('<h3 class="timeline__title">Start</h3>'));
    assert.ok(out.includes("<p>One <strong>two</strong></p><p>Three</p>"));
    assert.ok(out.includes('<span class="timeline__dot" aria-hidden="true"></span>'));
    assert.equal(out.split("<li ").length - 1, 2);
    const many = Array.from({ length: 20 }, (_, i) => ({ year: String(2007 + i), title: `Year ${i}`, text: "" }));
    assert.equal(render("timeline", { moments: many }).split("<li ").length - 1, 20);
  });

  test("List: checkmarks with an icon, bullets or numbers (ol); formatted items; the columns as a class", () => {
    const checks = render("list", { items: [{ text: "Wi-Fi *free*" }, { text: "[Menu](/products)" }] });
    assert.ok(checks.includes('<ul class="list__items list__items--checks list__items--1">'));
    assert.ok(checks.includes('<span class="list__check"><svg '));
    assert.ok(checks.includes("<span>Wi-Fi <em>free</em></span>"));
    assert.ok(checks.includes('<a href="/products">Menu</a>'));
    const numbers = render("list", { style: "numbers", columns: "2", items: [{ text: "One" }] });
    assert.ok(numbers.includes('<ol class="list__items list__items--numbers list__items--2">'));
    assert.ok(!numbers.includes("list__check"));
    assert.ok(render("list", { style: "bullets" }).includes('<ul class="list__items list__items--bullets'));
    assert.ok(render("list", { style: "stars", columns: "3" }).includes("list__items--checks list__items--1"));
    assert.equal(components.list.props.items.fields.text.format, true);
  });

  test("Text: the title with formatting, h1 or h2, paragraphs and lists; the alignment as a class", () => {
    assert.ok(render("text", { title: "About *us* <b>" }).includes("<h2>About <em>us</em> &lt;b&gt;</h2>"));
    assert.ok(render("text", { title: "Hi", headingLevel: "h1" }).includes("<h1>Hi</h1>"));
    assert.ok(render("text", { text: "We have:\n- coffee\n- tea" }).includes("<p>We have:</p><ul><li>coffee</li><li>tea</li></ul>"));
    assert.ok(render("text", { align: "center" }).includes('class="b-block text text--center"'));
    assert.ok(render("text", { align: "middle" }).includes('class="b-block text text--left"'));
    assert.equal(components.text.props.title.format, true);
  });
});

describe("News and Press: dates and order", () => {
  const items = [
    { date: "2025-03-01", title: "Old", text: "a" },
    { date: "not a date", title: "No date", text: "b" },
    { date: "2026-10-03", title: "New", text: "c", link: "/contact" },
    { date: "2025-12-22", title: "Middle", text: "d" },
  ];
  const titles = (out) => [...out.matchAll(/<h3 class="news__title">(?:<a [^>]*>)?([^<]+)/g)].map((m) => m[1]);

  test("News: newest first, no valid date → last; <time> only for valid dates, in the site's language", () => {
    const out = render("news", { items });
    assert.deepEqual(titles(out), ["New", "Middle", "Old", "No date"]);
    assert.ok(out.includes('<time class="news__date" datetime="2026-10-03">October 3, 2026</time>'));
    assert.ok(out.includes('datetime="2025-12-22">December 22, 2025</time>'));
    assert.equal(out.split("<time").length - 1, 3);
    assert.ok(out.includes('<h3 class="news__title"><a href="/contact">New</a></h3>'));
    assert.ok(render("news", { items }, "site", { lang: "ro" }).includes('datetime="2026-10-03">3 octombrie 2026</time>'));
    assert.deepEqual(titles(render("news", { items, newestFirst: false })), ["Old", "No date", "New", "Middle"]);
  });

  test("News: the text has formatted paragraphs and the heading is formatted", () => {
    const out = render("news", { title: "What's *new*", items: [{ date: "", title: "", text: "One **two**\n\nThree" }] });
    assert.ok(out.includes('<h2 class="news__heading">What\'s <em>new</em></h2>') || out.includes('<h2 class="news__heading">What&#39;s <em>new</em></h2>'));
    assert.ok(out.includes("<p>One <strong>two</strong></p><p>Three</p>"));
    assert.ok(!out.includes("<h3"));
  });

  const articles = [
    { source: "Old", date: "2025-03-01", text: "a", link: "" },
    { source: "No date", date: "not a date", text: "b", link: "" },
    { source: "New", date: "2026-10-03", text: "c", link: "https://example.com/x" },
    { source: "Middle", date: "2025-12-22", text: "d", link: "/contact" },
    { source: "Impossible", date: "2026-02-30", text: "e", link: "" },
  ];
  const sources = (out) => [...out.matchAll(/<span class="press__source">(?:<a [^>]*>)?([^<]+)/g)].map((m) => m[1]);

  test("Press: newest first, bad dates last; the link sits on the source, another site opens in a new tab", () => {
    const out = render("press", { articles });
    assert.deepEqual(sources(out), ["New", "Middle", "Old", "No date", "Impossible"]);
    assert.ok(out.includes('<time class="press__date" datetime="2026-10-03">October 3, 2026</time>'));
    assert.equal(out.split("<time").length - 1, 3);
    assert.ok(!out.includes("2026-02-30"));
    assert.ok(out.includes('<a class="press__link" href="https://example.com/x" target="_blank" rel="noopener">New<span class="press__arrow" aria-hidden="true"> ↗</span></a>'));
    assert.ok(out.includes('<a class="press__link" href="/contact">Middle</a>'));
    assert.equal(out.split("<a ").length - 1, 2);
    assert.deepEqual(sources(render("press", { articles, newestFirst: false })), ["Old", "No date", "New", "Middle", "Impossible"]);
    assert.ok(render("press", { articles }, "site", { lang: "ro" }).includes(">22 decembrie 2025</time>"));
  });

  test("Press: a formatted title, paragraphs in the subtitle and the excerpt; the columns as a class", () => {
    const out = render("press", { title: "They *wrote*", subtitle: "A few lines.", columns: "2", articles: [{ source: "S", date: "", text: "One **two**\n\nThree", link: "" }] });
    assert.ok(out.includes("<h2>They <em>wrote</em></h2>"));
    assert.ok(out.includes("<p>A few lines.</p>"));
    assert.ok(out.includes('<div class="press__text"><p>One <strong>two</strong></p><p>Three</p></div>'));
    assert.ok(out.includes("press__grid--2"));
    assert.ok(render("press", { columns: "9" }).includes("press__grid--3"));
  });
});

describe("Address, Prices, Logos", () => {
  test("Address: lines with <br>, the phone as a tel: link, tags from commas, the map in a new tab", () => {
    const out = render("locations", {
      title: "Where *we are*",
      columns: "2",
      mapText: "Open the map",
      places: [
        {
          label: "Downtown",
          name: "Luna Café",
          address: "12 Linden Street\n\n  Next to the **park**  \n",
          hours: "Mon–Fri 8 am–8 pm",
          phone: "+1 (555) 010-0123",
          tags: " Terrace, ,Free Wi-Fi ,",
          mapLink: "https://maps.example.com/?q=Linden+12&z=17",
        },
      ],
    });
    assert.ok(out.includes('<h2 class="locations__heading">Where <em>we are</em></h2>'));
    assert.ok(out.includes('<ul class="locations__grid locations__grid--2">'));
    assert.ok(out.includes('<span class="locations__label">Downtown</span>'));
    assert.ok(out.includes('<h3 class="locations__name">Luna Café</h3>'));
    assert.ok(out.includes('<p class="locations__address">12 Linden Street<br>Next to the <strong>park</strong></p>'));
    assert.ok(out.includes('<p class="locations__hours">Mon–Fri 8 am–8 pm</p>'));
    assert.ok(out.includes('<a href="tel:+15550100123">+1 (555) 010-0123</a>'));
    assert.ok(out.includes('<ul class="locations__tags"><li>Terrace</li><li>Free Wi-Fi</li></ul>'));
    assert.ok(out.includes('<a class="locations__map" href="https://maps.example.com/?q=Linden+12&amp;z=17" target="_blank" rel="noopener">Open the map<span aria-hidden="true"> ↗</span></a>'));
    assert.ok(out.includes('<span class="locations__pin"><svg '));
  });

  test("Address: what's missing leaves no trace; a phone without digits stays text", () => {
    const out = render("locations", { places: [{ name: "Just a name", address: "", phone: "call us", tags: " , ", mapLink: "" }] });
    assert.ok(out.includes('<p class="locations__phone">call us</p>'));
    assert.ok(!out.includes("locations__address") && !out.includes("locations__tags") && !out.includes("locations__map") && !out.includes("tel:"));
    assert.ok(!render("locations", { mapText: "", places: [{ name: "N", address: "A", mapLink: "/m" }] }).includes("locations__map"));
    assert.ok(render("locations", { columns: "7" }).includes("locations__grid--1"));
  });

  test("Prices: name, dotted line, price, tag and a formatted description; style and columns as classes", () => {
    const out = render("pricing", {
      title: "Good *coffee*",
      subtitle: "Our own beans.",
      style: "cards",
      columns: "1",
      items: [{ name: "Espresso", description: "Short and **intense**.", price: "$3", tag: "New" }, { name: "Water", description: "", price: "", tag: "" }],
    });
    assert.ok(out.includes('class="b-block pricing pricing--cards"'));
    assert.ok(out.includes("<h2>Good <em>coffee</em></h2>"));
    assert.ok(out.includes("<p>Our own beans.</p>"));
    assert.ok(out.includes('<ul class="pricing__list pricing__list--1">'));
    assert.ok(out.includes('<span class="pricing__name">Espresso <span class="pricing__tag">New</span></span>'));
    assert.ok(out.includes('<span class="pricing__dots" aria-hidden="true"></span>'));
    assert.ok(out.includes('<span class="pricing__price">$3</span>'));
    assert.ok(out.includes('<div class="pricing__description"><p>Short and <strong>intense</strong>.</p></div>'));
    assert.equal(out.split('<span class="pricing__price">').length - 1, 1);
    assert.equal(out.split("pricing__description").length - 1, 1);
    const fallback = render("pricing", { style: "x", columns: "5" });
    assert.ok(fallback.includes("pricing--lines") && fallback.includes("pricing__list--2"));
  });

  test("Logos: the name is the alt text, a link opens in a new tab; without an image the name stays", () => {
    const out = render("logos", {
      label: "Partners",
      logos: [
        { image: "/assets/demo/logos/green-market.svg", name: "Green Market", link: "https://example.com" },
        { image: "/a.svg", name: "No link", link: "" },
        { image: "", name: "Just a name", link: "" },
      ],
    });
    assert.ok(out.includes('<p class="logos__label">Partners</p>'));
    assert.ok(out.includes('<a class="logos__link" href="https://example.com" target="_blank" rel="noopener"><img class="logos__image" src="/assets/demo/logos/green-market.svg" alt="Green Market"'));
    assert.ok(out.includes('<img class="logos__image" src="/a.svg" alt="No link"'));
    assert.ok(out.includes('<span class="logos__name">Just a name</span>'));
    assert.equal(out.split("<a ").length - 1, 1);
    assert.ok(render("logos").includes('class="b-block logos logos--medium logos--gray"'));
    assert.ok(render("logos", { grayscale: false, height: "large" }).includes('class="b-block logos logos--large"'));
    assert.ok(render("logos", { height: "huge" }).includes("logos--medium"));
  });
});

describe("Opening hours", () => {
  const days = (out) => [...out.matchAll(/<li class="hours__row[^"]*"(?: data-days="([^"]*)")?>/g)].map((m) => m[1] ?? null);

  test("the days are understood in English, as a range or a list; what isn't understood gets no data-days", () => {
    const out = render("hours", {
      rows: [
        { days: "Monday–Friday", hours: "8 am–8 pm" },
        { days: "Mon - Wed", hours: "8–8" },
        { days: "Saturday & Sunday", hours: "9–6" },
        { days: "Saturdays", hours: "9–6" },
        { days: "Friday to Monday", hours: "x" },
        { days: "Tues through Thurs", hours: "x" },
        { days: "Daily", hours: "8–10" },
        { days: "Every day", hours: "8–10" },
        { days: "Weekdays", hours: "8–4" },
        { days: "Weekends", hours: "10–4" },
        { days: "Public holidays", hours: "Closed" },
        { days: "Thursday", hours: "closed" },
        { days: "Sunrise brunch", hours: "x" },
      ],
    });
    assert.deepEqual(days(out), [
      "1,2,3,4,5",
      "1,2,3",
      "6,0",
      "6",
      "5,6,0,1",
      "2,3,4",
      "1,2,3,4,5,6,0",
      "1,2,3,4,5,6,0",
      "1,2,3,4,5",
      "6,0",
      null,
      "4",
      null,
    ]);
    assert.ok(out.includes('<li class="hours__row hours__row--closed">'));
    assert.ok(out.includes('<li class="hours__row hours__row--closed" data-days="4">'));
    assert.ok(out.includes('<span class="hours__days">Public holidays</span>'));
    assert.ok(out.includes('<span class="hours__time">Closed</span>'));
  });

  test("Romanian days work too, with or without diacritics", () => {
    const out = render("hours", {
      rows: [
        { days: "Luni–Vineri", hours: "8–20" },
        { days: "luni - miercuri", hours: "8–20" },
        { days: "Sâmbătă, Duminică", hours: "9–18" },
        { days: "sambata si duminica", hours: "9–18" },
        { days: "Vineri – Luni", hours: "x" },
        { days: "Zilnic", hours: "8–22" },
        { days: "Sărbători legale", hours: "Închis" },
        { days: "Joi", hours: "inchis" },
      ],
    });
    assert.deepEqual(days(out), ["1,2,3,4,5", "1,2,3", "6,0", "6,0", "5,6,0,1", "1,2,3,4,5,6,0", null, "4"]);
    assert.equal(out.split("hours__row--closed").length - 1, 2);
  });

  test("with “Highlight today” off there's no data-days; the title and the note are formatted", () => {
    const out = render("hours", { title: "When to *come*", note: "The terrace is **open**.", highlightToday: false });
    assert.ok(!out.includes("data-days"));
    assert.ok(out.includes('<h2 class="hours__title">When to <em>come</em></h2>'));
    assert.ok(out.includes('<p class="hours__note">The terrace is <strong>open</strong>.</p>'));
  });

  test("js(): on the site it marks today's rows; in the editor nothing", () => {
    const today = String(new Date().getDay());
    const other = String((new Date().getDay() + 1) % 7);
    const row = (list) => ({ dataset: { days: list }, classList: { added: [], add(c) { this.added.push(c); } } });
    const rows = [row(today), row(other), row(`${other},${today}`)];
    const el = { querySelectorAll: (selector) => (assert.equal(selector, ".hours__row[data-days]"), rows) };
    components.hours.js(el, {}, { mode: "site" });
    assert.deepEqual(rows.map((r) => r.classList.added), [["hours__row--today"], [], ["hours__row--today"]]);
    const fresh = [row(today)];
    components.hours.js({ querySelectorAll: () => fresh }, {}, { mode: "editor" });
    assert.deepEqual(fresh[0].classList.added, []);
  });
});

describe("Social media", () => {
  const hrefs = (out) => [...out.matchAll(/<a class="social__link" href="([^"]*)" aria-label="([^"]*)"/g)].map((m) => [m[2], m[1]]);

  test("the addresses: WhatsApp from a number, email → mailto:, phone → tel:, the rest through url(); other sites in a new tab", () => {
    const out = render("social", {
      links: [
        { network: "whatsapp", link: "+1 555 010 0123" },
        { network: "whatsapp", link: "0044 7700 900123" },
        { network: "whatsapp", link: "https://wa.me/15550100124" },
        { network: "email", link: "ana@example.com" },
        { network: "email", link: "mailto:b@example.com" },
        { network: "phone", link: "(555) 010-0123" },
        { network: "website", link: "https://example.com" },
        { network: "facebook", link: "facebook.com/luna" },
        { network: "tiktok", link: "" },
        { network: "something-else", link: "/x" },
      ],
    });
    assert.deepEqual(hrefs(out), [
      ["WhatsApp", "https://wa.me/15550100123"],
      ["WhatsApp", "https://wa.me/447700900123"],
      ["WhatsApp", "https://wa.me/15550100124"],
      ["Email", "mailto:ana@example.com"],
      ["Email", "mailto:b@example.com"],
      ["Phone", "tel:5550100123"],
      ["Website", "https://example.com"],
      ["Facebook", "facebook.com/luna"],
      // An unknown network (written by hand) takes the field's default, the first one in the list.
      ["Facebook", "/x"],
    ]);
    assert.equal(out.split('target="_blank" rel="noopener"').length - 1, 4);
    assert.equal(out.split("<svg ").length - 1, 9);
    assert.ok(!out.includes("social__name"));
  });

  test("a local WhatsApp number (one leading 0) gets +40 only on a Romanian site; the names follow the site's language", () => {
    const links = [{ network: "whatsapp", link: "0722 000 000" }, { network: "whatsapp", link: "+40 722-000-001" }, { network: "whatsapp", link: "0040722000002" }];
    assert.deepEqual(hrefs(render("social", { links }, "site", { lang: "ro" })).map((h) => h[1]), [
      "https://wa.me/40722000000",
      "https://wa.me/40722000001",
      "https://wa.me/40722000002",
    ]);
    assert.equal(hrefs(render("social", { links })).map((h) => h[1])[0], "https://wa.me/0722000000");
    const ro = render("social", { showNames: true, links: [{ network: "phone", link: "0700 000 000" }, { network: "website", link: "https://example.ro" }] }, "site", { lang: "ro" });
    assert.deepEqual(hrefs(ro), [["Telefon", "tel:0700000000"], ["Site", "https://example.ro"]]);
    assert.ok(ro.includes('<span class="social__name">Telefon</span>'));
  });

  test("a formatted label, the network name on request, the alignment as a class; 10 networks with a line drawing", () => {
    const out = render("social", { label: "Follow *us*", align: "center", showNames: true, links: [{ network: "youtube", link: "https://youtube.com/@luna" }] });
    assert.ok(out.includes('class="b-block social social--center"'));
    assert.ok(out.includes('<span class="social__label">Follow <em>us</em></span>'));
    assert.ok(out.includes('<span class="social__name">YouTube</span>'));
    assert.ok(out.includes('stroke-width="1.75"'));
    const values = components.social.props.links.fields.network.options.map((o) => o.value);
    assert.deepEqual(values, ["facebook", "instagram", "tiktok", "youtube", "whatsapp", "linkedin", "x", "email", "phone", "website"]);
    const link = { whatsapp: "+1 555 010 0123", phone: "555 010 0123", email: "a@example.com" };
    for (const network of values) assert.ok(render("social", { links: [{ network, link: link[network] || "https://example.com" }] }).includes("<svg "), network);
    // A phone or WhatsApp without a single digit doesn't become a link.
    assert.equal(render("social", { links: [{ network: "phone", link: "call us" }, { network: "whatsapp", link: "write" }] }), "");
  });
});

describe("Header, Footer, Section, Spacer", () => {
  test("Header: the site name, links, a button; the menu labels follow the site's language", () => {
    const out = render("navbar", { buttonText: "Book a table", buttonLink: "/contact" });
    assert.ok(out.includes('<header class="navbar navbar--sticky">'));
    assert.ok(out.includes("<span>Luna Café</span>"));
    assert.ok(out.includes('<a class="navbar__link" href="/">Home</a>'));
    assert.ok(out.includes('<a class="b-btn navbar__button" href="/contact">Book a table</a>'));
    assert.ok(out.includes('aria-controls="navbar-x" aria-label="Menu"'));
    assert.ok(out.includes('<nav class="navbar__nav" id="navbar-x" aria-label="Main menu">'));
    const ro = render("navbar", {}, "site", { lang: "ro" });
    assert.ok(ro.includes('aria-label="Meniu"') && ro.includes('aria-label="Meniu principal"'));
    assert.ok(render("navbar", {}, "site", { site: { name: "" } }).includes("<span>My site</span>"));
    assert.ok(render("navbar", { sticky: false }).includes('<header class="navbar ">'));
  });

  test("Header: the visitor's account, only with a server; the login page comes from site.json", () => {
    const member = render("navbar", { showAccount: true });
    assert.ok(member.includes('<div class="navbar__account" data-state="member" data-login="/login">'));
    assert.ok(member.includes('<span class="navbar__greeting">Hi, <strong>Ana</strong></span>'));
    assert.ok(member.includes('<button class="navbar__logout" type="button">Log out</button>'));
    const visitor = render("navbar", { showAccount: true }, "site", { user: null, site: { loginPage: "/members/login" } });
    assert.ok(visitor.includes('data-state="visitor" data-login="/members/login"'));
    assert.ok(visitor.includes('<a class="navbar__login" href="/members/login">Log in</a>'));
    assert.ok(render("navbar", { showAccount: true }, "editor").includes('data-state="visitor"'));
    assert.ok(!render("navbar", { showAccount: true }, "static").includes("navbar__account"));
    assert.ok(!render("navbar").includes("navbar__account"));
  });

  test("Header and Footer: a link to a page that isn't there (members only, in the static export) is left out", () => {
    const links = [
      { text: "Home", link: "/" },
      { text: "My account", link: "/account" },
      { text: "Offers", link: "/account/?tab=offers#top" },
      { text: "Elsewhere", link: "https://example.com/account" },
    ];
    const missingPages = new Set(["/account"]);
    for (const type of ["navbar", "footer"]) {
      const out = render(type, { links, buttonText: "Account", buttonLink: "/account" }, "static", { missingPages });
      assert.ok(out.includes('href="/"') && out.includes('href="https://example.com/account"'), type);
      assert.ok(!out.includes('href="/account'), type);
      assert.ok(!out.includes("My account") && !out.includes("Offers"), type);
      // Without missing pages (the server, the editor), every link stays.
      for (const mode of ["site", "editor"]) assert.ok(render(type, { links }, mode).includes('href="/account"'), `${type} (${mode})`);
    }
    assert.ok(!render("navbar", { links, buttonText: "Account", buttonLink: "/account" }, "static", { missingPages }).includes("navbar__actions"));
  });

  test("Footer: the “Extra” area sits between the links and the copyright line; empty, it leaves no trace on the site", () => {
    const year = new Date().getFullYear();
    const plain = render("footer");
    assert.match(plain, /<div class="footer__extra"><div class="b-slot"><\/div><\/div>\s*<p class="footer__copyright">© Luna Café \d{4}<\/p>/);
    assert.ok(plain.includes(`© Luna Café ${year}`));
    assert.ok(plain.includes('<nav class="footer__nav" aria-label="Footer links">'));
    assert.ok(render("footer", {}, "site", { lang: "ro" }).includes('aria-label="Linkuri în subsol"'));
    assert.ok(render("footer", { copyright: "© Luna", showYear: false }).includes('<p class="footer__copyright">© Luna</p>'));
    const withExtra = render("footer", {}, "site", { slots: { extra: [{ id: "h", type: "hours", props: {} }] } });
    assert.ok(withExtra.includes('<div class="footer__extra"><div class="b-slot"><div class="c-hours" data-c="hours" data-id="h">'));
    const [links, extra, copyright] = ["footer__links", "footer__extra", "footer__copyright"].map((c) => withExtra.indexOf(c));
    assert.ok(links < extra && extra < copyright);
    assert.ok(render("footer", {}, "editor").includes("Drag a block into “Extra”"));
    assert.ok(components.footer.css.includes(".footer__extra:has([data-c], .b-empty) { margin-top: 2rem; }"));
  });

  test("Section: its area, the classes from the list; empty, it leaves no band on the site", () => {
    assert.ok(components.section.css.includes(".section:not(:has(> .section__inner > .b-slot > *)) { display: none; }"));
    assert.ok(render("section", {}, "editor").includes("b-empty"));
    assert.ok(render("section", {}, "editor").includes("Drag a block into “Content”"));
    const out = render("section", { background: "primary", spacing: "large", align: "center" }, "site", { slots: { content: [{ id: "t", type: "text", props: {} }] } });
    assert.ok(out.includes('<section class="b-block section section--primary section--large section--center" style="">'));
    assert.ok(out.includes('<div class="b-container section__inner"><div class="b-slot"><div class="c-text" data-c="text" data-id="t">'));
    assert.ok(render("section").includes("section--surface section--medium section--left"));
  });

  test("Spacer: the height as a class, an optional line, stripes only in the editor", () => {
    assert.ok(render("spacer").includes('<div class="spacer spacer--medium " aria-hidden="true">'));
    assert.ok(render("spacer", { height: "x-large", line: true }).includes('<hr class="spacer__line">'));
    assert.ok(render("spacer", { height: "x-large" }).includes("spacer--x-large"));
    assert.ok(render("spacer", {}, "editor").includes("spacer--editor"));
    assert.ok(!render("spacer", {}, "static").includes("spacer--editor"));
  });
});

describe("Video", () => {
  test("on the site: a youtube-nocookie iframe from any usual address, with the start second and a title", () => {
    const iframe = (props) => render("video", props).match(/<iframe class="video__iframe" src="([^"]*)" title="([^"]*)"/)?.slice(1);
    assert.deepEqual(iframe({ url: "https://www.youtube.com/watch?v=abcdefghijk&t=90" }), ["https://www.youtube-nocookie.com/embed/abcdefghijk?start=90", "Video"]);
    assert.deepEqual(iframe({ url: "youtu.be/abcdefghijk?t=1m30s", title: "Latte art" }), ["https://www.youtube-nocookie.com/embed/abcdefghijk?start=90", "Latte art"]);
    assert.deepEqual(iframe({ url: "https://youtube.com/shorts/abcdefghijk", title: "" }), ["https://www.youtube-nocookie.com/embed/abcdefghijk", "YouTube video"]);
    assert.ok(render("video", { url: "https://youtu.be/abcdefghijk", ratio: "4-3" }).includes("video__frame--4-3"));
  });

  test("a wrong or hostile address shows nothing on the site; the editor shows a placeholder with a hint, never an iframe", () => {
    for (const url of ["", "https://example.com/watch?v=abcdefghijk", `${JS}`, 'https://youtu.be/abc"><script>', "https://youtube.com/watch?v=abcdefghij<"]) {
      assert.equal(render("video", { url }), "", url);
      assert.equal(render("video", { url }, "static"), "", url);
      const editor = render("video", { url }, "editor");
      assert.ok(!editor.includes("<iframe") && !editor.includes("<script"), url);
      assert.ok(editor.includes("video__placeholder--empty"), url);
    }
    assert.ok(render("video", { url: "" }, "editor").includes("Paste the address of a YouTube video in the panel on the right."));
    assert.ok(render("video", { url: "nope" }, "editor").includes("This address doesn&#39;t look like a YouTube video."));
    assert.ok(render("video", { url: "nope" }, "editor", { lang: "ro" }).includes("Adresa nu pare un video YouTube."));
    const found = render("video", { url: "https://youtu.be/abcdefghijk" }, "editor");
    assert.ok(found.includes("<strong>YouTube video</strong><span>abcdefghijk</span>") && !found.includes("<iframe"));
  });
});

describe("Log in", () => {
  test("html(): email and password fields, the sign-up link; disabled with a message in the static export", () => {
    const site = render("login");
    assert.ok(site.includes('<h2 class="login__title">Log in</h2>'));
    assert.ok(site.includes('<form class="b-form login__form" method="post">'));
    assert.ok(site.includes('<label class="b-field">Email'));
    assert.ok(site.includes('<label class="b-field">Password'));
    assert.ok(site.includes('name="password" required maxlength="200" autocomplete="current-password"'));
    assert.ok(site.includes('<p class="login__signup">Don&#39;t have an account? <a class="login__link" href="/signup">Create one</a></p>'));
    assert.ok(site.includes('<p class="b-message" role="status"></p>'));
    assert.ok(render("login", {}, "site", { lang: "ro" }).includes('<label class="b-field">Parolă'));
    assert.ok(render("login", { headingLevel: "h1" }).includes('<h1 class="login__title">Log in</h1>'));
    assert.ok(!render("login", { signupLink: "" }).includes("login__signup"));
    const off = render("login", {}, "static");
    assert.equal(off.split("disabled").length - 1, 3);
    assert.ok(off.includes('<p class="b-message" role="status">Logging in isn&#39;t available on this site.</p>'));
  });

  // A tiny stand-in for the page: the form, its fields and the globals js() reads.
  function page({ lang = "en", search = "" } = {}) {
    const listeners = {};
    const message = { className: "", textContent: "" };
    const button = { disabled: false };
    // A field: its value, the browser's validity, our message (setCustomValidity) and its listeners.
    const field = (value, extra = {}) => ({
      value,
      validity: {},
      custom: "",
      on: {},
      addEventListener(type, fn) { this.on[type] = fn; },
      setCustomValidity(text) { this.custom = text; },
      ...extra,
    });
    const email = field("ana@example.com");
    const password = field("a long and easy sentence", { selected: false, select() { this.selected = true; } });
    const form = {
      elements: { email, password },
      querySelector: (s) => (s === ".b-message" ? message : s === 'button[type="submit"]' ? button : null),
      addEventListener: (type, fn) => { listeners[type] = fn; },
    };
    const attrs = { href: "/signup" };
    const link = { getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = v; } };
    const el = { querySelector: (s) => (s === ".login__form" ? form : s === ".login__link" ? link : null) };
    globalThis.document = { documentElement: { lang } };
    globalThis.location = { origin: "http://127.0.0.1:3312", search, href: `http://127.0.0.1:3312/login${search}` };
    const submit = () => listeners.submit({ preventDefault() {} });
    return { el, message, button, email, password, attrs, submit, listeners };
  }
  const cleanup = () => {
    delete globalThis.document;
    delete globalThis.location;
  };
  const props = (extra = {}) => ({ afterLogin: "/account", noServerMessage: "No server.", ...extra });

  test("js(): logs in at /api/auth/login with { email, password }, then goes to ?next= (same site only) or the chosen page", async (t) => {
    t.after(cleanup);
    const calls = [];
    const api = { mode: "site", post: async (url, data) => (calls.push([url, data]), { ok: true, status: 200, data: { user: { id: "u" } } }) };

    let p = page({ search: "?next=%2Fmembers%3Fx%3D1" });
    components.login.js(p.el, props(), api);
    assert.equal(p.attrs.href, "/signup?next=%2Fmembers%3Fx%3D1");
    await p.submit();
    assert.deepEqual(calls, [["/api/auth/login", { email: "ana@example.com", password: "a long and easy sentence" }]]);
    assert.equal(location.href, "/members?x=1");

    for (const next of ["//evil.example", "https://evil.example/", "/\\evil.example", "javascript:alert(1)", "/ok\nno"]) {
      p = page({ search: `?next=${encodeURIComponent(next)}` });
      components.login.js(p.el, props(), api);
      assert.equal(p.attrs.href, "/signup", next);
      await p.submit();
      assert.equal(location.href, "/account", next);
    }
    p = page();
    components.login.js(p.el, props({ afterLogin: JS }), api);
    await p.submit();
    assert.equal(location.href, "#");
  });

  test("js(): an error shows the server's message (or ours) in the page's language; the editor and the export send nothing", async (t) => {
    t.after(cleanup);
    let answer = { ok: false, status: 401, data: { error: "Wrong email or password." } };
    const api = { mode: "site", post: async () => answer };
    let p = page();
    components.login.js(p.el, props(), api);
    await p.submit();
    assert.equal(p.message.textContent, "Wrong email or password.");
    assert.equal(p.message.className, "b-message b-message--error");
    assert.equal(p.button.disabled, false);
    assert.equal(p.password.selected, true);

    answer = { ok: false, status: 500, data: null };
    p = page({ lang: "ro" });
    components.login.js(p.el, props(), api);
    await p.submit();
    assert.equal(p.message.textContent, "Nu am putut intra în cont. Încearcă din nou.");

    const none = { post: assert.fail };
    p = page();
    components.login.js(p.el, props(), { ...none, mode: "editor" });
    await p.submit();
    assert.equal(p.message.textContent, "Forms can't be sent from the editor. Try it on the site.");
    p = page();
    components.login.js(p.el, props(), { ...none, mode: "static" });
    await p.submit();
    assert.equal(p.message.textContent, "No server.");
    assert.equal(p.message.className, "b-message b-message--error");
  });

  test("js(): the browser's own messages come in the page's language; an old error goes away on the next try", async (t) => {
    t.after(cleanup);
    const api = { mode: "site", post: async () => ({ ok: false, status: 401, data: { error: "Wrong email or password." } }) };
    for (const [lang, fill, email] of [
      ["en", "Please fill in this field.", "Enter an email address, like name@example.com."],
      ["ro", "Completează acest câmp.", "Scrie o adresă de email, de forma nume@exemplu.ro."],
    ]) {
      const p = page({ lang });
      components.login.js(p.el, props(), api);
      p.email.validity = { typeMismatch: true };
      p.email.on.invalid();
      assert.equal(p.email.custom, email, lang);
      p.email.on.input();
      assert.equal(p.email.custom, "", lang);
      p.password.validity = { valueMissing: true };
      p.password.on.invalid();
      assert.equal(p.password.custom, fill, lang);
    }

    const p = page();
    components.login.js(p.el, props(), api);
    await p.submit();
    assert.equal(p.message.textContent, "Wrong email or password.");
    // The browser stops the next try (an empty field): the old message doesn't stay next to its bubble.
    p.listeners.invalid();
    assert.equal(p.message.textContent, "");
    assert.equal(p.message.className, "b-message");
    await p.submit();
    p.listeners.input();
    assert.equal(p.message.textContent, "");
  });
});
