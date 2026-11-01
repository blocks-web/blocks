// core/html.js: escaping, html`...`, raw(), url(), inline(), paragraphs(), formatDate(), plural().

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { escape, formatDate, html, inline, isSafe, paragraphs, plural, raw, url } from "../core/html.js";

describe("escape and html`...`", () => {
  test("escapes & < > \" ' and the backtick", () => {
    assert.equal(escape("&<>\"'`"), "&amp;&lt;&gt;&quot;&#39;&#96;");
    assert.equal(String(html`<p>${"&<>\"'`"}</p>`), "<p>&amp;&lt;&gt;&quot;&#39;&#96;</p>");
  });

  test("a <script> in the data shows up as text", () => {
    const out = String(html`<h1>${"<script>alert(1)</script>"}</h1>`);
    assert.equal(out, "<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>");
    assert.ok(!out.includes("<script"));
  });

  test("values in attributes can't break out of the quotes", () => {
    const out = String(html`<a title="${'" onclick="x()'}" data-x='${"' onmouseover='y()"}'>`);
    assert.ok(!out.includes('" onclick'));
    assert.ok(!out.includes("' onmouseover"));
  });

  test("nested html isn't escaped a second time", () => {
    const inner = html`<b>${"<i>"}</b>`;
    assert.equal(String(html`<p>${inner}</p>`), "<p><b>&lt;i&gt;</b></p>");
  });

  test("lists and nested lists are joined, each item escaped", () => {
    const out = html`<ul>${["<a>", html`<li>b</li>`, ["c", ["<d>", html`<e>`]]]}</ul>`;
    assert.equal(String(out), "<ul>&lt;a&gt;<li>b</li>c&lt;d&gt;<e></ul>");
    assert.equal(String(html`${[]}`), "");
  });

  test("null, undefined and false become empty text", () => {
    assert.equal(String(html`[${null}][${undefined}][${false}]`), "[][][]");
    assert.equal(String(html`${[null, false, undefined, "x"]}`), "x");
    assert.equal(escape(null), "");
    assert.equal(escape(undefined), "");
  });

  test("numbers are shown (0 included)", () => {
    assert.equal(String(html`${0}|${3.5}|${-2}`), "0|3.5|-2");
  });

  test("raw() inserts the HTML exactly as it is; raw(null) is empty", () => {
    assert.equal(String(html`<div>${raw("<b>safe</b>")}</div>`), "<div><b>safe</b></div>");
    assert.equal(String(raw(null)), "");
    assert.equal(String(raw(undefined)), "");
    assert.equal(String(raw(5)), "5");
  });

  test("isSafe() only recognizes html`...` and raw()", () => {
    assert.equal(isSafe(html`x`), true);
    assert.equal(isSafe(raw("x")), true);
    assert.equal(isSafe("x"), false);
    assert.equal(isSafe(null), false);
    assert.equal(isSafe(undefined), false);
    assert.equal(isSafe({}), false);
    assert.equal(isSafe({ value: "<b>" }), false);
    // Data from JSON can't contain symbols, so it can't pose as safe HTML.
    assert.equal(isSafe(JSON.parse('{"blocks.html": true, "value": "<b>"}')), false);
  });

  test("the result can be used as a string", () => {
    const out = html`<a>${"b"}</a>`;
    assert.equal(`${out}`, "<a>b</a>");
    assert.equal(out.toString(), "<a>b</a>");
  });
});

describe("url()", () => {
  const blocked = [
    "javascript:alert(1)",
    "  JaVaScRiPt:alert(1)",
    "JAVASCRIPT:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\rscript:alert(1)",
    "javascript\t:alert(1)",
    "\u0001javascript:alert(1)",
    "\u0000\u001fjavascript:alert(1)",
    "java\u0000script:alert(1)",
    "\u00a0javascript:alert(1)",
    " \n\tjavascript:alert(1)",
    "vbscript:msgbox(1)",
    "VbScript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "  DATA:text/html;base64,PHNjcmlwdD4=",
    "data:application/javascript,alert(1)",
    "file:///etc/passwd",
    "FILE://c:/windows",
  ];
  for (const value of blocked) {
    test(`blocks ${JSON.stringify(value)}`, () => {
      assert.equal(url(value), "#");
    });
  }

  const allowed = [
    ["https://example.com/a?b=1&c=2", "https://example.com/a?b=1&c=2"],
    ["http://example.com", "http://example.com"],
    ["/about", "/about"],
    ["about", "about"],
    ["../photo.jpg", "../photo.jpg"],
    ["#", "#"],
    ["#contact", "#contact"],
    ["?page=2", "?page=2"],
    ["mailto:ana@example.com", "mailto:ana@example.com"],
    ["tel:+40721000000", "tel:+40721000000"],
    ["data:image/png;base64,iVBORw0KGgo=", "data:image/png;base64,iVBORw0KGgo="],
    ["  /with-spaces  ", "/with-spaces"],
  ];
  for (const [value, expected] of allowed) {
    test(`allows ${JSON.stringify(value)}`, () => {
      assert.equal(url(value), expected);
    });
  }

  test("null and undefined become empty text", () => {
    assert.equal(url(null), "");
    assert.equal(url(undefined), "");
  });

  test("inside an attribute, the result is escaped too", () => {
    assert.equal(String(html`<a href="${url('/a?x="y"')}">`), '<a href="/a?x=&quot;y&quot;">');
    assert.equal(String(html`<a href="${url("javascript:alert(1)")}">`), '<a href="#">');
  });
});

describe("paragraphs()", () => {
  test("empty lines separate paragraphs", () => {
    assert.equal(String(html`${paragraphs("One\n\nTwo")}`), "<p>One</p><p>Two</p>");
  });

  test("a single Enter becomes <br>", () => {
    assert.equal(String(html`${paragraphs("Line 1\nLine 2")}`), "<p>Line 1<br>Line 2</p>");
  });

  test("several empty lines, with spaces, and spaces at the edges", () => {
    assert.equal(String(html`${paragraphs("\n\n  One  \n   \n\n\n Two\n\n")}`), "<p>One</p><p>Two</p>");
  });

  test("Windows line breaks (\\r\\n) between paragraphs", () => {
    assert.equal(String(html`${paragraphs("One\r\n\r\nTwo")}`), "<p>One</p><p>Two</p>");
  });

  test("escapes the text of the paragraphs", () => {
    const out = String(html`${paragraphs("<script>x</script>\n<b>&\n\n'\"")}`);
    assert.equal(out, "<p>&lt;script&gt;x&lt;/script&gt;<br>&lt;b&gt;&amp;</p><p>&#39;&quot;</p>");
  });

  test("empty text, null or undefined → nothing", () => {
    assert.deepEqual(paragraphs(""), []);
    assert.deepEqual(paragraphs(null), []);
    assert.deepEqual(paragraphs(undefined), []);
    assert.deepEqual(paragraphs("  \n\n  "), []);
  });

  test("every paragraph is safe HTML", () => {
    const parts = paragraphs("a\n\nb");
    assert.equal(parts.length, 2);
    assert.ok(parts.every(isSafe));
  });

  test("formatting works in every paragraph and on every line", () => {
    assert.equal(String(html`${paragraphs("Come **today**\n*or* tomorrow\n\n[Write to us](/contact)")}`), "<p>Come <strong>today</strong><br><em>or</em> tomorrow</p><p><a href=\"/contact\">Write to us</a></p>");
    // A mark doesn't close on another line.
    assert.equal(String(html`${paragraphs("**a\nb**")}`), "<p>**a<br>b**</p>");
  });

  describe("lists with “- ”", () => {
    const p = (text) => String(html`${paragraphs(text)}`);

    test("lines that start with “- ” become <ul><li>, formatted and escaped", () => {
      assert.equal(p("- coffee\n- *green* tea\n- <b>"), "<ul><li>coffee</li><li><em>green</em> tea</li><li>&lt;b&gt;</li></ul>");
      assert.equal(p("We have:\n- coffee\n- tea\nAnd more"), "<p>We have:</p><ul><li>coffee</li><li>tea</li></ul><p>And more</p>");
      assert.equal(p("- a\n- b\n\n- c"), "<ul><li>a</li><li>b</li></ul><ul><li>c</li></ul>");
      assert.equal(p("  -   with spaces  "), "<ul><li>with spaces</li></ul>");
    });

    test("a dash without a space, in the middle of a line or without text stays text", () => {
      assert.equal(p("5 - 3\n-abc\n--"), "<p>5 - 3<br>-abc<br>--</p>");
      assert.equal(p("-\n- "), "<p>-<br>-</p>");
      assert.equal(p("a -b"), "<p>a -b</p>");
    });

    test("every piece (paragraph or list) is safe HTML, on its own", () => {
      const parts = paragraphs("One\n- a\n- b\n\nTwo");
      assert.equal(parts.length, 3);
      assert.ok(parts.every(isSafe));
      assert.equal(String(parts[1]), "<ul><li>a</li><li>b</li></ul>");
    });
  });
});

describe("inline()", () => {
  const f = (text) => String(inline(text));

  test("**bold**, *italic* and [text](address)", () => {
    assert.equal(f("Come *today* to **Luna**"), "Come <em>today</em> to <strong>Luna</strong>");
    assert.equal(f("[Products](/products)"), '<a href="/products">Products</a>');
    assert.equal(f("a **b** c **d** e"), "a <strong>b</strong> c <strong>d</strong> e");
    assert.ok(isSafe(inline("x")));
  });

  test("links to another site open in a new tab, with rel=noopener; the others don't", () => {
    assert.equal(f("[Site](https://example.com/a?b=1)"), '<a href="https://example.com/a?b=1" target="_blank" rel="noopener">Site</a>');
    assert.equal(f("[x](http://example.com)"), '<a href="http://example.com" target="_blank" rel="noopener">x</a>');
    assert.equal(f("[x](//example.com)"), '<a href="//example.com" target="_blank" rel="noopener">x</a>');
    assert.equal(f("[home](/)"), '<a href="/">home</a>');
    assert.equal(f("[mail](mailto:ana@example.com)"), '<a href="mailto:ana@example.com">mail</a>');
    assert.equal(f("[x](https://a.com/f(1)?q=2)"), '<a href="https://a.com/f(1)?q=2" target="_blank" rel="noopener">x</a>');
  });

  test("dangerous addresses go through url() → href=\"#\"", () => {
    assert.equal(f("[x](javascript:alert(1))"), '<a href="#">x</a>');
    assert.equal(f("[x](JaVaScRiPt:alert(1))"), '<a href="#">x</a>');
    assert.equal(f("[x](data:text/html,<b>)"), '<a href="#">x</a>');
    assert.equal(f("[x](vbscript:msgbox(1))"), '<a href="#">x</a>');
  });

  test("everything that isn't a formatting mark is escaped, inside links and marks too", () => {
    assert.equal(f("<b>x</b> **<i>**"), "&lt;b&gt;x&lt;/b&gt; <strong>&lt;i&gt;</strong>");
    assert.equal(f('[y](/a?x="y")'), '<a href="/a?x=&quot;y&quot;">y</a>');
    assert.equal(f('[x]("onmouseover="alert(1))'), '<a href="&quot;onmouseover=&quot;alert(1)">x</a>');
    assert.equal(f("[<script>](/x)"), '<a href="/x">&lt;script&gt;</a>');
    assert.ok(!f("*<img src=x onerror=alert(1)>*").includes("<img"));
  });

  test("marks without a pair stay as written", () => {
    assert.equal(f("5 * 3"), "5 * 3");
    assert.equal(f("* a *"), "* a *");
    assert.equal(f("**"), "**");
    assert.equal(f("****"), "****");
    assert.equal(f("text with * a lone * asterisk"), "text with * a lone * asterisk");
    assert.equal(f("*a*b*"), "<em>a</em>b*");
    assert.equal(f("[a](b"), "[a](b");
    assert.equal(f("[a]( )"), "[a]( )");
    assert.equal(f("[a [b]](x)"), "[a [b]](x)");
    assert.equal(f("[x](/a(b)"), "[x](/a(b)");
  });

  test("marks don't cross line breaks and don't nest", () => {
    assert.equal(f("**a\nb**"), "**a\nb**");
    assert.equal(f("*a\nb*"), "*a\nb*");
    assert.equal(f("[a\nb](/x)"), "[a\nb](/x)");
    assert.equal(f("**a *b* c**"), "**a <em>b</em> c**");
    assert.equal(f("***a***"), "*<strong>a</strong>*");
    assert.equal(f("[**a**](/x)"), '<a href="/x">**a**</a>');
    assert.equal(f("**[a](/x)**"), "<strong>[a](/x)</strong>");
  });

  test("empty text, null or undefined → nothing", () => {
    assert.equal(f(""), "");
    assert.equal(f(null), "");
    assert.equal(f(undefined), "");
    assert.equal(f(5), "5");
  });
});

describe("formatDate()", () => {
  test("“YYYY-MM-DD” → the month in English, the day and the year", () => {
    assert.equal(formatDate("2025-12-22"), "December 22, 2025");
    assert.equal(formatDate("2024-01-01"), "January 1, 2024");
    assert.equal(formatDate("2026-05-09", "en"), "May 9, 2026");
    assert.equal(formatDate(" 2024-03-15 "), "March 15, 2024");
  });

  test("with lang “ro”, the month in Romanian; any other language is English", () => {
    assert.equal(formatDate("2025-12-22", "ro"), "22 decembrie 2025");
    assert.equal(formatDate("2024-01-01", "ro"), "1 ianuarie 2024");
    assert.equal(formatDate("2026-05-09", "ro"), "9 mai 2026");
    for (const lang of ["fr", "", null, undefined, "RO"]) assert.equal(formatDate("2024-03-15", lang), "March 15, 2024", String(lang));
  });

  test("leap years: 29 February exists only when it should", () => {
    assert.equal(formatDate("2024-02-29"), "February 29, 2024");
    assert.equal(formatDate("2000-02-29", "ro"), "29 februarie 2000");
    assert.equal(formatDate("2023-02-29"), "");
    assert.equal(formatDate("1900-02-29"), "");
    assert.equal(formatDate("2024-02-30"), "");
  });

  test("anything that isn't a good date → empty text", () => {
    for (const bad of ["", null, undefined, "today", "2025-13-01", "2025-00-10", "2025-04-31", "2025-06-00", "2024-1-1", "0000-01-01", "2024-02-29T00:00", "22.12.2025", 20251222]) {
      assert.equal(formatDate(bad), "", JSON.stringify(bad));
      assert.equal(formatDate(bad, "ro"), "", JSON.stringify(bad));
    }
  });
});

describe("plural()", () => {
  test("English: one or many", () => {
    assert.equal(plural(1, "block", "blocks"), "1 block");
    assert.equal(plural(0, "block", "blocks"), "0 blocks");
    assert.equal(plural(3, "block", "blocks"), "3 blocks");
    assert.equal(plural(20, "block", "blocks", "en"), "20 blocks");
  });

  test("Romanian: from 20 on, “de” comes in between", () => {
    assert.equal(plural(1, "bloc", "blocuri", "ro"), "1 bloc");
    assert.equal(plural(0, "bloc", "blocuri", "ro"), "0 blocuri");
    assert.equal(plural(19, "bloc", "blocuri", "ro"), "19 blocuri");
    assert.equal(plural(20, "bloc", "blocuri", "ro"), "20 de blocuri");
    assert.equal(plural(101, "bloc", "blocuri", "ro"), "101 blocuri");
    assert.equal(plural(120, "bloc", "blocuri", "ro"), "120 de blocuri");
  });
});
