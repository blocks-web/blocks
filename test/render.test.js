// core/render.js: defaults, rendering blocks, zones, the theme, the full document.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { html } from "../core/html.js";
import {
  defaultFor,
  DEFAULT_THEME,
  eachBlock,
  renderPage,
  renderParts,
  safeJson,
  sitePath,
  themeCss,
  typoDistance,
  TYPES,
  validateComponent,
  withDefaults,
} from "../core/render.js";

const count = (text, part) => text.split(part).length - 1;

// Test components, written directly as objects.
const components = {
  heading: {
    name: "Heading",
    props: { text: { type: "text", label: "Text", default: "Hello" } },
    html: (p) => html`<h1 class="heading">${p.text}</h1>`,
    css: ".heading { color: var(--primary); }",
  },
  box: {
    name: "Box",
    slots: { content: "Content", hidden: "Hidden" },
    // The "hidden" slot is never rendered.
    html: (p, ctx) => html`<section class="box">${ctx.slot("content")}</section>`,
    css: ".box { padding: 1rem; }",
  },
  button: {
    name: "Button",
    props: { text: { type: "text", default: "Press" }, n: { type: "number" } },
    html: (p) => html`<button>${p.text}</button>`,
    js() {},
  },
  broken: {
    name: "Broken",
    html() {
      throw new Error("broken <b>");
    },
    js() {},
  },
  string: { name: "String", html: () => "<em>written by the author</em>" },
  context: {
    name: "Context",
    html: (p, ctx) =>
      html`<p class="ctx">${ctx.mode}|${ctx.id}|${ctx.user?.name ?? "nobody"}|${ctx.page.title}|${ctx.site.name}</p>`,
  },
};

// Runs fn with console.error silenced (components with errors write to the console).
function quietly(t, fn) {
  t.mock.method(console, "error", () => {});
  return fn();
}

describe("defaultFor and withDefaults", () => {
  const schema = {
    props: {
      title: { type: "text", default: "Hello" },
      text: { type: "text" },
      long: { type: "longtext" },
      number: { type: "number" },
      checkbox: { type: "checkbox" },
      color: { type: "color" },
      choice: { type: "choice", options: ["a", "b"] },
      photo: { type: "image" },
      link: { type: "link" },
      list: { type: "list", fields: { label: { type: "text", default: "Item" }, price: { type: "number" } } },
      withDefault: { type: "list", fields: { x: { type: "text" } }, default: [{ x: "one" }] },
      object: { type: "text", default: { a: [1, 2] } },
    },
  };

  test("without “default”: a number respects min/max, a choice takes the first option", () => {
    assert.equal(defaultFor({ type: "number", min: 5, max: 10 }), 5);
    assert.equal(defaultFor({ type: "number", min: -3, max: 10 }), 0);
    assert.equal(defaultFor({ type: "number", max: -2 }), -2);
    assert.equal(defaultFor({ type: "choice", options: [{ value: "l", label: "Left" }, { value: "r" }] }), "l");
    assert.equal(defaultFor({ type: "choice", options: ["small", "large"] }), "small");
    assert.equal(defaultFor({ type: "choice", options: [] }), "");
    assert.equal(defaultFor({ type: "choice" }), "");
    assert.equal(defaultFor({ type: "choice", options: ["a"], default: "" }), "");
  });

  test("the defaults by type", () => {
    assert.equal(defaultFor({ type: "text" }), "");
    assert.equal(defaultFor({ type: "longtext" }), "");
    assert.equal(defaultFor({ type: "number" }), 0);
    assert.equal(defaultFor({ type: "checkbox" }), false);
    assert.deepEqual(defaultFor({ type: "list" }), []);
    assert.equal(defaultFor({ type: "color" }), "");
    assert.equal(defaultFor({ type: "date" }), "");
    assert.equal(defaultFor({ type: "html" }), "");
    assert.equal(defaultFor(undefined), "");
    assert.equal(defaultFor({ type: "number", default: 7 }), 7);
  });

  test("the “date” and “html” types are known; an “html” that isn't text becomes empty", () => {
    assert.ok(TYPES.includes("date") && TYPES.includes("html"));
    const s = { props: { when: { type: "date" }, code: { type: "html" } } };
    assert.deepEqual(withDefaults(s, {}), { when: "", code: "" });
    assert.deepEqual(withDefaults(s, { when: "2025-12-22", code: "<iframe></iframe>" }), { when: "2025-12-22", code: "<iframe></iframe>" });
    for (const bad of [5, true, { a: 1 }, ["<b>"]]) assert.equal(withDefaults(s, { code: bad }).code, "", JSON.stringify(bad));
  });

  test("fills in what's missing with the default or the type's value", () => {
    const p = withDefaults(schema, {});
    assert.equal(p.title, "Hello");
    assert.equal(p.text, "");
    assert.equal(p.long, "");
    assert.equal(p.number, 0);
    assert.equal(p.checkbox, false);
    assert.equal(p.color, "");
    assert.equal(p.choice, "a"); // the first option
    assert.equal(p.photo, "");
    assert.equal(p.link, "");
    assert.deepEqual(p.list, []);
    assert.deepEqual(p.withDefault, [{ x: "one" }]);
  });

  test("null counts as missing; “falsy” values given by the user stay", () => {
    const p = withDefaults(schema, { title: null, number: 0, checkbox: false, text: "", list: null });
    assert.equal(p.title, "Hello");
    assert.equal(p.number, 0);
    assert.equal(p.checkbox, false);
    assert.equal(p.text, "");
    assert.deepEqual(p.list, []);
  });

  test("list items get the defaults from fields", () => {
    const p = withDefaults(schema, { list: [{}, { label: "Coffee" }, { price: 12, extra: "yes" }, null] });
    assert.deepEqual(p.list, [
      { label: "Item", price: 0 },
      { label: "Coffee", price: 0 },
      { label: "Item", price: 12, extra: "yes" },
      { label: "Item", price: 0 },
    ]);
  });

  test("a list that isn't an array becomes the default", () => {
    for (const bad of ["text", 5, { a: 1 }, true]) {
      const p = withDefaults(schema, { list: bad, withDefault: bad });
      assert.deepEqual(p.list, []);
      assert.deepEqual(p.withDefault, [{ x: "one" }]);
    }
  });

  test("a list with a wrong “default” in the schema stays a list", () => {
    for (const fallback of ["text", 3, { a: 1 }, null]) {
      const p = withDefaults({ props: { l: { type: "list", fields: { x: { type: "text" } }, default: fallback } } }, {});
      assert.deepEqual(p.l, []);
    }
  });

  test("defaults are copied, not shared between blocks", () => {
    const a = withDefaults(schema, {});
    const b = withDefaults(schema, {});
    assert.notEqual(a.withDefault, b.withDefault);
    assert.notEqual(a.object, b.object);
    a.withDefault[0].x = "changed";
    a.withDefault.push({ x: "new" });
    a.object.a.push(3);
    assert.deepEqual(schema.props.withDefault.default, [{ x: "one" }]);
    assert.deepEqual(schema.props.object.default, { a: [1, 2] });
    assert.deepEqual(b.withDefault, [{ x: "one" }]);
  });

  test("doesn't change the object it gets and keeps the extra keys", () => {
    const props = { title: "Mine", list: [{}], extra: 1 };
    const p = withDefaults(schema, props);
    assert.deepEqual(props, { title: "Mine", list: [{}], extra: 1 });
    assert.equal(p.title, "Mine");
    assert.equal(p.extra, 1);
  });

  test("missing or invalid props, and components without props", () => {
    assert.equal(withDefaults(schema, null).title, "Hello");
    assert.equal(withDefaults(schema, undefined).title, "Hello");
    assert.equal(withDefaults(schema, "text").title, "Hello");
    assert.deepEqual(withDefaults({}, { a: 1 }), { a: 1 });
    assert.deepEqual(withDefaults(null, null), {});
  });
});

describe("withDefaults: p.X is always what the field promises", () => {
  const schema = {
    props: {
      align: { type: "choice", options: [{ value: "left" }, { value: "center" }], default: "left" },
      columns: { type: "choice", options: ["2", "3", "4"], default: "2" },
      n: { type: "number", min: 1, max: 5, step: 1, default: 3 },
      f: { type: "number", min: 0, max: 1 },
      show: { type: "checkbox", default: false },
      yes: { type: "checkbox", default: true },
      list: { type: "list", fields: { kind: { type: "choice", options: ["a", "b"] }, k: { type: "number", max: 10 } } },
    },
  };

  test("a “choice” is only one of the options; anything else (sneaked-in classes, objects) → the default", () => {
    for (const v of ["zzz", "left form__trap b-cell--circle", "x b-zone", " left", "Left", {}, [], ["left"], true, 5, NaN]) {
      assert.equal(withDefaults(schema, { align: v }).align, "left", JSON.stringify(v));
    }
    assert.equal(withDefaults(schema, { align: "center" }).align, "center");
    // A number written without quotes is the same option, as text.
    assert.equal(withDefaults(schema, { columns: 3 }).columns, "3");
    assert.equal(withDefaults(schema, { columns: 9 }).columns, "2");
    assert.equal(withDefaults({ props: { a: { type: "choice" } } }, { a: "anything" }).a, "", "without options nothing gets through");
  });

  test("a “number” is finite, between min and max, an integer when the step is one; text with digits is accepted", () => {
    const n = (v) => withDefaults(schema, { n: v }).n;
    assert.equal(n(1e9), 5);
    assert.equal(n(-7), 1);
    assert.equal(n(2.7), 3);
    assert.equal(n("4"), 4);
    for (const v of ["4;color:red", "", NaN, Infinity, -Infinity, {}, [], null, true]) assert.equal(n(v), 3, JSON.stringify(v));
    assert.equal(withDefaults(schema, { f: 0.25 }).f, 0.25, "without a step, fractions stay");
    assert.equal(withDefaults(schema, {}).f, 0);
  });

  test("a “checkbox” is true or false; the text “false” isn't true", () => {
    for (const v of ["false", "true", 1, 0, {}, []]) {
      assert.equal(withDefaults(schema, { show: v }).show, false, JSON.stringify(v));
      assert.equal(withDefaults(schema, { yes: v }).yes, true, JSON.stringify(v));
    }
    assert.equal(withDefaults(schema, { show: true, yes: false }).show, true);
    assert.equal(withDefaults(schema, { show: true, yes: false }).yes, false);
  });

  test("the same rules inside list items", () => {
    const [item] = withDefaults(schema, { list: [{ kind: "c d", k: 99 }] }).list;
    assert.deepEqual(item, { kind: "a", k: 10 });
  });
});

describe("eachBlock", () => {
  test("also walks the blocks in slots, with their parent", () => {
    const seen = [];
    eachBlock(
      [
        { id: "a", type: "box", slots: { content: [{ id: "b", type: "heading" }], hidden: [{ id: "c", type: "button" }] } },
        null,
        "not a block",
        { id: "d", type: "heading" },
      ],
      (block, parent) => seen.push(`${block.id}<${parent?.id ?? "-"}`),
    );
    assert.deepEqual(seen, ["a<-", "b<a", "c<a", "d<-"]);
    eachBlock("not a list", () => assert.fail("must not be called"));
  });
});

describe("renderParts", () => {
  const page = {
    title: "Home",
    blocks: [
      { id: "b_1", type: "heading", props: { text: "Welcome" } },
      {
        id: "b_2",
        type: "box",
        slots: {
          content: [{ id: "b_3", type: "button", props: { text: "Come in" } }],
          hidden: [{ id: "b_4", type: "button" }],
        },
      },
      { id: "b_5", type: "box" },
    ],
  };

  test("editor: data-slot on the root and on the slots (ID:slot)", () => {
    const { body } = renderParts({ page, components, mode: "editor" });
    assert.ok(body.startsWith('<main class="b-page" id="content"><div class="b-slot" data-slot="root">'));
    assert.ok(body.includes('data-slot="b_2:content"'));
    assert.ok(body.includes('data-slot="b_5:content"'));
    assert.ok(!body.includes("b_2:hidden"));
  });

  test("editor: b-empty only in empty slots, with the slot's label", () => {
    const { body } = renderParts({ page, components, mode: "editor" });
    assert.equal(count(body, "b-empty"), 1);
    assert.ok(
      body.includes('<div class="b-slot" data-slot="b_5:content"><div class="b-empty" data-empty>Drag a block into “Content”</div></div>'),
    );
    const empty = renderParts({ page: { blocks: [] }, components, mode: "editor" });
    assert.equal(empty.body, '<main class="b-page" id="content"><div class="b-slot" data-slot="root"><div class="b-empty" data-empty>Drag a block here</div></div></main>');
  });

  test("editor: the editor's own t() translates the core's texts, and its result is escaped", () => {
    const ro = { "Drag a block here": "Trage un bloc aici", "Drag a block into “{label}”": "Trage un bloc în „{label}”" };
    const t = (text, values = {}) => (ro[text] ?? text).replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);
    const empty = renderParts({ page: { blocks: [] }, components, mode: "editor", t }).body;
    assert.ok(empty.includes('<div class="b-empty" data-empty>Trage un bloc aici</div>'));
    assert.ok(renderParts({ page, components, mode: "editor", t }).body.includes("Trage un bloc în „Content”"));
    const sneaky = renderParts({ page: { blocks: [] }, components, mode: "editor", t: () => "<img src=x onerror=alert(1)>" }).body;
    assert.ok(!sneaky.includes("<img"));
  });

  for (const mode of ["site", "static"]) {
    test(`${mode}: no data-slot and no b-empty`, () => {
      const { body } = renderParts({ page, components, mode });
      assert.ok(!body.includes("data-slot"));
      assert.ok(!body.includes("b-empty"));
      assert.ok(!body.includes("data-empty"));
      assert.ok(body.startsWith('<main class="b-page" id="content"><div class="b-slot">'));
    });
  }

  for (const mode of ["editor", "site", "static"]) {
    test(`${mode}: every block is wrapped with class="c-TYPE" data-c data-id`, () => {
      const { body } = renderParts({ page, components, mode });
      assert.ok(body.includes('<div class="c-heading" data-c="heading" data-id="b_1"><h1 class="heading">Welcome</h1></div>'));
      assert.ok(body.includes('<div class="c-box" data-c="box" data-id="b_2">'));
      assert.ok(body.includes('<div class="c-button" data-c="button" data-id="b_3"><button>Come in</button></div>'));
      // The block in the slot that isn't rendered doesn't show at all.
      assert.ok(!body.includes("b_4"));
    });
  }

  test("a missing component: b-missing in the editor, nothing elsewhere", () => {
    const p = { blocks: [{ id: "x1", type: "does-not-exist" }, { id: "x2", type: "heading" }] };
    const editor = renderParts({ page: p, components, mode: "editor" }).body;
    assert.ok(
      editor.includes(
        '<div class="b-missing" data-c="does-not-exist" data-id="x1">The “does-not-exist” block no longer exists: remove it from the page or put the file components/does-not-exist.js back.</div>',
      ),
    );
    for (const mode of ["site", "static"]) {
      const body = renderParts({ page: p, components, mode }).body;
      assert.ok(!body.includes("does-not-exist"));
      assert.ok(!body.includes("b-missing"));
      assert.ok(!body.includes("x1"));
      assert.ok(body.includes('data-id="x2"'));
    }
  });

  test("types from the prototype (toString, __proto__) aren't components", () => {
    const p = { blocks: [{ id: "p1", type: "toString" }, { id: "p2", type: "__proto__" }, { id: "p3", type: "constructor" }] };
    assert.equal(renderParts({ page: p, components, mode: "site" }).body, '<main class="b-page" id="content"><div class="b-slot"></div></main>');
    assert.equal(count(renderParts({ page: p, components, mode: "editor" }).body, "b-missing"), 3);
  });

  test("a component with an error: b-error in the editor, empty elsewhere; the other blocks work", (t) =>
    quietly(t, () => {
      const p = { blocks: [{ id: "r1", type: "broken" }, { id: "ok", type: "heading" }] };
      const editor = renderParts({ page: p, components, mode: "editor" });
      assert.ok(
        editor.body.includes(
          '<div class="b-error">The “Broken” block couldn&#39;t be displayed: broken &lt;b&gt;. It doesn&#39;t show on the site; its code is in components/broken.js.</div>',
        ),
      );
      assert.ok(editor.body.includes('<h1 class="heading">Hello</h1>'));
      for (const mode of ["site", "static"]) {
        const { body } = renderParts({ page: p, components, mode });
        assert.ok(!body.includes("b-error"));
        assert.ok(!body.includes("broken &lt;b&gt;"));
        assert.ok(body.includes('<div class="c-broken" data-c="broken" data-id="r1"></div>'));
        assert.ok(body.includes('<h1 class="heading">Hello</h1>'));
      }
    }));

  test("a broken schema (a default that can't be copied) breaks only its own block", (t) =>
    quietly(t, () => {
      const comps = {
        ...components,
        schema: { name: "Schema", props: { f: { type: "text", default: () => "x" } }, html: () => html`<p>no</p>`, js() {} },
      };
      const p = { blocks: [{ id: "s1", type: "schema" }, { id: "ok", type: "heading" }] };
      const editor = renderParts({ page: p, components: comps, mode: "editor" });
      assert.ok(editor.body.includes('<div class="c-schema" data-c="schema" data-id="s1"><div class="b-error">The “Schema” block couldn&#39;t be displayed:'));
      assert.ok(editor.body.includes('<h1 class="heading">Hello</h1>'));
      for (const mode of ["site", "static"]) {
        const { body, instances } = renderParts({ page: p, components: comps, mode });
        assert.ok(body.includes('<div class="c-schema" data-c="schema" data-id="s1"></div>'));
        assert.ok(body.includes('<h1 class="heading">Hello</h1>'));
        assert.deepEqual(instances, []);
      }
    }));

  test("instances: only the components with js and only the rendered blocks", () => {
    const { instances } = renderParts({ page, components, mode: "site" });
    assert.deepEqual(instances, [{ id: "b_3", type: "button", props: { text: "Come in", n: 0 } }]);
  });

  test("instances: a block whose html throws isn't started in the browser", (t) =>
    quietly(t, () => {
      const p = { blocks: [{ id: "r1", type: "broken" }, { id: "b1", type: "button" }] };
      for (const mode of ["editor", "site"]) {
        const { instances } = renderParts({ page: p, components, mode });
        assert.deepEqual(
          instances.map((i) => i.id),
          ["b1"],
        );
      }
    }));

  test("instances: the children of a parent that throws aren't started", (t) =>
    quietly(t, () => {
      const comps = {
        ...components,
        fragile: {
          name: "Fragile",
          slots: { content: "Content" },
          html(p, ctx) {
            ctx.slot("content");
            throw new Error("after the slot");
          },
        },
      };
      const p = { blocks: [{ id: "f1", type: "fragile", slots: { content: [{ id: "b1", type: "button" }] } }] };
      assert.deepEqual(renderParts({ page: p, components: comps, mode: "site" }).instances, []);
    }));

  test("instances: a slot rendered twice doesn't start the block twice", () => {
    const comps = {
      ...components,
      double: { name: "Double", slots: { s: "S" }, html: (p, ctx) => html`<div class="m">${ctx.slot("s")}</div><div class="d">${ctx.slot("s")}</div>` },
    };
    const p = { blocks: [{ id: "d1", type: "double", slots: { s: [{ id: "b1", type: "button" }] } }] };
    assert.deepEqual(
      renderParts({ page: p, components: comps, mode: "site" }).instances.map((i) => i.id),
      ["b1"],
    );
  });

  test("instances: a page with 40,000 blocks with js renders fast (no quadratic cost)", () => {
    const p = { blocks: Array.from({ length: 40000 }, (_, i) => ({ id: `b${i}`, type: "button" })) };
    const start = performance.now();
    const { instances } = renderParts({ page: p, components, mode: "site" });
    const ms = performance.now() - start;
    assert.equal(instances.length, 40000);
    assert.ok(ms < 3000, `${Math.round(ms)} ms`);
  });

  test("shown: only the blocks displayed (not those in areas that aren't rendered, nor the children of a block with an error)", (t) =>
    quietly(t, () => {
      const seen = { id: "v", type: "heading" };
      const hidden = { id: "a", type: "heading" };
      const underBroken = { id: "r2", type: "heading" };
      const comps = {
        ...components,
        fragile: { name: "Fragile", slots: { s: "S" }, html: (p, ctx) => { ctx.slot("s"); throw new Error("x"); } },
      };
      const box = { id: "c", type: "box", slots: { content: [seen], hidden: [hidden] } };
      const fragile = { id: "f", type: "fragile", slots: { s: [underBroken] } };
      const inZone = { id: "z", type: "heading" };
      const { shown } = renderParts({ page: { blocks: [box, fragile] }, components: comps, mode: "site", zones: { footer: { blocks: [inZone] } } });
      assert.ok(shown.has(box) && shown.has(seen) && shown.has(inZone));
      assert.ok(!shown.has(hidden) && !shown.has(fragile) && !shown.has(underBroken));
      const without = renderParts({ page: { zones: false, blocks: [] }, components: comps, mode: "site", zones: { footer: { blocks: [inZone] } } });
      assert.ok(!without.shown.has(inZone), "a page without zones doesn't show them");
    }));

  test("each type's CSS appears once; types = the rendered types", () => {
    const p = {
      blocks: [
        { id: "a", type: "heading" },
        { id: "b", type: "heading" },
        { id: "c", type: "box", slots: { content: [{ id: "d", type: "heading" }], hidden: [{ id: "e", type: "string" }] } },
      ],
    };
    const { css, types } = renderParts({ page: p, components, mode: "site" });
    assert.equal(count(css, components.heading.css), 1);
    assert.equal(count(css, components.box.css), 1);
    assert.equal(count(css, "/* heading */"), 1);
    assert.deepEqual(types.sort(), ["box", "heading"]);
  });

  test("a string returned by a component is trusted HTML; props are escaped", () => {
    const p = { blocks: [{ id: "s", type: "string" }, { id: "t", type: "heading", props: { text: "<img src=x onerror=alert(1)>" } }] };
    const { body } = renderParts({ page: p, components, mode: "site" });
    assert.ok(body.includes("<em>written by the author</em>"));
    assert.ok(body.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(!body.includes("<img"));
  });

  test("odd types and ids are escaped in the wrappers", () => {
    const p = { blocks: [{ id: '"><script>x</script>', type: "heading" }, { id: "z", type: '"><b>' }] };
    const editor = renderParts({ page: p, components, mode: "editor" }).body;
    assert.ok(!editor.includes("<script>"));
    assert.ok(!editor.includes("<b>"));
    assert.ok(editor.includes('data-id="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"'));
  });

  test("ctx.isEmpty(name): the area holds no block (items that aren't objects don't count)", () => {
    const comps = { ...components, z: { name: "Z", slots: { a: "A" }, html: (p, ctx) => html`<i>${ctx.isEmpty("a") ? "empty" : "full"}</i>` } };
    const withSlots = (slots) => renderParts({ page: { blocks: [{ id: "z", type: "z", slots }] }, components: comps, mode: "site" }).body;
    for (const slots of [undefined, {}, { a: [] }, { a: [null, 5, "x"] }, { a: "x" }, { b: [{ type: "heading" }] }]) {
      assert.ok(withSlots(slots).includes("<i>empty</i>"), JSON.stringify(slots));
    }
    assert.ok(withSlots({ a: [{ type: "heading" }] }).includes("<i>full</i>"));
  });

  test("ctx: mode, id, user, page, site", () => {
    const p = { title: "My page", blocks: [{ id: "c1", type: "context" }] };
    const site = { name: "Site" };
    const user = { id: "u1", name: "Ana", email: "ana@example.com" };
    assert.ok(
      renderParts({ page: p, site, components, mode: "site", user }).body.includes("site|c1|Ana|My page|Site"),
    );
    assert.ok(renderParts({ page: p, site, components, mode: "static" }).body.includes("static|c1|nobody|"));
  });

  test("blocks without an id get an automatic one; invalid blocks are skipped", () => {
    const p = { blocks: [{ type: "heading" }, null, 5, "x", { type: "heading" }] };
    const { body } = renderParts({ page: p, components, mode: "site" });
    assert.ok(body.includes('data-id="auto1"'));
    assert.ok(body.includes('data-id="auto2"'));
    assert.equal(count(body, 'data-c="heading"'), 2);
  });

  test("a missing page, or blocks that aren't a list", () => {
    assert.equal(renderParts({ page: null, components, mode: "site" }).body, '<main class="b-page" id="content"><div class="b-slot"></div></main>');
    assert.equal(renderParts({ page: { blocks: "x" }, components, mode: "site" }).body, '<main class="b-page" id="content"><div class="b-slot"></div></main>');
    assert.equal(renderParts({ page: { blocks: [{ type: "heading" }] }, components: undefined, mode: "site" }).body, '<main class="b-page" id="content"><div class="b-slot"></div></main>');
  });
});

describe("ctx.reachable and sitePath: the pages that aren't there", () => {
  test("sitePath: the page a link on this site points to; null for anything else", () => {
    assert.equal(sitePath("/about"), "/about");
    assert.equal(sitePath(" /about/?x=1#team "), "/about");
    assert.equal(sitePath("/"), "/");
    assert.equal(sitePath("/?x"), "/");
    for (const other of ["https://example.com/about", "//example.com/about", "mailto:a@b.example", "about", "", null, undefined, 5]) {
      assert.equal(sitePath(other), null, String(other));
    }
  });

  test("ctx.reachable(link) is false only for a link to one of missingPages; by default everything is reachable", () => {
    const seen = {};
    const probe = {
      probe: {
        name: "Probe",
        html: (p, ctx) => {
          for (const link of ["/account", "/account/", "/account?x#y", "/about", "https://example.com/account", "#top", ""]) {
            seen[link] = ctx.reachable(link);
          }
          return "";
        },
      },
    };
    const page = { blocks: [{ id: "p", type: "probe" }] };
    renderParts({ page, components: probe, mode: "static", missingPages: ["/account/"] });
    assert.deepEqual(seen, {
      "/account": false,
      "/account/": false,
      "/account?x#y": false,
      "/about": true,
      "https://example.com/account": true,
      "#top": true,
      "": true,
    });
    for (const options of [{}, { missingPages: null }, { missingPages: [] }]) {
      renderParts({ page, components: probe, mode: "site", ...options });
      assert.ok(Object.values(seen).every(Boolean), JSON.stringify(options));
    }
    // renderPage passes the list on.
    renderPage({ page, components: probe, mode: "static", missingPages: new Set(["/about"]) });
    assert.equal(seen["/about"], false);
    assert.equal(seen["/account"], true);
  });
});

describe("renderParts: the shared zones (header, footer)", () => {
  const zones = {
    header: { blocks: [{ id: "z1", type: "heading", props: { text: "MENU" } }, { id: "z2", type: "box" }] },
    footer: { blocks: [{ id: "z3", type: "heading", props: { text: "FOOTER" } }] },
  };
  const page = { blocks: [{ id: "p1", type: "heading", props: { text: "PAGE" } }] };

  for (const mode of ["site", "static", "editor"]) {
    test(`${mode}: the header before the page, the footer after`, () => {
      const { body } = renderParts({ page, components, mode, zones });
      const [a, p, s] = ["MENU", "PAGE", "FOOTER"].map((x) => body.indexOf(x));
      assert.ok(a !== -1 && p !== -1 && s !== -1);
      assert.ok(a < p && p < s);
    });

    test(`${mode}: page.zones === false hides the zones`, () => {
      const { body } = renderParts({ page: { ...page, zones: false }, components, mode, zones });
      assert.ok(body.includes("PAGE"));
      assert.ok(!body.includes("MENU"));
      assert.ok(!body.includes("FOOTER"));
      assert.ok(!body.includes("b-zone"));
    });
  }

  test("editor: the zones are in .b-zone[data-zone], without data-slot and without b-empty", () => {
    const { body } = renderParts({ page, components, mode: "editor", zones });
    const headerStart = body.indexOf('<div class="b-zone" data-zone="header">');
    const footerStart = body.indexOf('<div class="b-zone" data-zone="footer">');
    const root = body.indexOf('data-slot="root"');
    assert.ok(headerStart === 0);
    assert.ok(root > headerStart && footerStart > root);
    const header = body.slice(headerStart, body.indexOf('<div class="b-slot" data-slot="root"'));
    const footer = body.slice(footerStart);
    for (const zone of [header, footer]) {
      assert.ok(!zone.includes("data-slot"));
      assert.ok(!zone.includes("b-empty"));
    }
    // The empty block in the header (a box with no content) doesn't get b-empty.
    assert.ok(header.includes('data-id="z2"'));
    // The page itself stays editable.
    assert.equal(count(body, "data-slot"), 1);
  });

  test("site: the zones aren't wrapped in b-zone", () => {
    const { body } = renderParts({ page, components, mode: "site", zones });
    assert.ok(!body.includes("b-zone"));
    assert.ok(!body.includes("data-zone"));
  });

  test("empty or missing zones produce nothing", () => {
    for (const z of [{}, { header: { blocks: [] } }, { header: null, footer: { blocks: "x" } }, undefined]) {
      const { body } = renderParts({ page, components, mode: "editor", zones: z });
      assert.ok(!body.includes("b-zone"));
    }
  });

  test("the instances and the CSS from the zones are included", () => {
    const z = { header: { blocks: [{ id: "zb", type: "button" }] } };
    const { instances, css } = renderParts({ page, components, mode: "site", zones: z });
    assert.deepEqual(
      instances.map((i) => i.id),
      ["zb"],
    );
    assert.ok(css.includes(components.heading.css));
  });
});

describe("themeCss and safeJson", () => {
  test("the default theme and overriding it from site.json", () => {
    const css = themeCss({ theme: { primary: "#ff0000" } });
    assert.ok(css.startsWith(":root{"));
    assert.ok(css.includes("--primary:#ff0000;"));
    assert.ok(css.includes(`--text:${DEFAULT_THEME.text};`));
    assert.ok(css.includes(`--radius:${DEFAULT_THEME.radius};`));
    assert.ok(themeCss().includes(`--primary:${DEFAULT_THEME.primary};`));
    assert.ok(themeCss(null).includes(`--primary:${DEFAULT_THEME.primary};`));
  });

  test("the default theme is the warm one from docs/DESIGN.md", () => {
    assert.deepEqual(DEFAULT_THEME, {
      primary: "#E8562A",
      text: "#2B211D",
      background: "#ffffff",
      surface: "#FAF6F2",
      font: "ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      radius: "12px",
    });
    // The single quotes in the font aren't removed (they can't close the style block).
    assert.ok(themeCss().includes("--font:ui-rounded, 'SF Pro Rounded',"));
    for (const name of ["--primary", "--text", "--background", "--surface", "--font", "--radius"]) assert.ok(themeCss().includes(`${name}:`), name);
  });

  test("dangerous values and keys are cleaned", () => {
    const css = themeCss({
      theme: {
        primary: "red;}</style><script>alert(1)</script>",
        text: "blue\\;}body{display:none",
        "x}{<y>;\\": "1",
      },
    });
    assert.equal(count(css, "{"), 1);
    assert.equal(count(css, "}"), 1);
    assert.ok(!css.includes("<"));
    assert.ok(!css.includes(">"));
    assert.ok(!css.includes("\\"));
    assert.ok(css.endsWith(";}"));
    // One ";" per variable, nothing more.
    const vars = Object.keys({ ...DEFAULT_THEME, x: 1 }).length;
    assert.equal(count(css, ";"), vars);
    assert.ok(css.includes("--xy:1;"));
  });

  test("safeJson escapes “<”, so it can't close a <script>", () => {
    const value = { a: "</script><script>alert(1)</script>", b: "<!--", c: "\u2028\u2029" };
    const out = safeJson(value);
    assert.ok(!out.includes("<"));
    assert.ok(!out.includes("\u2028"));
    assert.ok(!out.includes("\u2029"));
    assert.deepEqual(JSON.parse(out), value);
  });
});

describe("renderPage", () => {
  const site = { name: "Site <Test>", lang: "en" };
  const user = { id: "u1", name: "Ana", email: "ana@example.com", password: "scrypt$secret" };

  test("without instances it doesn't include the runtime", () => {
    const out = renderPage({ page: { blocks: [{ id: "a", type: "heading" }] }, site, components });
    assert.ok(!out.includes("b-data"));
    assert.ok(!out.includes("/core/runtime.js"));
    assert.ok(out.includes('<link rel="stylesheet" href="/core/base.css">'));
    assert.ok(out.startsWith("<!doctype html>"));
  });

  test("with instances it includes the data and the runtime", () => {
    const page = { blocks: [{ id: "b1", type: "button", props: { text: "Go" } }] };
    const out = renderPage({ page, site, components, mode: "static" });
    assert.ok(out.includes('<script type="module" src="/core/runtime.js"></script>'));
    const data = JSON.parse(out.match(/<script type="application\/json" id="b-data">([^]*?)<\/script>/)[1]);
    assert.deepEqual(data, { mode: "static", instances: [{ id: "b1", type: "button", props: { text: "Go", n: 0 } }] });
  });

  test("“user” shows only in site mode, without secret fields", () => {
    const page = { blocks: [{ id: "b1", type: "button" }] };
    const read = (out) => JSON.parse(out.match(/id="b-data">([^]*?)<\/script>/)[1]);
    const siteData = read(renderPage({ page, site, components, mode: "site", user }));
    assert.deepEqual(siteData.user, { id: "u1", name: "Ana", email: "ana@example.com" });
    assert.equal(read(renderPage({ page, site, components, mode: "site" })).user, null);
    for (const mode of ["static", "editor"]) {
      const data = read(renderPage({ page, site, components, mode, user }));
      assert.ok(!("user" in data));
    }
    assert.ok(!renderPage({ page, site, components, mode: "site", user }).includes("scrypt$secret"));
  });

  test("props with </script> can't close the data block", () => {
    const page = { blocks: [{ id: "b1", type: "button", props: { text: "</script><script>alert(1)</script>" } }] };
    const out = renderPage({ page, site, components });
    assert.equal(count(out, "</script>"), 2);
    assert.ok(!out.includes("<script>alert"));
  });

  test("escapes the title, the description and the language", () => {
    const out = renderPage({
      page: { title: "<Home>", description: 'Coffee "good" & <cheap>', blocks: [] },
      site: { name: "Site <Test>", lang: 'en" onload="alert(1)' },
      components,
    });
    assert.ok(out.includes("<title>&lt;Home&gt; · Site &lt;Test&gt;</title>"));
    assert.ok(out.includes('<meta name="description" content="Coffee &quot;good&quot; &amp; &lt;cheap&gt;">'));
    assert.ok(out.includes('<html lang="en&quot; onload=&quot;alert(1)">'));
  });

  test("without a description there's no meta description; the default language is en", () => {
    const out = renderPage({ page: { title: "A", blocks: [] }, site: {}, components });
    assert.ok(!out.includes('name="description"'));
    assert.ok(out.includes('<html lang="en">'));
    assert.ok(out.includes("<title>A</title>"));
    assert.ok(renderPage({ page: { blocks: [] }, site: { lang: "ro" }, components }).includes('<html lang="ro">'));
  });

  test("the components' CSS is included, and a </style> in it doesn't close the style", () => {
    const comps = { bad: { name: "Bad", html: () => "", css: "a{}</style><script>alert(1)</script>" } };
    const out = renderPage({ page: { blocks: [{ id: "r", type: "bad" }] }, site, components: comps });
    assert.equal(count(out.toLowerCase(), "</style>"), 2);
    assert.ok(out.includes("/* bad */"));
  });

  test("the theme becomes CSS variables in the page", () => {
    const out = renderPage({ page: { blocks: [] }, site: { theme: { primary: "#123456" } }, components });
    assert.ok(out.includes("--primary:#123456;"));
  });

  test("csp: the rules as a <meta>, right after charset, before anything that can load something; without csp there's no <meta>", () => {
    const site = { head: ['<link rel="apple-touch-icon" href="/a.png">'] };
    const out = renderPage({ page: { blocks: [] }, site, components, mode: "static", csp: "default-src 'self'; img-src \"x\"" });
    assert.ok(
      out.includes(`<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;; img-src &quot;x&quot;">\n<meta name="viewport"`),
      out,
    );
    assert.equal(count(out, "Content-Security-Policy"), 1);
    assert.ok(!renderPage({ page: { blocks: [] }, site, components }).includes("Content-Security-Policy"));
  });
});

describe("renderParts: what html() returns", () => {
  const comps = {
    hidden: { name: "Hidden", props: { show: { type: "checkbox" } }, html: (p) => p.show && html`<div>visible</div>` },
    nil: { name: "Null", html: () => null },
    nothing: { name: "Nothing", html() {} },
    list: { name: "List", html: () => [html`<b>1</b>`, "<i>2</i>", 3] },
    number: { name: "Number", html: () => 7 },
    async: { name: "Async", html: async () => "<b>async</b>", js() {} },
    asyncBroken: { name: "Broken async", html: async () => { throw new Error("from async"); } },
    object: { name: "Object", html: () => ({ a: 1 }) },
  };
  const render = (type, mode = "site", props = {}) =>
    renderParts({ page: { blocks: [{ id: "x", type, props }] }, components: comps, mode }).body;
  const inner = (body) => body.match(/data-id="x">([^]*?)<\/div><\/div><\/main>/)?.[1] ?? body;

  test("false, null and undefined show nothing (as in html`...`)", () => {
    assert.equal(inner(render("hidden")), "");
    assert.equal(inner(render("hidden", "site", { show: true })), "<div>visible</div>");
    assert.ok(render("nil").includes('data-id="x"></div>'));
    assert.ok(render("nothing").includes('data-id="x"></div>'));
    assert.ok(!render("hidden").includes("false"));
  });

  test("a list is joined as in html`...` (its strings escaped); a number shows as text", () => {
    assert.ok(render("list").includes("<b>1</b>&lt;i&gt;2&lt;/i&gt;3"));
    assert.ok(render("number").includes('data-id="x">7</div>'));
  });

  test("an async html() or an object: a clear error in the editor, nothing on the site, no “[object ...]”", async (t) => {
    t.mock.method(console, "error", () => {});
    const editor = render("async", "editor");
    assert.ok(editor.includes("b-error") && editor.includes("html() can&#39;t be async"), editor);
    assert.ok(render("object", "editor").includes("not an object"));
    for (const type of ["async", "object", "asyncBroken"]) {
      const body = render(type);
      assert.ok(!body.includes("[object"), type);
      assert.ok(body.includes('data-id="x"></div>'), type);
    }
    const { instances } = renderParts({ page: { blocks: [{ id: "x", type: "async" }] }, components: comps, mode: "site" });
    assert.deepEqual(instances, []);
    // The rejection from the async function is caught: no "unhandledRejection" (which would stop the server).
    let unhandled = null;
    const listener = (reason) => (unhandled = reason);
    process.on("unhandledRejection", listener);
    render("asyncBroken");
    await new Promise((ok) => setTimeout(ok, 20));
    process.off("unhandledRejection", listener);
    assert.equal(unhandled, null);
  });

  test("onError gets the blocks that didn't render (a missing component, an error), with the zone", (t) => {
    const errorLog = t.mock.method(console, "error", () => {});
    const seen = [];
    renderParts({
      page: { blocks: [{ id: "a", type: "missing" }, { id: "b", type: "broken" }, { id: "c", type: "heading" }] },
      zones: { footer: { blocks: [{ id: "z", type: "missing-in-zone" }] } },
      components,
      mode: "static",
      onError: (e) => seen.push({ ...e, error: e.error?.message }),
    });
    assert.deepEqual(seen, [
      { type: "missing", id: "a", zone: null, error: undefined },
      { type: "broken", id: "b", zone: null, error: "broken <b>" },
      { type: "missing-in-zone", id: "z", zone: "footer", error: undefined },
    ]);
    assert.equal(errorLog.mock.callCount(), 0); // whoever gives onError decides what to do with them
  });

  test("ctx.slot with a name that isn't in “slots” → a warning (once)", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const comps2 = { wrong: { name: "Wrong", slots: { content: "Content" }, html: (p, ctx) => html`<div>${ctx.slot("contnet")}</div>` } };
    for (let i = 0; i < 2; i++) renderParts({ page: { blocks: [{ id: "g", type: "wrong" }] }, components: comps2, mode: "editor" });
    const calls = warn.mock.calls.map((c) => c.arguments[0]).filter((m) => m.includes("contnet"));
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes("isn't in “slots”"));
  });
});

describe("validateComponent", () => {
  test("a good component has no warnings", () => {
    for (const comp of Object.values(components)) assert.deepEqual(validateComponent(comp), [], comp.name);
  });

  test("“date”, “html”, the “format” key and “i18n” are accepted", () => {
    const comp = {
      name: "New",
      props: {
        title: { type: "text", format: true },
        when: { type: "date", label: "Date" },
        code: { type: "html", label: "Code" },
        l: { type: "list", fields: { day: { type: "date" }, t: { type: "text", format: true } } },
      },
      i18n: { ro: { name: "Nou", props: { title: { label: "Titlu" } } } },
      html: () => "",
    };
    assert.deepEqual(validateComponent(comp), []);
    assert.ok(validateComponent({ name: "x", props: { t: { type: "text", fórmat: true } }, html: () => "" })[0].includes("write “format”"));
    assert.ok(validateComponent({ name: "x", i18n: "ro", html: () => "" })[0].includes("“i18n” must be an object"));
  });

  test("accents and capital letters in keys, unknown types, a choice without options, a list without fields", () => {
    const warnings = validateComponent({
      Name: "x",
      Props: {},
      props: {
        n: { type: "Number" },
        l: { type: "lista" },
        o: { type: "choice", Options: ["a", "b"] },
        li: { type: "list", fíelds: { x: { type: "text" } } },
        ok: { type: "list", fields: { sub: { type: "list", fields: {} }, t: {} } },
        bad: "text",
      },
      slots: ["content"],
      js: "no",
      html: () => "",
    });
    const has = (part) => assert.ok(warnings.some((w) => w.includes(part)), `${part}\n${warnings.join("\n")}`);
    has("the key “Props” is ignored; write “props”");
    has("the key “Name” is ignored; write “name”");
    has("“name” is missing");
    has("props.n: there is no type “Number”; write “number”");
    has("props.l: there is no type “lista”.");
    has("props.o: the key “Options” is ignored; write “options”");
    has("props.o: a “choice” field needs “options”");
    has("props.li: the key “fíelds” is ignored; write “fields”");
    has("props.li: a “list” needs “fields”");
    has("props.ok.fields.sub: a “list” can't sit inside another “list”");
    has("props.ok.fields.t: “type” is missing");
    has("props.bad must be an object");
    has("“slots” must be an object");
    has("“js” must be a function");
  });

  test("a misspelled key gets a warning with the right one; keys that are just different don't", () => {
    const warnings = validateComponent({
      name: "x",
      descripton: "A typo.",
      tips: "One letter more.",
      NeedsServer: true,
      catgeory: "Swapped letters.",
      props: { t: { type: "text", lable: "Title", defualt: "", hlep: "x" } },
      html: () => "",
    });
    assert.deepEqual(warnings, [
      "the key “descripton” is ignored; write “description”.",
      "the key “tips” is ignored; write “tip”.",
      "the key “NeedsServer” is ignored; write “needsServer”.",
      "the key “catgeory” is ignored; write “category”.",
      "props.t: the key “lable” is ignored; write “label”.",
      "props.t: the key “defualt” is ignored; write “default”.",
      "props.t: the key “hlep” is ignored; write “help”.",
    ]);
    // Short keys allow a single edit; words that only look a bit alike stay quiet.
    assert.deepEqual(validateComponent({ name: "x", id: 1, data: {}, tag: "", server: true, html: () => "" }), []);
    assert.deepEqual(validateComponent({ name: "x", props: { t: { type: "text", rows: 3, hint: "", value: "" } }, html: () => "" }), []);
  });

  test("typoDistance counts added, removed, changed and swapped letters", () => {
    assert.equal(typoDistance("tip", "tip"), 0);
    assert.equal(typoDistance("tips", "tip"), 1);
    assert.equal(typoDistance("tp", "tip"), 1);
    assert.equal(typoDistance("tap", "tip"), 1);
    assert.equal(typoDistance("catgeory", "category"), 1);
    assert.equal(typoDistance("", "css"), 3);
    assert.equal(typoDistance("name", "nume"), 1);
  });
});
