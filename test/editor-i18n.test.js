// editor/i18n.js: the editor's words in English (the source) and Romanian.
//   - every text the editor shows (t() and tn() in editor/*.js, data-t / data-t-attr in the HTML
//     files, the core's editor texts) has its Romanian, and the dictionary has nothing left over;
//   - no Romanian text is left in the editor outside the dictionary;
//   - t, tn, quote, joinList and the blocks' own words (i18n.ro) work, also on odd input.

import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "./helpers.js";
import { blockFields, blockText, getLang, joinList, quote, RO, RO_SYNONYMS, setLang, slotLabel, t, tn } from "../editor/i18n.js";

after(() => setLang("en"));

const EDITOR = join(PROJECT_ROOT, "editor");
const read = (file) => readFileSync(join(EDITOR, file), "utf8");
const sources = readdirSync(EDITOR).filter((f) => f.endsWith(".js") && f !== "i18n.js");
const pages = readdirSync(EDITOR).filter((f) => f.endsWith(".html"));
const unquote = (s) => JSON.parse(`"${s}"`);
const STRING = '"((?:[^"\\\\\\n]|\\\\.)*)"';

// The keys the editor asks for, with the file they're in (i18n.js itself only above its dictionary).
const code = (file) => (file === "i18n.js" ? read(file).split("export const RO = {")[0] : read(file));
const tnKeys = new Set();
function usedKeys() {
  const keys = new Map();
  for (const file of [...sources, "i18n.js"]) {
    const src = code(file);
    for (const m of src.matchAll(new RegExp(`\\bt\\(\\s*${STRING}`, "g"))) keys.set(unquote(m[1]), file);
    for (const m of src.matchAll(new RegExp(`\\btn\\([^,()]+,\\s*${STRING},\\s*${STRING}`, "g"))) {
      for (const key of [unquote(m[1]), unquote(m[2])]) {
        keys.set(key, file);
        tnKeys.add(key);
      }
    }
  }
  for (const file of pages) {
    for (const el of elements(read(file))) {
      if (Object.hasOwn(el.attrs, "data-t")) keys.set(el.text.trim(), file);
      for (const name of (el.attrs["data-t-attr"] || "").split(/\s+/).filter(Boolean)) keys.set(el.attrs[name], `${file} (${name})`);
    }
  }
  // The core's editor texts (core/render.js → state.t("...")).
  for (const m of readFileSync(join(PROJECT_ROOT, "core", "render.js"), "utf8").matchAll(new RegExp(`state\\.t\\(\\s*${STRING}`, "g"))) {
    keys.set(unquote(m[1]), "core/render.js");
  }
  return keys;
}

// The elements of an HTML file (ours, written simply): { tag, attrs, text } with the text right after the start tag.
function elements(source) {
  return [...source.matchAll(/<([a-z][\w-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>([^<]*)/gi)].map((m) => ({
    tag: m[1],
    attrs: Object.fromEntries([...m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((a) => [a[1], a[2] ?? ""])),
    text: m[3],
  }));
}

describe("the dictionary", () => {
  test("every text the editor shows has its Romanian", () => {
    const keys = usedKeys();
    assert.ok(keys.size > 300, `only ${keys.size} texts found: is the search still right?`);
    const missing = [...keys].filter(([key]) => !Object.hasOwn(RO, key)).map(([key, file]) => `${file}: ${JSON.stringify(key)}`);
    assert.deepEqual(missing, []);
  });

  test("the HTML files have their texts marked (data-t), and they're not empty", () => {
    for (const file of pages) {
      for (const el of elements(read(file))) {
        if (Object.hasOwn(el.attrs, "data-t")) assert.ok(el.text.trim(), `${file}: <${el.tag} data-t> is empty`);
        for (const name of (el.attrs["data-t-attr"] || "").split(/\s+/).filter(Boolean)) {
          assert.ok(el.attrs[name], `${file}: <${el.tag}> lists “${name}” in data-t-attr but doesn't have it`);
        }
      }
    }
  });

  test("the dictionary has nothing left over: every Romanian text is used", () => {
    const keys = usedKeys();
    assert.deepEqual(Object.keys(RO).filter((key) => !keys.has(key)), []);
  });

  test("each Romanian text keeps the {placeholders} of its English one", () => {
    const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of Object.entries(RO)) assert.deepEqual(names(value), names(key), key);
  });

  test("the forms of tn() have {n} right before their word, so Romanian can put “de” in between", () => {
    usedKeys();
    assert.ok(tnKeys.size >= 10);
    for (const key of tnKeys) {
      if (RO[key].includes("{n}")) assert.match(RO[key], /\{n\} \p{L}/u, key);
    }
  });

  test("Romanian is written properly: ș ț with a comma below, „…” quotes, no stray spaces", () => {
    for (const [key, value] of Object.entries(RO)) {
      assert.equal(typeof value, "string", key);
      assert.ok(value.length && value.trim() === value && !/ {2}/.test(value), key);
      assert.ok(!/[\u015f\u0163\u015e\u0162]/.test(value), `cedilla in ${JSON.stringify(value)}`);
      assert.ok(!value.includes("“"), `English quotes in ${JSON.stringify(value)}`);
      assert.equal((value.match(/„/g) || []).length, (value.match(/”/g) || []).length, `unbalanced quotes in ${JSON.stringify(value)}`);
    }
    assert.ok(/[șț]/.test(Object.values(RO).join("\n")));
  });

  test("the English source texts are English: no Romanian letters, “…” quotes", () => {
    for (const key of Object.keys(RO)) {
      assert.ok(!/[ăâîșț\u015f\u0163ĂÂÎȘȚ]/.test(key), key);
      assert.ok(!key.includes("„"), key);
    }
  });

  test("the Romanian search words are written as fold() gives them (lowercase, no accents)", () => {
    for (const [id, words] of Object.entries(RO_SYNONYMS)) assert.match(words, /^[a-z]+( [a-z]+)*$/, id);
  });
});

// Romanian words that would show a text was left untranslated (whole words, in the strings of the code).
const ROMANIAN_WORDS = [
  "si", "sau", "pentru", "este", "nu", "aici", "acum", "doar", "pagina", "paginii", "pagini", "bloc", "blocul", "blocuri",
  "blocurile", "setari", "setarile", "salveaza", "salvat", "sterge", "trage", "adauga", "antet", "antetul", "subsol",
  "subsolul", "inapoi", "eroare", "alege", "scrie", "cauta", "membri", "panza", "grila", "caseta", "acasa", "despre",
  "deschide", "anuleaza", "continut", "zona", "fisierul", "imaginea",
];
// The names of languages are written in their own language (the site's language, the EN / RO switch),
// and the template's old Romanian names for "My blocks" still mean "My blocks" (the glossary).
const ENDONYMS = new Set(["Română", "componentele mele", "blocurile mele"]);
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// The string literals in a piece of JavaScript (comments left out).
function literals(src) {
  const out = [];
  const re = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const m of src.matchAll(re)) {
    const s = m[1] ?? m[2] ?? m[3];
    if (s !== undefined) out.push(s);
  }
  return out;
}

function romanianIn(text) {
  if (ENDONYMS.has(text.trim())) return null;
  if (/[ăâîșț\u015f\u0163ĂÂÎȘȚ„]/.test(text)) return "Romanian letters";
  const words = fold(text).split(/[^a-z]+/);
  const word = ROMANIAN_WORDS.find((w) => words.includes(w));
  return word ? `the word “${word}”` : null;
}

describe("no Romanian left outside the dictionary", () => {
  test("in the strings of editor/*.js", () => {
    const found = [];
    for (const file of sources) {
      for (const s of literals(read(file))) {
        const why = romanianIn(s);
        if (why) found.push(`${file}: ${JSON.stringify(s)} (${why})`);
      }
    }
    assert.deepEqual(found, []);
  });

  test("in the HTML files (texts and attributes) and in editor.css", () => {
    const found = [];
    for (const file of pages) {
      for (const el of elements(read(file))) {
        for (const value of [el.text, ...Object.values(el.attrs)]) {
          const why = romanianIn(value);
          if (why) found.push(`${file}: ${JSON.stringify(value)} (${why})`);
        }
      }
    }
    for (const value of read("editor.css").match(/"[^"\n]*"|\/\*[\s\S]*?\*\//g) || []) {
      if (/[ăâîșț\u015f\u0163ĂÂÎȘȚ„]/.test(value)) found.push(`editor.css: ${value}`);
    }
    assert.deepEqual(found, []);
  });

  test("the comments are in English too (no Romanian letters)", () => {
    const found = [];
    for (const file of [...sources, ...pages]) {
      for (const c of read(file).match(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g) || []) {
        if (/[ăâîșț\u015f\u0163ĂÂÎȘȚ„]/.test(c.replace(/"[^"\n]*"/g, ""))) found.push(`${file}: ${c.trim().slice(0, 80)}`);
      }
    }
    assert.deepEqual(found, []);
  });

  test("the heuristic catches what it should", () => {
    assert.ok(romanianIn("Trage un bloc aici"));
    assert.ok(romanianIn("Salvează"));
    assert.ok(romanianIn("Setari site"));
    assert.equal(romanianIn("Drag a block here"), null);
    assert.equal(romanianIn("Română"), null);
    assert.equal(romanianIn("Site settings: the login page"), null);
  });
});

describe("t, tn, quote and joinList", () => {
  test("English by default; the placeholders filled in as plain text; a missing value stays visible", () => {
    setLang("en");
    assert.equal(getLang(), "en");
    assert.equal(t("Saved"), "Saved");
    assert.equal(t("Deleted “{name}”.", { name: "<b>Hero</b>" }), "Deleted “<b>Hero</b>”.");
    assert.equal(t("Deleted “{name}”."), "Deleted “{name}”.");
    assert.equal(t("A text that isn't in the dictionary"), "A text that isn't in the dictionary");
    assert.equal(t("Back to “{page}”", { page: "$& {page}" }), "Back to “$& {page}”");
  });

  test("Romanian when chosen; an unknown text stays English; only “en” and “ro” exist", () => {
    assert.equal(setLang("ro"), "ro");
    assert.equal(t("Saved"), "Salvat");
    assert.equal(t("Back to “{page}”", { page: "Acasă" }), "Înapoi la „Acasă”");
    assert.equal(t("A text that isn't in the dictionary"), "A text that isn't in the dictionary");
    assert.equal(t("toString"), "toString");
    assert.equal(t("__proto__"), "__proto__");
    for (const odd of ["fr", "", undefined, null, "__proto__", "RO"]) assert.equal(setLang(odd), "en", String(odd));
    setLang("en");
  });

  test("tn: one and many in English; in Romanian also “de” from 20 on", () => {
    setLang("en");
    assert.equal(tn(1, "{n} block", "{n} blocks"), "1 block");
    assert.equal(tn(0, "{n} block", "{n} blocks"), "0 blocks");
    assert.equal(tn(21, "{n} block", "{n} blocks"), "21 blocks");
    setLang("ro");
    try {
      const cases = { 0: "0 blocuri", 1: "1 bloc", 2: "2 blocuri", 19: "19 blocuri", 20: "20 de blocuri", 101: "101 blocuri", 119: "119 blocuri", 120: "120 de blocuri", 200: "200 de blocuri" };
      for (const [n, text] of Object.entries(cases)) assert.equal(tn(Number(n), "{n} block", "{n} blocks"), text, n);
      assert.equal(
        tn(25, "Deleted the “{title}” page and the link to it.", "Deleted the “{title}” page and the {n} links to it.", { title: "Despre" }),
        "Am șters pagina „Despre” și cele 25 de linkuri spre ea.",
      );
      assert.equal(tn(1, "Deleted the “{title}” page and the link to it.", "Deleted the “{title}” page and the {n} links to it.", { title: "X" }), "Am șters pagina „X” și linkul spre ea.");
    } finally {
      setLang("en");
    }
  });

  test("quote and joinList follow the language", () => {
    assert.equal(quote("Column 3"), "“Column 3”");
    assert.equal(joinList(["a"]), "a");
    assert.match(joinList(["a", "b", "c"]), /^a, b,? and c$/);
    setLang("ro");
    try {
      assert.equal(quote("Coloana 3"), "„Coloana 3”");
      assert.equal(joinList(["„a”", "„b”"]), "„a” și „b”");
    } finally {
      setLang("en");
    }
  });
});

describe("the blocks' own words (i18n.ro)", () => {
  const comp = {
    name: "Button",
    description: "A button.",
    tip: "Say what happens.",
    category: "Text & images",
    props: {
      text: { type: "text", label: "Text", default: "Learn more" },
      style: { type: "choice", label: "Style", options: [{ value: "solid", label: "Solid" }, { value: "outline", label: "Outline only" }, "plain"], default: "solid" },
      items: { type: "list", label: "Items", fields: { title: { type: "text", label: "Title" }, kind: { type: "choice", options: ["a", "constructor"] } } },
    },
    slots: { content: "Content", extra: "Extra" },
    i18n: {
      ro: {
        name: "Buton",
        description: "Un buton.",
        tip: "",
        props: {
          style: { label: "Stil", help: "Cum arată.", options: { solid: "Plin", plain: "Simplu", constructor: "X" } },
          items: { label: "Elemente", fields: { title: { label: "Titlu" }, kind: { options: { a: "A (ro)", constructor: "C (ro)" } } } },
          text: "not an object",
          missing: { label: "Nu există" },
        },
        slots: { content: "Conținut", extra: 5 },
      },
    },
  };

  test("in English, the component's own texts", () => {
    setLang("en");
    assert.equal(blockText(comp, "name"), "Button");
    assert.equal(blockText(comp, "tip"), "Say what happens.");
    assert.equal(slotLabel(comp, "content"), "Content");
    assert.equal(slotLabel(comp, "nope"), "nope");
    assert.deepEqual(blockFields(comp), comp.props);
  });

  test("in Romanian, i18n.ro with English for anything missing; the values and the defaults stay as they are", () => {
    setLang("ro");
    try {
      assert.equal(blockText(comp, "name"), "Buton");
      assert.equal(blockText(comp, "description"), "Un buton.");
      assert.equal(blockText(comp, "tip"), "Say what happens.", "an empty Romanian text falls back to English");
      assert.equal(blockText(comp, "category"), "Text & images");
      assert.equal(slotLabel(comp, "content"), "Conținut");
      assert.equal(slotLabel(comp, "extra"), "Extra", "a label that isn't text falls back to English");
      const fields = blockFields(comp);
      assert.deepEqual(fields.text, comp.props.text);
      assert.equal(fields.style.label, "Stil");
      assert.equal(fields.style.help, "Cum arată.");
      assert.deepEqual(fields.style.options, [{ value: "solid", label: "Plin" }, { value: "outline", label: "Outline only" }, { value: "plain", label: "Simplu" }]);
      assert.equal(fields.style.default, "solid");
      assert.equal(fields.items.label, "Elemente");
      assert.equal(fields.items.fields.title.label, "Titlu");
      assert.deepEqual(fields.items.fields.kind.options, [{ value: "a", label: "A (ro)" }, { value: "constructor", label: "C (ro)" }]);
      assert.ok(!Object.hasOwn(fields, "missing"), "only the component's own props");
      assert.deepEqual(comp.props.style.options[0], { value: "solid", label: "Solid" }, "the component itself isn't changed");
    } finally {
      setLang("en");
    }
  });

  test("odd components don't break anything", () => {
    setLang("ro");
    try {
      const throwing = { name: "X", get i18n() { throw new Error("no"); } };
      assert.equal(blockText(throwing, "name"), "X");
      for (const odd of [null, undefined, {}, { i18n: [] }, { i18n: { ro: "Buton" } }, { i18n: { ro: { props: [], slots: "x" } }, props: null }]) {
        assert.equal(blockText(odd, "name"), "");
        assert.equal(slotLabel(odd, "a"), "a");
        assert.deepEqual(blockFields(odd), {});
      }
      const proto = JSON.parse('{ "props": { "a": { "type": "text", "label": "A" } }, "i18n": { "ro": { "props": { "__proto__": { "label": "Rău" }, "a": { "label": "Ă" } } } } }');
      assert.equal(blockFields(proto).a.label, "Ă");
      assert.ok(!Object.hasOwn(blockFields(proto), "__proto__"));
      assert.equal(blockText({ name: "toString" }, "toString"), "");
    } finally {
      setLang("en");
    }
  });

  test("the bundled blocks' Romanian words point at props, options and areas that exist", async () => {
    const dir = join(PROJECT_ROOT, "components");
    const problems = [];
    const check = (file, fields, ro, path) => {
      for (const [key, entry] of Object.entries(ro || {})) {
        const field = fields?.[key];
        if (!field) {
          problems.push(`${file}: ${path}${key} isn't a prop`);
          continue;
        }
        const values = (Array.isArray(field.options) ? field.options : []).map((o) => String(o && typeof o === "object" ? o.value : o));
        for (const value of Object.keys(entry?.options || {})) if (!values.includes(value)) problems.push(`${file}: ${path}${key}.options.${value} isn't an option`);
        if (entry?.fields) check(file, field.fields, entry.fields, `${path}${key}.fields.`);
      }
    };
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".js") && !f.endsWith(".server.js"))) {
      const comp = (await import(join(dir, file))).default;
      const ro = comp.i18n?.ro;
      if (!ro) continue;
      check(file, comp.props, ro.props, "props.");
      for (const name of Object.keys(ro.slots || {})) if (!Object.hasOwn(comp.slots || {}, name)) problems.push(`${file}: slots.${name} isn't an area`);
      for (const key of ["name", "description", "tip", "category"]) {
        if (ro[key] !== undefined && typeof ro[key] !== "string") problems.push(`${file}: i18n.ro.${key} isn't text`);
      }
    }
    assert.deepEqual(problems, []);
  });
});
