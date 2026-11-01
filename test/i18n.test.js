// server/i18n.js: the visitor's messages, in English (by default) or Romanian, by site.json → "lang".

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { message, MESSAGES, siteLang } from "../server/i18n.js";

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("MESSAGES", () => {
  test("English and Romanian have exactly the same keys and the same {placeholders}", () => {
    assert.deepEqual(Object.keys(MESSAGES).sort(), ["en", "ro"]);
    assert.deepEqual(Object.keys(MESSAGES.ro).sort(), Object.keys(MESSAGES.en).sort());
    for (const key of Object.keys(MESSAGES.en)) {
      assert.deepEqual(placeholders(MESSAGES.ro[key]), placeholders(MESSAGES.en[key]), key);
    }
  });

  test("every message is a sentence: not empty, no stray spaces", () => {
    for (const lang of ["en", "ro"]) {
      for (const [key, text] of Object.entries(MESSAGES[lang])) {
        assert.equal(typeof text, "string", `${lang}.${key}`);
        assert.ok(text.trim() === text && text.length > 3, `${lang}.${key}`);
        assert.ok(!/ {2}/.test(text), `${lang}.${key}`);
      }
    }
  });

  test("Romanian uses ș and ț with a comma below, never the cedilla", () => {
    const all = Object.values(MESSAGES.ro).join("\n");
    assert.ok(!/[\u015f\u0163\u015e\u0162]/.test(all));
    assert.ok(/[șț]/.test(all));
  });

  test("English is plain English: no Romanian letters", () => {
    assert.ok(!/[ăâîșțĂÂÎȘȚ]/.test(Object.values(MESSAGES.en).join("\n")));
  });
});

describe("message and siteLang", () => {
  test("the message in the language, with its placeholders filled in", () => {
    assert.equal(message("en", "wrongLogin"), "Wrong email or password.");
    assert.equal(message("ro", "wrongLogin"), "Email sau parolă greșită.");
    assert.equal(message("en", "passwordTooShort", { min: 15 }), "The password must be at least 15 characters long. A short sentence is easy to remember.");
    assert.equal(message("ro", "passwordTooShort", { min: 15 }), "Parola trebuie să aibă cel puțin 15 caractere. O propoziție scurtă e ușor de ținut minte.");
  });

  test("an unknown language is English; an unknown key comes back as it is; missing values stay visible", () => {
    for (const lang of ["fr", "", undefined, null, "__proto__", "toString"]) assert.equal(message(lang, "wrongLogin"), "Wrong email or password.", String(lang));
    assert.equal(message("en", "no-such-key"), "no-such-key");
    assert.equal(message("en", "toString"), "toString");
    assert.equal(message("en", "passwordTooShort"), "The password must be at least {min} characters long. A short sentence is easy to remember.");
  });

  test("siteLang: “ro” only when site.json says so, English otherwise", () => {
    assert.equal(siteLang({ lang: "ro" }), "ro");
    for (const site of [{ lang: "en" }, { lang: "RO" }, { lang: "fr" }, {}, null, undefined]) assert.equal(siteLang(site), "en", JSON.stringify(site));
  });
});
