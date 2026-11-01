# How Blocks works

This document is the contract between the parts: components, rendering, the server and the editor.
If you change something here, you change the rules for everyone.

## The idea in three lines

1. **A component is one JavaScript file** in `components/`. It holds everything: what can be edited, the HTML, the CSS and (optionally) the JavaScript for the browser. A component is a kind of block; a block is one of them, placed on a page.
2. **A page is one JSON file** in `pages/`. It only says which blocks it has, in what order and with what values.
3. **The editor only changes the page's file.** You can edit the same file by hand: both ways give the same result.

No npm dependencies, no build step. Node.js 22 or newer and a browser.

## Folders

```
blocks.js              the command: dev | start | build | component <id> | messages | account | help
core/                  runs both in the browser and on the server
  html.js              html`...` (automatic escaping), raw(), url(), inline(), paragraphs(), formatDate(), fold(), plural()
  render.js            page JSON → HTML (the same function in the editor and on the server):
                       renderParts({ page, site, components, mode, user, zones, path?, onError?, t?, missingPages? }) → { body, css, instances, types, shown }
                       renderPage(the same object, plus csp?) → the full HTML document (csp: the rules as a <meta>)
                       validateComponent(component) → warnings (e.g. "Props" with a capital letter)
                       safePlacement(placement) → a block's placement on a canvas, repaired (see "The Free canvas")
  runtime.js           starts the components' js(el, p, api) in the browser
  base.css             shared styles and handy classes (b-btn, b-field, ...)
server/                only on the server
  server.js            HTTP: pages, files, logging in, component routes, the editor API
  auth.js              accounts, passwords (scrypt), sessions
  i18n.js              what the server says to visitors, in English or Romanian (site.json → "lang")
  csp.js               the pages' safety rules (Content-Security-Policy)
  limits.js            the anti-abuse limits (attempts per address, IPv6 per /64 network), shared by the server
  store.js             JSON collections in data/
  project.js           reads the components, the pages and site.json
  build.js             the static export to dist/
editor/                the drag & drop editor (dev mode only)
components/            the components: <id>.js and, optionally, <id>.server.js
pages/                 the pages: <slug>.json (index.json is /), plus _header.json and _footer.json
assets/                images and public files (assets/uploads/ holds what you upload in the editor)
site.json              the site's name, language, theme and login page
data/                  what the server saves (never in git)
```

## The component

`components/<id>.js` (the id has lowercase letters, digits and hyphens). It exports an object by default:

```js
import { html, inline } from "../core/html.js";

export default {
  name: "Cover",                   // the name in the palette (required)
  category: "Sections",            // the palette group (see "Palette categories")
  icon: "hero",                    // an icon name (see below) or an emoji
  description: "A big title at the top of the page, with text and buttons.",   // one line, in the palette
  tip: "Start the button with a verb (“Book a table”).",                      // optional: one sentence, on hover

  props: {                         // what can be edited in the panel on the right
    title: { type: "text", format: true, label: "Title", default: "Hello" },
  },

  slots: { content: "Content" },   // optional: areas where other blocks are dragged

  html(p, ctx) {                   // required: returns the HTML
    return html`<section class="cover"><h1>${inline(p.title)}</h1>${ctx.slot("content")}</section>`;
  },

  css: `.cover h1 { color: var(--primary); }`,   // optional, added once per page

  js(el, p, api) { /* optional, runs in the browser for each block */ },

  needsServer: true,               // optional: it doesn't work in the static export (e.g. a login)

  i18n: { ro: { name: "Copertă" } },   // optional: the editor texts in Romanian (see "Languages")
};
```

An **alias** is a component that reuses another one under a different name, so older pages keep working: `contact-form.js` is `{ ...form, alias: "form", ... }`. `alias` keeps it out of the palette and the "+" menu (there is one way to add a form), and the server treats it as the component it names (see `ctx.block`).

The file is loaded **both in the browser and in Node**, so its top level uses neither `document` nor `node:` modules. Don't put secrets in it: it reaches the browser.

The server checks every component when it loads it. Syntax errors (with the line), misspelled keys (`Props` or `Fields` instead of `props` and `fields`), unknown types and badly named files (`ProductPrice.js`) show up as warnings in the terminal, once per version of the file.

### Palette categories

`category` is the name of the group in the palette. The editor shows them in this order: **My blocks** (only when at least one block is in it), **Sections**, **Text & images**, **Lists**, **Contact**, **Members**, **Page**. A name that isn't on the list (e.g. "Acme Studio") becomes a category of your own and comes right after "My blocks": what isn't part of Blocks is yours, so it goes on top. The `node blocks.js component` template starts with "My blocks".

### Description and tip

`description` is one line, in plain words, shown in the palette ("A menu or a price list: a name, a short description and the price, lined up on the right."). `tip` is optional: one more sentence, shown by the editor when you hover over the block, together with the description and a thumbnail of the block displayed with its default values ("Use one block per category (“Coffee”, “Food”), each with its own title; the price is free text, so you can also write “from $50” or “free”."). Both end with a period.

### The icon

`icon` should be a **name** from the list in [DESIGN.md](DESIGN.md) (`text, heading, image, gallery, video, button, cards, columns, section, spacer, navbar, footer, hero, faq, quote, form, login, signup, account, members, list, link, star, calendar, code, block, stats, timeline, logos, press, locations, pricing, hours, team, events, cta, image-text, map, social, canvas`): the editor draws it as a line icon, in the same style as the others. Any other value (an emoji, a character) is shown as text, in the same tile. The bundled components all use names; the `node blocks.js component` template starts with `block`.

### Field types

Every field is `{ type, label, default, help }`, plus what its type needs.

| type       | value                        | extra keys                                          |
|------------|------------------------------|-----------------------------------------------------|
| `text`     | string                       | `format: true` if you display it with `inline()` (see "Formatting in text") |
| `longtext` | string (with `\n`)           |                                                     |
| `number`   | number                       | `min`, `max`, `step`                                |
| `color`    | string `#rrggbb`             |                                                     |
| `choice`   | string                       | `options`: `["a", "b"]` or `[{ value, label }]`     |
| `checkbox` | boolean                      |                                                     |
| `image`    | string (URL)                 | the editor has an upload button                     |
| `link`     | string (URL or path)         | the editor suggests the site's pages                |
| `date`     | string `YYYY-MM-DD` or `""`  | the editor shows a calendar; display it with `formatDate()` |
| `html`     | string (raw HTML)            | display it with `raw()`; see the warning below      |
| `list`     | array of objects             | `fields`: `{ key: field }` (no `list` inside a `list`) |

Default values when `default` is missing: `""`, `0` for `number` (clamped between `min` and `max`, if they are set), the first option for `choice`, `false` for `checkbox`, `[]` for `list`. Rendering fills in whatever is missing (inside list items too), so `p.title` always exists.

It also brings every value in line with what its type promises, however the page file is written. A `choice` is **always one of its `options`** (a `3` written without quotes becomes `"3"`; anything else, e.g. `"left x-sneaky"`, gets the default). A `number` is a finite number between `min` and `max` (rounded when `step` is an integer; `"4"` becomes `4`). A `checkbox` is `true` or `false` (the text `"false"` isn't true). An `html` that isn't text becomes `""`. So `p.align` can go straight into a class name: nothing can slip in.

**`html` is trusted code.** What the site owner writes in an `html` field goes into the page exactly as written, `<script>` and all: that is how they paste a map, an embedded video or a widget. The editor says so under the field: "HTML code. It goes into the page exactly as written, so only paste code you trust." Never use this type for text that comes from visitors. In the editor the code runs isolated, and a page with such a field filled in gets relaxed safety rules (see "Safety").

### Formatting in text

Three marks that anyone can type:

| you type                 | you get                                     |
|--------------------------|---------------------------------------------|
| `**bold**`               | `<strong>bold</strong>`                     |
| `*italic*`               | `<em>italic</em>`                           |
| `[text](address)`        | `<a href="address">text</a>`                |

- `inline(text)` from `core/html.js` does the transformation and escapes the rest. Addresses go through `url()` (`javascript:` → `#`); the ones that point to another site (`http://`, `https://`, `//`) get `target="_blank" rel="noopener"`.
- A mark without its pair stays as written (`5 * 3`), and so does a pair that spans a line break, or one put inside another (`**a *b* c**` → only `b` is italic).
- `paragraphs(text)` runs every line through `inline()`, so **every `longtext` field gets formatting for free**. An empty line starts a new paragraph, a single Enter becomes `<br>`, and lines that start with `- ` become a list: `"We have:\n- coffee\n- tea"` → `<p>We have:</p><ul><li>coffee</li><li>tea</li></ul>`. It returns a list of pieces (`<p>`, `<ul>`), each one safe HTML.
- A `text` field gets formatting only if the component displays it with `inline()`; it then declares `{ type: "text", format: true }`, so the editor shows the formatting bar. `format` is ignored on the other types.
- `formatDate("2025-12-22")` → `"December 22, 2025"`, and `formatDate("2025-12-22", "ro")` → `"22 decembrie 2025"`; anything else (a date that doesn't exist, another format, `""`) → `""`. Components write `<time datetime="${p.date}">${formatDate(p.date, ctx.site?.lang)}</time>`.

### `html(p, ctx)`

- `p`: the block's settings, filled in with the default values.
- `ctx.mode`: `"editor"`, `"site"` or `"static"`.
- `ctx.user`: `{ id, name, email }` or `null` (on the server; in the editor and the static export it is always `null`).
- `ctx.id`: the block's id.
- `ctx.page`, `ctx.site`: the page's JSON and `site.json`.
- `ctx.path`: the page's address (e.g. `"/about"`), so a menu can mark its active link. `null` when it isn't known.
- `ctx.slot(name)`: the HTML of the blocks dragged into that area. `name` must be in `slots` (otherwise a warning shows up).
- `ctx.slot(name, { free: true })`: the same area, but its blocks sit anywhere on a grid, as in the Free canvas (see "The Free canvas" below). Only `true` turns the grid on.
- `ctx.isEmpty(name)`: `true` when the area holds no block, e.g. `if (ctx.mode !== "editor" && ctx.isEmpty("content")) return "";` (an empty "Members only" block doesn't ask anyone to log in).
- `ctx.reachable(link)`: `false` for a link to a page of this site that isn't there, so a menu can leave it out: `p.links.filter((l) => ctx.reachable(l.link))`. Only the static export has such pages (it leaves out the members-only ones); everywhere else it is always `true`. Header and Footer use it.

It returns an `` html`...` `` template (recommended: it escapes automatically) or a string (treated as trusted HTML, so it isn't escaped). `false`, `null` and `undefined` display nothing, as in the template (e.g. `` return p.show && html`...` ``). `html()` can't be `async` and can't return other objects: the block shows up as an error. For links and images from the settings, use `url(p.link)`: it blocks `javascript:`. For texts: `paragraphs(p.text)` for a `longtext`, `inline(p.title)` for a `text` with `format: true`, `formatDate(p.date, ctx.site?.lang)` for a `date`, `raw(p.code)` for an `html`. `raw()` is also for HTML you write yourself in the component, e.g. an SVG icon (see `locations.js`). A `text` with several lines (an address) is displayed line by line, with `inline()` and a `<br>` between them.

### `js(el, p, api)`: in the browser

- `el`: the block's wrapper (`<div data-c="type" data-id="...">`). Look for things inside it: `el.querySelector(...)`.
- `api.mode`: like `ctx.mode`. In the editor (`"editor"`), components shouldn't submit forms or redirect.
- `api.get(url)`, `api.post(url, data)` → `{ ok, status, data }` (JSON, with the session cookie). Without a connection, `data` is `{ error }`.
- `api.user()` → a Promise with the logged-in user, or `null`. On the site it comes with the page (no request); after an `api.post` to `/api/auth/...`, it is fetched from the server again.
- `api.on(event, fn)` / `api.emit(event, data)`: messages between components.
- `api.onStop(fn)`: stop here whatever you started on `window` or `document` (listeners, `setInterval`). The editor redraws the page often.

### The server part: `components/<id>.server.js`

Optional. **It is never sent to the browser** (the server refuses `/components/*.server.js`). The logic and the secrets live here.

```js
export default {
  "POST /submit": async (request, ctx) => {
    if (!request.body.email) ctx.error(400, "Please write your email address.");
    ctx.data("messages").add({ email: request.body.email });
    return { ok: true };                     // → a 200 JSON answer
  },
};
```

The `"POST /submit"` route in `form.server.js` answers at `POST /api/c/form/submit`.

- `request`: `{ method, path, query, body, user, ip, headers }`. `body` is the JSON object sent (`{}` for a GET and when the body is empty). POST, PUT, PATCH and DELETE requests must be `application/json` and come from the same site, and the body must be an object: `null`, `5` or `[...]` get a 400 before they reach the route.
- `ctx.data(name)`: a collection saved in `data/<name>.json`, with `all()`, `count()`, `find(fn)`, `filter(fn)`, `byId(id)`, `add(obj)` (it sets `id` and `created` by itself, even if `obj` has them), `update(id, changes)`, `remove(id)` and `removeWhere(fn)`. A file changed by hand while the server runs is read again.
- `ctx.block(path, blockId)`: the block with this id on the page at the address `path` (e.g. `location.pathname`, sent by the browser), **exactly as the visitor sending the request sees it**: `{ block, component, page, path }` or `null`. The server displays the page for that visitor, so it also returns `null` for a block on a members-only page (for a visitor without an account), inside "Members only", in an area its container doesn't display (e.g. Column 3 with 2 columns), in the shared zones of a page with `"zones": false`, or for a block of another kind than the route's component (or its alias). At an address that doesn't exist, the 404 page answers, as it does for visitors. `component` is the one the server loaded (with the schema in the file as it is now), handy for `withDefaults(component, block.props)`.
- `ctx.limit({ name, max, minutes, message, allVisitors })`: counts one attempt; above `max` within `minutes` (1–1440), it answers 429 with `message` (or, without one, with a standard line in the site's language). It counts per visitor address (IPv6: per /64 network, otherwise anyone could get around the limit by changing address), or, with `allVisitors: true`, once for the whole site. The name belongs to the component: two components don't share their limits.
- `ctx.error(status, message)`: stops and answers `{ error: message }`. `status` is between 400 and 599 (otherwise it becomes 400, with a warning in the terminal); on a 500 the visitor sees the general message.
- `ctx.site`: the site settings (`site.json`), e.g. `ctx.site.lang` to answer in the site's language.
- What you return becomes JSON; returning nothing (`undefined`) gives `{ ok: true }`, and `null` stays `null`.

#### The form: how the server checks without trusting the visitor

The `form` block has the fields chosen by the site owner (`fields: [{ label, type, required, options }]`, where `type` is one of `text`, `email`, `phone`, `longtext`, `checkbox`, `choice`). The browser sends only this to `POST /api/c/form/submit`:

```json
{ "page": "/contact", "block": "b_r40pf1sj", "values": ["Ana", "ana@example.com", "Hello!"], "website": "" }
```

The server **never takes the schema from the visitor**. It finds the block with `ctx.block`: only a form the visitor can see on the page (one on a members-only page, in a hidden area or inside "Members only" gives a 404 to someone who isn't logged in). It checks every value by the kind of its field on the page (lengths, email, phone, an option from the list, a checkbox) and removes control characters and the invisible ones that change the text's direction or hide letters (U+202E, U+200B…). A block that isn't a `form` (or its alias, `contact-form`) gives a 404. There is also a trap for robots: a hidden `website` field; when it comes back filled in, the server answers "ok" and saves nothing.

The limits (`ctx.limit`): 5 messages in 10 minutes from the same address (IPv6: the same /64 network), 30 attempts in 10 minutes (wrong ones too, since they read the page from disk) and 100 messages an hour from all visitors together. After 10,000 messages in `data/messages.json`, the form answers 503 and the server says in the terminal that the file must be moved. A saved message has `{ form, page, answers: [{ label, value }] }`, plus `name`, `email`, `phone` and `message` (the first field of each kind, and all the answers as text), which `node blocks.js messages` shows. The visitor's IP address isn't saved. The values are always text or yes/no, never code.

## The page: `pages/<slug>.json`

```json
{
  "title": "Home",
  "description": "For search engines",
  "access": "public",
  "blocks": [
    { "id": "b_1", "type": "hero", "props": { "title": "Hello" } },
    { "id": "b_2", "type": "section", "props": {}, "slots": { "content": [
      { "id": "b_3", "type": "text", "props": {} }
    ] } }
  ]
}
```

- The address comes from the file name: `index.json` → `/`, `about.json` → `/about`; `404.json` is the "page not found" page.
- `access: "members"`: only logged-in people see the page; everyone else is sent to `loginPage` from `site.json`, with `?next=/page`.
- `id` is unique on the page (the editor uses `b_` plus random letters).
- `placement` (optional, only for the blocks in a free area): where the block sits on the grid, e.g. `{ "x": 1, "y": 1, "w": 6, "h": 8, "z": 0, "shape": "rounded", "fill": true }`. Outside a free area it is ignored.
- `windowTitle` (optional): the full title in the browser tab, instead of "Title · Site".
- `styles`, `scripts` (optional): the page's own lists, used **instead of** the ones in `site.json` (e.g. a page with a different design). `head` adds to the site's.

## The shared zones: header and footer

`pages/_header.json` and `pages/_footer.json` have the same format as a page (`{ "blocks": [...] }`) and show on **every** page: the header before, the footer after. This way you edit the menu once. A page can hide them with `"zones": false`. Names that start with `_` aren't pages and have no address. The Footer block has an "Extra" area (`slots: { extra: "Extra" }`), between the links and the copyright line: what you drag there (Social media, Opening hours, Logos) shows on every page.

## `site.json`

```json
{ "name": "My site", "lang": "en", "loginPage": "/login",
  "theme": { "primary": "#E8562A", "text": "#2B211D", "background": "#ffffff", "surface": "#FAF6F2",
             "font": "ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
             "radius": "12px" } }
```

These are also the default values (`DEFAULT_THEME` in `core/render.js`): warm, calm, with no downloaded fonts. `lang` is the site's language (`"en"` by default): it goes into `<html lang>`, and with `"ro"` the messages the server and the blocks show to visitors are in Romanian (any other language gets the English ones; see "Languages"). The theme becomes CSS variables: `--primary`, `--text`, `--background`, `--surface`, `--font` and `--radius`. Components use the variables, not fixed colors, so the whole site looks consistent.

### A site that already has its own design

Options for when you bring in an existing site, with its own CSS and JavaScript:

| key               | what it does                                                            |
|-------------------|-------------------------------------------------------------------------|
| `styles`          | `["/assets/css/site.css"]`: CSS files on every page, after `base.css` and before the components' CSS; they load in the editor too |
| `scripts`         | `["/assets/js/site.js"]`: scripts on every page, at the end of the page; they **don't** run in the editor |
| `blocksStyles`    | `false`: no `base.css` (only the wrappers' `display: contents` rule stays) |
| `favicon`         | `"/assets/img/favicon.png"`: the icon in the browser tab                |
| `titleSeparator`  | `" – "`: instead of `" · "` between the page's title and the site's name |
| `head`            | `["<link rel=\"apple-touch-icon\" href=\"/assets/img/apple.png\">"]`: pieces of HTML put exactly as they are in `<head>`, before the styles; a page can add its own with the same key. They don't show in the editor |

## What rendering produces

Every block is wrapped, and so is every area:

```html
<div class="b-slot">                                         <!-- the area -->
  <div class="c-hero" data-c="hero" data-id="b_1"> ...the component's HTML... </div>
</div>
```

Both wrappers have `display: contents` (from `base.css`): they have no box of their own, and their children are laid out directly in the parent (flex and grid work as usual). So put margins and spacing on your own elements, not on the wrapper. A component's CSS can use `.c-<id>` as a safe prefix.

The page's body is: the `header` zone, then `<main class="b-page" id="content">` with the page's area, then the `footer` zone.

In `editor` mode, there is also:

- `data-slot="root"` on the page's area, and `data-slot="<blockId>:<areaName>"` on the others;
- the shared zones, wrapped in `<div class="b-zone" data-zone="header|footer">`, with no `data-slot` and no `b-empty` (you see them, but you don't edit them from the page);
- in empty areas, `<div class="b-empty" data-empty>…</div>`, with the text `Drag a block here` (the page's area) or `Drag a block into “Content”` (the components' areas, with the label from `slots`). It is the only element with a box, styled by the editor (which also gives it the "+" button), and the editor shows its text in its own language;
- the missing components, as `<div class="b-missing">`, and the ones with errors, as `<div class="b-error">`.

A free area (`ctx.slot(name, { free: true })`) is different: see "The Free canvas".

## The Free canvas: blocks placed anywhere

The bundled block is `canvas` ("Free canvas", in "Sections"). Any component can have a free area, with a single flag:

```js
slots: { content: "Content" },
html(p, ctx) {
  return html`<div class="canvas">${ctx.slot("content", { free: true })}</div>`;
},
```

Next to `props`, every block in the area has a `placement` field, on a grid of 12 columns and 2rem rows:

| field   | meaning                                | values                            | default |
|---------|----------------------------------------|-----------------------------------|---------|
| `x`     | the first column                       | integer 1–12                      | 1       |
| `y`     | the first row                          | integer 1–200                     | 1       |
| `w`     | the width, in columns                  | integer 1–12, with `x + w - 1 ≤ 12` | 6     |
| `h`     | the height, in rows                    | integer 1–60                      | 4       |
| `z`     | the layer (who sits on top)            | integer 0–50                      | 0       |
| `shape` | the cell's outline                     | `rect`, `rounded`, `circle`       | `rect`  |
| `fill`  | images and videos fill the cell        | `true` / `false`                  | `false` |

`safePlacement(a)` from `core/render.js` repairs anything else to the nearest valid value: fractions are rounded (`2.7` → 3), what's out of range sticks to the edge (`-5` → 1, `1e9` → 12), a number written as text is accepted (`"4"` → 4), and the rest (other text, `NaN`, objects, `null`, a missing value) gets the default. The width shrinks so the block fits (`x: 10, w: 6` → `w: 3`). `shape` must be exactly one from the list, and `fill` exactly `true`. It never throws (not even on a getter that throws) and always returns a new object, with exactly the 7 fields.

What the core produces for a free area:

```html
<div class="b-grid" data-grid="b_1:content">                     <!-- the grid: a real element, with a box -->
  <div class="b-cell b-cell--rounded b-cell--fill" style="grid-area:1 / 1 / span 8 / span 6;z-index:0">
    <div class="c-image" data-c="image" data-id="b_2"> ... </div>
  </div>
</div>
```

- The cells come in **reading order**: by `y`, then by `x` (on a tie, in the page's order). That's how they stack on a phone and how screen readers read them.
- `style` holds only `grid-area` and `z-index`, written only from the integers given by `safePlacement`; the shape classes come only from the list. Nothing anyone types reaches the CSS.
- The grid's CSS (`GRID_CSS`) goes into the page **once**, before the components' CSS, so it also works with `"blocksStyles": false`.
- Rows are at least 2rem tall and grow when the text needs more room: nothing gets cut off. Between columns there is `--b-grid-gap` (1rem), which a component can change (e.g. `.canvas--small .b-grid { --b-grid-gap: 0.5rem; }`).
- Every cell is a **container** (`container-type: inline-size`): a block inside it lays itself out by the cell's width (see "Blocks lay themselves out by their container"), so Cards in a 4-column cell stack their cards one under the other instead of squeezing them.
- A cell placed **over** a block drawn before it (by layer, then in reading order) gets the `b-cell--over` class and the `--b-grid-background` background (`--background` by default; Free canvas and Section set their own), so the text underneath doesn't show through. Over an image that fills its cell (`fill`), the cell stays transparent: a title on a photo. On a phone (stacked), there's no background.
- The limits (12 columns, `y` ≤ 200, `h` ≤ 60, `z` ≤ 50, the phone below 640 px, the 2rem row) are `LIMITS` in `core/render.js`; the editor builds its geometry on them.
- **On a phone, it sorts itself out:** below 640 px of grid width (a container query, not the screen's width), the cells stack one under the other, full width, with `--b-grid-gap` between them. A cell with `fill` keeps its height (`h` rows); the others are as tall as their content.
- The grid has `isolation: isolate`: the layers (`z-index`) stay inside it and don't go over the sticky menu.
- Shapes: `rounded` rounds the cell's corners (`--radius`) and clips what sticks out; `circle` clips the content to the largest circle that fits in the cell (it stays a circle, never stretched into an ellipse).
- `fill`: the images (`img`) and videos (`video`) in the cell fill it, cropped (`object-fit: cover`). It's meant for blocks with a single image; a component can fit its own frame with `.b-cell--fill .my-frame { ... }`.
- Inside a cell, `b-block` adds no space above and below, and `b-container` takes the cell's width: a block behaves as in a narrow column and knows nothing about the canvas.
- A missing block leaves no cell on the site, and list items that aren't objects are skipped.

In `editor` mode (and not in the shared zones), there is also:

- `data-cell="<blockId>"` on every cell, for the handles (the same id as the block's `data-id`, even for a block without an id);
- in an empty grid, `<div class="b-empty" data-empty>Drag a block here, then place it anywhere and drag its corners to make it bigger.</div>`, across the whole grid.

The grid has no `data-slot`: there are no gaps between blocks on a canvas, since moving and resizing take their place.

The `canvas` block also has a minimum height (`minRows`, 6–60 rows, 12 by default; on a phone the canvas is as tall as its blocks), a spacing (`small`, `medium`, `large`: above, below and between the blocks), a background (`none`, `surface`, `primary`) and a width (`normal`, `full`). When it's empty, it doesn't show at all on the site; in the editor it shows the hint above.

## Shared classes from `base.css`

- `b-container`: a centered maximum width. One inside another adapts to its parent.
- `b-block`: space above and below a block on the page; inside another `b-block` (a section, columns), the space goes away. Content components use `<div class="b-block ..."><div class="b-container">...</div></div>`.
- `b-btn`, `b-btn--outline`: buttons.
- `b-form` (a grid of fields), `b-field` (`<label class="b-field">Text <input></label>`), `b-message`, `b-message--error`, `b-message--success` (hidden when empty).

### Blocks lay themselves out by their container

`body` is a container (`container-type: inline-size`, even with `"blocksStyles": false`), and so is every cell of a canvas and every column of Columns. That's why the bundled components write their rules for narrow screens with `@container (max-width: …)`, not `@media`, and fluid sizes with `cqi`, not `vw`. On the page they behave as usual (the page is as wide as the screen), and inside a column or a cell they follow its width. `@media` stays only for what really depends on the screen (the phone menu in the Header, the gallery's lightbox).

## Languages

Blocks speaks English, with Romanian as a second language. Each kind of text has one place:

- **What the site owner writes** (titles, texts, button labels) lives in the blocks' settings, in the page files. It is never translated: the owner writes it in the site's language. The `default` values in a component are English sample content.
- **What the site says to visitors on its own** follows `site.json` → `lang` (`"en"`, or `"ro"`):
  - the server's messages (logging in, signing up, the password rules, the limits, the error pages) are in `server/i18n.js`: `MESSAGES = { en, ro }`, `message(lang, key, values)` and `siteLang(site)`;
  - the few words a block writes by itself (the hint in an empty area, a field's name, an aria-label, a fallback message) sit in a small `WORDS = { en, ro }` table in the component, picked with `ctx.site?.lang` in `html()` and with `<html lang>` in `js()`. The browser runtime does the same for its "no connection" message.
- **What the editor says to the person building the site** has its own switch, **EN / RO** in the top bar. The choice is remembered by the browser (`localStorage`, `blocks.lang`) and applied with a reload, after saving. `editor/i18n.js` has `t("English text", values)` and `tn(n, one, many)` (for counts), with English as the source and a complete Romanian dictionary keyed by the English text; a test fails if a key has no Romanian entry. The editor passes its `t` to `renderParts`, so the core's editor texts (empty areas, broken blocks) follow it too. The editor API always answers in English, and the editor translates what it shows.

A component can carry its editor texts in Romanian, in an optional `i18n.ro`:

```js
i18n: {
  ro: {
    name: "Prețuri",
    description: "Meniu sau listă de tarife: nume, o descriere scurtă și prețul, aliniat în dreapta.",
    props: {
      style: { label: "Stil", options: { lines: "Linii", cards: "Carduri" } },
      items: { label: "Produse", fields: { name: { label: "Nume" }, price: { label: "Preț" } } },
    },
    slots: { content: "Conținut" },   // only for components with areas
  },
},
```

The editor uses it when its language is Romanian and falls back to the English text for anything missing. Settings are matched by key, options by value, and a list's fields go under `fields`. `category` in `i18n.ro` only matters for a category of your own: the seven palette categories are translated by the editor.

## HTTP API

Logging in (used by the Log in, Sign up and My account blocks, and by the Header):

| Method and path               | You send                     | You get                  |
|-------------------------------|------------------------------|--------------------------|
| `POST /api/auth/register`     | `{ name, email, password }`  | `{ user }` + a cookie    |
| `POST /api/auth/login`        | `{ email, password }`        | `{ user }` + a cookie    |
| `POST /api/auth/logout`       | `{}`                         | `{ ok: true }`           |
| `GET /api/auth/me`            |                              | `{ user }` (`null` when nobody is logged in) |

Errors come as `{ error: "a message for people" }`, in the site's language, with a 4xx status (429 after too many attempts or too many new accounts from the same address), or 503 when the server is too busy with passwords. A new password has at least 15 characters (see "Safety"); an email that already has an account gets a 409, with a neutral message.

An account has at most 10 sessions (a new one closes the oldest). You manage accounts with `node blocks.js account ...`, even while the server runs.

The editor's API exists only in `dev`, and only on `http://localhost:PORT`, not on the site's address, `http://127.0.0.1:PORT`. Requests that change something send the `x-blocks: 1` header. Errors come as `{ error }`, in English:

| Method and path                 | What it does                                        |
|---------------------------------|-----------------------------------------------------|
| `GET /_api/components`          | `[{ id, hasServer, error? }]` (`error`: why it doesn't load, with the line of the mistake) |
| `GET /_api/pages`               | `[{ slug, title, path, access, types }]` (`types`: the kinds of blocks on the page) |
| `GET /_api/pages/<slug>`        | the page's JSON (404 if it doesn't exist)           |
| `PUT /_api/pages/<slug>`        | saves (or creates) the page; refuses a page with more than 64 levels or 50,000 values, or with blocks that aren't objects (the same goes for the zones and `site.json`) |
| `DELETE /_api/pages/<slug>`     | deletes the page (not `index`)                      |
| `GET /_api/zones/<header\|footer>` / `PUT` | reads / saves a shared zone (`{ blocks }`) |
| `GET /_api/site` / `PUT`        | reads / saves `site.json`                           |
| `POST /_api/upload?name=a.jpg`  | the body is the file; returns `{ url }`. The content must really be an image (judged by its first bytes: PNG, JPEG, GIF, WebP, AVIF), and the content sets the extension |
| `GET /_api/events`              | SSE: `{ type: "components" \| "pages" \| "site", file }` on every change on disk |

## Commands

- `node blocks.js dev`: the editor at `http://localhost:3000/_editor/`, the site at `http://127.0.0.1:3000/` (another origin, see "Safety"). It listens only on your computer.
- `node blocks.js start`: only the site, with logging in and forms (`HOST`, `PORT`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`; with `TRUST_PROXY=1`, `X-Forwarded-For` and `X-Forwarded-Host` count too).
- `--port 3001`: another port for `dev` and `start` (instead of `PORT`).
- `node blocks.js build`: static HTML in `dist/`. Members-only pages aren't exported, and neither are the Header and Footer links to them (`ctx.reachable`); what needs the server and other links to missing pages are reported. A page, a zone or a component that couldn't be exported is an error: the command ends with exit code 1. Addresses in the pages start with `/`, so `dist/` goes at the root of a domain; for a subfolder, `--base /project/` puts `/project/` in front of them (GitHub Pages). Every page carries its safety rules in a `<meta>`; the pages where they are relaxed are listed at the end, with the reason.
  - `--out export`: another export folder (inside the project).
  - `--base /project/`: the site will live in a subfolder (e.g. GitHub Pages), so addresses become `/project/...`.
- `node blocks.js component <id>`: a new component from the template.
- `node blocks.js messages`: the messages sent through the forms (`data/messages.json`).
- `node blocks.js account list | account logout <email> | account delete <email>`: the accounts. List them, close every session of an account, or delete an account.
- `node blocks.js help`: all of the above.

## Safety

The core does all of this by itself, with nothing to configure.

**HTML code is isolated in the editor.** In the editor, the Embed code block runs its code in a separate frame, `<iframe sandbox="allow-scripts allow-popups allow-forms" srcdoc="…">`, never with `allow-same-origin`. The frame has the "null" origin, so it can't reach the editor, the cookies or `/_api` (the server refuses `Origin: null`). The code is escaped inside `srcdoc`, so nothing from it reaches the editor's page. The frame only sends its height (`postMessage`, a number), and the block's `js()` accepts it only from its own frame, between 40 and 4000 px. On the site, the code goes straight into the page. In `dev`, the site's pages live on `http://127.0.0.1:PORT`, and the editor and `/_api` on `http://localhost:PORT`: "View page" opens the page on another origin, so code on the site can't reach the editor either. The editor also sends `Cross-Origin-Opener-Policy: same-origin`: a page opened this way gets no `window.opener`, so it can't send the editor's tab to another address.

**The pages' rules (Content-Security-Policy).** `server/csp.js` writes them for every page. The server sends them as a header (in `dev` and `start`, but not on `/_editor/` and `/_api/`), and the static export puts them in a `<meta>`, without `frame-ancestors` (the browser ignores it there). By default they are strict:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;
font-src 'self' data:; media-src 'self' https:; frame-src https://www.youtube-nocookie.com https://www.google.com;
connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

- They are relaxed automatically, only on pages with **custom code**: a filled-in `html` field in any block (in the shared zones or in a list too; the type comes from `props`), a `<script>` or an `on…="…"` in `head`, read the way the browser reads it (JSON-LD data doesn't count, and `data-type` isn't `type`), or `scripts` from another site. Then scripts (including the ones written in the page), styles, fonts, frames, requests and forms may use any `https:` address, so pasted widgets work. `node blocks.js build` says on which pages and why, for example: *Page “Home” (/) has custom code (the “Embed code” block), so the safety rules are relaxed on it.*
- `styles` from another site (e.g. a font) only add that site to the styles and `https:` to the fonts; scripts stay strict.
- For programmers: `html()` doesn't output `<script>` or `onclick="…"` (they wouldn't run on a strict page). JavaScript lives in `js()`, which is served by the site.

**Passwords.** A new password has at least 15 characters (NIST SP 800-63B-4, for when the password is the only proof) and at most 200, with no composition rules ("a digit and a symbol"). What counts is what a person sees: letters in their usual form (NFKC, so "ｑ" is "q"), without the spaces at either end and without invisible characters (control characters, zero-width ones, halves of an emoji), and a run of spaces counts once. The hash gets the password exactly as typed. On that same form, ignoring capitals, the server refuses only the obvious patterns: the same short piece repeated ("aaaa…", "abcabc…", "password password…"), keys or characters in a row ("qwerty…", "123456…"), and a password that contains the email address (the part before the "@", when it has at least 4 characters). Older accounts, with shorter passwords, can still log in. On signup, an email that already has an account gets a neutral message: "We couldn't create an account with this address. If you already have one, log in."

**Node.js 22 or newer.** Node.js 20 no longer gets security updates; `dev`, `start` and `build` show a warning on an older version, but still run.

## Editor internals

For the programmer who changes the editor (you don't need any of this to write components).

```
editor/
  index.html, editor.css     the window: the top bar, the palette, the canvas, the "Settings" panel
  editor.js                  startup, the actions (add, move, delete, placement, layers), shortcuts, changes on disk
  store.js                   the state: the open document, the selection, Undo / Redo, autosave, events
  tree.js                    operations on the tree of blocks, no DOM: locate, moveTo, insertTo, positions, slotInfo
  grid.js                    the Free canvas math, no DOM: placeArriving, resize, changeLayer, layerMoves
  gaps.js                    the geometry of the gaps between blocks, no DOM: gapLine, pickGap
  canvas.html, canvas.js     the canvas: an iframe with the page displayed by core/render.js, plus the tools (outlines, toolbar, handles, "+")
  canvas-host.js             the link between the editor and the canvas: coordinates (the canvas can be scaled down) and the tools' scale
  dnd.js                     dragging, from the palette, the page or Structure, with a mouse or a finger
  registry.js                the components loaded in the editor (metadata, the palette, search)
  i18n.js                    the editor's languages: t(), tn(), the Romanian dictionary, the blocks' i18n.ro
  palette.js, picker.js, preview.js, structure.js, props.js, fields.js, topbar.js, dialogs.js   the panels
  ui.js, ui-icons.js, block-icons.js, util.js, format.js, api.js                              tools
```

**The path of a change.** Every change goes through `commit(mutator)` in `store.js`: the document (the JSON of the page or the zone) is copied, changed and put in the history; then comes the `doc` event and the autosave (`PUT /_api/...`). `editor.js` listens to `doc` and, after a short pause, sends the canvas a JSON text: `{ page, zones, site, comps: { id: url }, broken: { id: message }, path, emptyTitle, kind }`. The canvas loads the components from the same addresses, displays the page with `renderParts({ ..., mode: "editor", t })`, starts `js()` and draws the tools. Data passes between the windows only as text.

**The canvas contract** (`window.blocksCanvas`, inside the iframe): `connect(hooks)`, `render(json)`, `scale(s)`, `select(id)`, `hover(id)`, `dragStart(id, x, y)`, `dropAt(x, y)`, `clearDrop()`, `dragEnd(keep)`, `scrollToBlock(id)`, `scrollBy(dy)`, `suppressClick()`, `flash(id)`, `isStacked(id)`. Back, through `hooks`: `select`, `zone`, `action`, `insert`, `pointerDown`, `keydown`, `hover`, `dblclick`, `rendered`, `placement`. When it's ready, the canvas fires the `blocks-ready` event on its iframe.

**A drop target** (from the canvas or from Structure): `{ slot, index, label, free, at, ghost }`. `slot` is `"root"` or `"blockId:area"`, `index` is the place in the area's list, and `free` says the area is a canvas (then `at` is `{ x, y }`, or `null` for "below the last block"). `ghost` is `false` when the block moves on its own canvas.

**A new kind of area.** For a normal area or a canvas, there's nothing to do in the editor: the component declares `slots` and calls `ctx.slot(name)` or `ctx.slot(name, { free: true })`, and `tree.js` (`slotInfo`) finds out by itself which areas are displayed, by calling `html()` with a `ctx` that only takes notes. The gaps, Structure, the keyboard and drag & drop just work. A kind of area with a different geometry (e.g. the rows of a table in an app block) needs four things, in this order: its rendering in `core/render.js` (like `renderGrid`), a marker in the editor only (like `data-grid`), its places in `tree.js` (`positions`) and its geometry in the canvas (like `gaps()` or `targetOnGrid`), with the math, free of DOM, in a module tested in Node (like `gaps.js` and `grid.js`).

## Rules that keep it simple

- A component doesn't import another component. Components talk through `api.emit` / `api.on`, or through areas. The one exception is an **alias** (`alias: "form"`): a file that reuses a component with other default values (`contact-form.js` → `form.js`), so older pages keep working.
- Server logic lives in `<id>.server.js`, never in `<id>.js`.
- Accounts and passwords are handled only by `server/auth.js`.
- Text for visitors lives in the settings, not in the code, so it can be changed from the editor. The few words a block writes by itself go in its `WORDS = { en, ro }` table.
