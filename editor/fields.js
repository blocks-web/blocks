// The fields in the settings panel: one control for each `type`.
//
// createField(field, value, ctx) → element
//   field                      the field's schema, already in the editor's language (i18n.js → blockFields)
//   ctx.key                    the prop's key (the default label)
//   ctx.path                   a unique text, to keep the focus after the panel is rebuilt
//   ctx.change(value, { live }) live = while you type (it adds up to a single Undo step)
//   ctx.done()                 you left the field: the next change is a new step
//   ctx.upload(file)           → Promise<{ url }>
//   ctx.list                   only for "list": add, remove, move, isOpen, setOpen, child

import { url as safeUrl } from "../core/html.js";
import { h } from "./util.js";
import { icon, toast } from "./ui.js";
import { applyMark, stripMarks } from "./format.js";
import { t } from "./i18n.js";

let seq = 0;
const str = (v) => (v == null ? "" : String(v));

// The fixed note under "html" fields (docs/ARCHITECTURE.md).
const HTML_NOTE = t("HTML code. It goes into the page exactly as written, so only paste code you trust.");
const FORMAT_HINT = t("**bold**, *italic*, [text](address)");

export function createField(field, value, ctx) {
  const type = field?.type || "text";
  const id = `field-${++seq}`;
  const label = String(field?.label || ctx.key || "");
  const hint = field?.help ? h("p", { class: "field__help", id: `${id}-help` }, String(field.help)) : null;
  let control;
  let before = null; // the formatting bar, above the field
  let after = hint; // what sits under the field
  switch (type) {
    case "text":
      control = textInput(id, value, ctx);
      if (field?.format === true) {
        before = formatBar(control, ctx);
        after = [hint, h("p", { class: "field__hint" }, FORMAT_HINT)];
      }
      break;
    case "longtext":
      control = textArea(id, value, ctx);
      // Any long text takes the marks (paragraphs() applies them), unless it's turned off with format: false.
      if (field?.format !== false) {
        before = formatBar(control, ctx);
        after = [hint, h("p", { class: "field__hint" }, FORMAT_HINT)];
      }
      break;
    case "html":
      control = textArea(id, value, ctx, { code: true });
      after = [hint, h("p", { class: "field__help" }, HTML_NOTE)];
      break;
    case "date":
      control = dateInput(id, value, ctx);
      break;
    case "number":
      control = numberInput(id, field, value, ctx);
      break;
    case "color":
      control = colorInput(id, value, ctx);
      break;
    case "choice":
      control = selectInput(id, field, value, ctx);
      break;
    case "checkbox":
      return h("div", { class: "field field--checkbox" }, toggle(id, label, value, ctx), hint);
    case "image":
      control = imageInput(id, value, ctx);
      break;
    case "link":
      control = linkInput(id, value, ctx);
      break;
    case "list":
      return h(
        "div",
        { class: "field field--list" },
        h("span", { class: "field__label" }, label),
        hint,
        listField(field, value, ctx),
      );
    default:
      control = textInput(id, value, ctx);
      return h(
        "div",
        { class: "field" },
        h("label", { class: "field__label", for: id }, label),
        control,
        h("p", { class: "field__help" }, t("Unknown type (“{type}”), edited as text.", { type })),
      );
  }
  if (hint) control.setAttribute?.("aria-describedby", `${id}-help`);
  return h("div", { class: `field field--${type}` }, h("label", { class: "field__label", for: id }, label), before, control, after);
}

function textInput(id, value, ctx) {
  const input = h("input", { type: "text", class: "input", id, value: str(value), "data-path": ctx.path });
  input.addEventListener("input", () => ctx.change(input.value, { live: true }));
  input.addEventListener("change", () => ctx.done());
  return input;
}

// A text area that grows with the text. `code`: monospace, for pasted HTML.
function textArea(id, value, ctx, { code = false } = {}) {
  const area = h("textarea", {
    class: `input input--long ${code ? "input--code" : ""}`,
    id,
    rows: code ? "6" : "3",
    value: str(value),
    spellcheck: code ? "false" : null,
    "data-path": ctx.path,
  });
  const grow = () => {
    if (!area.isConnected || area.offsetParent === null) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight + 2, 480)}px`;
  };
  area._grow = grow;
  area.addEventListener("input", () => {
    grow();
    ctx.change(area.value, { live: true });
  });
  area.addEventListener("change", () => ctx.done());
  requestAnimationFrame(grow);
  return area;
}

// Bold, Italic, Link: they put the marks around the selection in the field.
function formatBar(control, ctx) {
  const apply = (kind) => {
    const start = control.selectionStart ?? control.value.length;
    const end = control.selectionEnd ?? start;
    const r = applyMark(control.value, start, end, kind);
    control.value = r.text;
    control.focus();
    control.setSelectionRange(r.start, r.end);
    control._grow?.();
    ctx.change(control.value, { live: true });
    ctx.done();
  };
  const btn = (kind, name, title) =>
    h(
      "button",
      {
        type: "button",
        class: "format-bar__btn",
        title,
        "aria-label": title,
        tabindex: "-1",
        // We don't take the focus away from the field (the selection would be lost).
        onpointerdown: (e) => e.preventDefault(),
        onclick: () => apply(kind),
      },
      icon(name, 16),
    );
  return h(
    "div",
    { class: "format-bar", role: "toolbar", "aria-label": t("Formatting") },
    btn("b", "bold", t("Bold")),
    btn("i", "italic", t("Italic")),
    btn("link", "link", t("Link")),
  );
}

// "date": YYYY-MM-DD or empty; with a button that empties it.
function dateInput(id, value, ctx) {
  const v = /^\d{4}-\d{2}-\d{2}$/.test(str(value)) ? str(value) : "";
  const input = h("input", { type: "date", class: "input input--date", id, value: v, "data-path": ctx.path });
  const clear = h(
    "button",
    { type: "button", class: "btn btn--small btn--icon", title: t("Clear the date"), "aria-label": t("Clear the date"), hidden: !v },
    icon("x", 14),
  );
  input.addEventListener("input", () => {
    clear.hidden = !input.value;
    ctx.change(input.value, { live: true });
  });
  input.addEventListener("change", () => ctx.done());
  clear.addEventListener("click", () => {
    input.value = "";
    clear.hidden = true;
    ctx.change("", { live: false });
  });
  return h("div", { class: "date-field" }, input, clear);
}

function numberInput(id, field, value, ctx) {
  const min = Number.isFinite(field?.min) ? field.min : null;
  const max = Number.isFinite(field?.max) ? field.max : null;
  const start = Number.isFinite(Number(value)) && value !== "" ? Number(value) : (min ?? 0);
  const input = h("input", {
    type: "number",
    class: "input input--number",
    id,
    value: String(start),
    min: min ?? undefined,
    max: max ?? undefined,
    step: Number.isFinite(field?.step) ? field.step : "any",
    inputmode: "decimal",
    "data-path": ctx.path,
  });
  const inRange = (n) => (min === null || n >= min) && (max === null || n <= max);
  const clamp = (n) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  let last = start;
  input.addEventListener("input", () => {
    if (input.value.trim() === "") return;
    const n = Number(input.value);
    if (!Number.isFinite(n) || !inRange(n)) return;
    last = n;
    ctx.change(n, { live: true });
  });
  input.addEventListener("change", () => {
    let n = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(n)) n = last;
    n = clamp(n);
    input.value = String(n);
    last = n;
    ctx.change(n, { live: true });
    ctx.done();
  });
  if (min === null && max === null) return input;
  const range =
    min !== null && max !== null ? t("between {min} and {max}", { min, max }) : min !== null ? t("at least {min}", { min }) : t("at most {max}", { max });
  return h("div", { class: "number" }, input, h("span", { class: "number__range" }, range));
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

function toHex6(value) {
  const s = String(value ?? "").trim();
  if (HEX6.test(s)) return s.toLowerCase();
  if (HEX3.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join("")}`.toLowerCase();
  return null;
}

function colorInput(id, value, ctx) {
  let last = str(value);
  const picker = h("input", {
    type: "color",
    class: "color__swatch",
    value: toHex6(last) || "#000000",
    "aria-label": t("Pick the color"),
  });
  const text = h("input", {
    type: "text",
    class: "input color__hex",
    id,
    value: last,
    maxlength: "7",
    spellcheck: "false",
    autocomplete: "off",
    placeholder: "#rrggbb",
    "data-path": ctx.path,
  });
  picker.addEventListener("input", () => {
    text.value = picker.value;
    text.classList.remove("input--invalid");
    last = picker.value;
    ctx.change(picker.value, { live: true });
  });
  picker.addEventListener("change", () => ctx.done());
  text.addEventListener("input", () => {
    let v = text.value.trim();
    if (v && !v.startsWith("#")) v = `#${v}`;
    if (v === "") {
      text.classList.remove("input--invalid");
      last = "";
      ctx.change("", { live: true });
      return;
    }
    const hex = toHex6(v);
    text.classList.toggle("input--invalid", !hex);
    if (!hex) return;
    picker.value = hex;
    last = hex;
    ctx.change(hex, { live: true });
  });
  text.addEventListener("change", () => {
    text.value = last;
    text.classList.remove("input--invalid");
    ctx.done();
  });
  return h("div", { class: "color" }, picker, text);
}

function normalizeOptions(options) {
  return (Array.isArray(options) ? options : []).map((o) =>
    o && typeof o === "object"
      ? { value: o.value ?? "", label: String(o.label ?? o.value ?? "") }
      : { value: o, label: String(o) },
  );
}

function selectInput(id, field, value, ctx) {
  const opts = normalizeOptions(field?.options);
  let index = opts.findIndex((o) => String(o.value) === String(value ?? ""));
  if (index === -1) {
    // A value written by hand that isn't among the options: we show it, we don't lose it.
    opts.push({ value: value ?? "", label: value === "" || value == null ? t("— choose —") : t("{value} (unknown)", { value }) });
    index = opts.length - 1;
  }
  const select = h(
    "select",
    { class: "input input--choice", id, "data-path": ctx.path },
    opts.map((o, i) => h("option", { value: String(i) }, o.label)),
  );
  select.value = String(index);
  select.addEventListener("change", () => {
    const o = opts[Number(select.value)];
    if (o) ctx.change(o.value, { live: false });
  });
  return select;
}

function toggle(id, label, value, ctx) {
  const input = h("input", {
    type: "checkbox",
    class: "switch__input",
    id,
    role: "switch",
    checked: Boolean(value),
    "data-path": ctx.path,
  });
  input.addEventListener("change", () => ctx.change(input.checked, { live: false }));
  return h(
    "label",
    { class: "switch", for: id },
    input,
    h("span", { class: "switch__track", "aria-hidden": "true" }),
    h("span", { class: "switch__text" }, label),
  );
}

function imageInput(id, value, ctx) {
  const input = h("input", {
    type: "text",
    class: "input",
    id,
    value: str(value),
    placeholder: t("/assets/... or https://..."),
    spellcheck: "false",
    autocomplete: "off",
    "data-path": ctx.path,
  });
  const preview = h("div", { class: "image__preview" });
  const file = h("input", { type: "file", accept: "image/*", hidden: true, tabindex: "-1" });
  const upLabel = h("span", null, t("Upload an image"));
  const upBtn = h("button", { type: "button", class: "btn btn--small" }, icon("upload", 14), upLabel);
  const clearBtn = h(
    "button",
    { type: "button", class: "btn btn--small btn--icon", title: t("Remove the image"), "aria-label": t("Remove the image") },
    icon("x", 14),
  );
  const wrap = h("div", { class: "image" }, preview, input, h("div", { class: "image__buttons" }, upBtn, clearBtn), file);

  function refresh() {
    const v = input.value.trim();
    clearBtn.hidden = !v;
    preview.className = "image__preview";
    if (v && safeUrl(v) !== "#") {
      const img = h("img", { src: v, alt: "" });
      img.addEventListener("error", () => {
        preview.classList.add("image__preview--error");
        preview.replaceChildren(icon("alert", 18), h("span", null, t("The image doesn't load")));
      });
      preview.replaceChildren(img);
    } else {
      preview.classList.add("image__preview--empty");
      preview.replaceChildren(icon("image", 20), h("span", null, t("No image yet. Upload one or drag a file here.")));
    }
  }

  async function upload(f) {
    if (!f.type.startsWith("image/")) {
      toast(t("Choose an image (png, jpg, gif, webp or avif)."), { type: "error" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast(t("The image is too big: 10 MB at most."), { type: "error" });
      return;
    }
    upBtn.disabled = true;
    upLabel.textContent = t("Uploading…");
    wrap.classList.add("image--uploading");
    try {
      const res = await ctx.upload(f);
      if (!res?.url) throw new Error(t("the server didn't send the image's address."));
      input.value = res.url;
      refresh();
      ctx.change(res.url, { live: false });
      toast(t("The image is uploaded."), { type: "success" });
    } catch (err) {
      toast(t("Couldn't upload the image: {error}", { error: err.message }), { type: "error" });
    } finally {
      upBtn.disabled = false;
      upLabel.textContent = t("Upload an image");
      wrap.classList.remove("image--uploading");
    }
  }

  input.addEventListener("input", () => {
    refresh();
    ctx.change(input.value, { live: true });
  });
  input.addEventListener("change", () => ctx.done());
  upBtn.addEventListener("click", () => file.click());
  clearBtn.addEventListener("click", () => {
    input.value = "";
    refresh();
    ctx.change("", { live: false });
  });
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    file.value = "";
    if (f) upload(f);
  });
  // A file dragged from Finder / Explorer straight over the field.
  wrap.addEventListener("dragover", (e) => {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    wrap.classList.add("image--over");
  });
  wrap.addEventListener("dragleave", () => wrap.classList.remove("image--over"));
  wrap.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    wrap.classList.remove("image--over");
    if (!f) return;
    e.preventDefault();
    upload(f);
  });
  refresh();
  return wrap;
}

function linkInput(id, value, ctx) {
  const input = h("input", {
    type: "text",
    class: "input",
    id,
    value: str(value),
    list: "page-paths",
    placeholder: t("/page or https://..."),
    spellcheck: "false",
    autocomplete: "off",
    "data-path": ctx.path,
  });
  input.addEventListener("input", () => ctx.change(input.value, { live: true }));
  input.addEventListener("change", () => ctx.done());
  return input;
}

// The title of a list item's card: first a field that really is a title (Events: the title, not the
// time), then a choice (Social links: "Facebook", not the address), then the first text filled in;
// otherwise "Item N".
const TITLE_KEYS = ["title", "name", "label", "question", "text"];

export function itemTitle(item, fields, i) {
  const text = (key) => {
    const field = fields[key];
    if (field?.type !== "text" && field?.type !== "longtext") return "";
    const v = typeof item?.[key] === "string" ? item[key].trim() : "";
    return v ? stripMarks(v.split("\n")[0]).slice(0, 60) : "";
  };
  for (const key of TITLE_KEYS) if (Object.hasOwn(fields, key) && text(key)) return text(key);
  for (const [key, field] of Object.entries(fields)) {
    if (field?.type !== "choice" || item?.[key] === undefined) continue;
    const chosen = (Array.isArray(field.options) ? field.options : []).find(
      (o) => (o && typeof o === "object" ? String(o.value) : String(o)) === String(item[key]),
    );
    if (chosen !== undefined) return String(chosen && typeof chosen === "object" ? (chosen.label ?? chosen.value) : chosen);
  }
  for (const key of Object.keys(fields)) if (text(key)) return text(key);
  return t("Item {n}", { n: i + 1 });
}

function iconButton(name, title, onClick, disabled = false) {
  return h(
    "button",
    { type: "button", class: "icon-btn", title, "aria-label": title, disabled, onclick: onClick },
    icon(name, 14),
  );
}

function listField(field, value, ctx) {
  const items = Array.isArray(value) ? value : [];
  const fields = field?.fields && typeof field.fields === "object" ? field.fields : {};
  const wrap = h("div", { class: "list" });

  items.forEach((item, i) => {
    const current = { ...(item && typeof item === "object" ? item : {}) };
    const open = ctx.list.isOpen(i);
    const titleEl = h("span", { class: "list__title" }, itemTitle(current, fields, i));
    const opener = h(
      "button",
      { type: "button", class: "list__toggle", "aria-expanded": String(open) },
      icon("chevron-right", 12),
      titleEl,
    );
    const body = h("div", { class: "list__body", hidden: !open });
    const card = h(
      "div",
      { class: `list__card ${open ? "list__card--open" : ""}`, "data-list": ctx.path, "data-index": String(i) },
      h(
        "div",
        { class: "list__head" },
        opener,
        h(
          "div",
          { class: "list__tools" },
          iconButton("up", t("Move up"), () => ctx.list.move(i, -1), i === 0),
          iconButton("down", t("Move down"), () => ctx.list.move(i, 1), i === items.length - 1),
          iconButton("x", t("Delete the item"), () => ctx.list.remove(i)),
        ),
      ),
      body,
    );
    const fill = () => {
      for (const [key, sub] of Object.entries(fields)) {
        if (!sub || sub.type === "list") continue; // no list inside a list
        const child = ctx.list.child(i, key, (v) => {
          current[key] = v;
          titleEl.textContent = itemTitle(current, fields, i);
        });
        body.append(createField(sub, current[key], child));
      }
    };
    if (open) fill();
    opener.addEventListener("click", () => {
      const nowOpen = body.hidden;
      body.hidden = !nowOpen;
      opener.setAttribute("aria-expanded", String(nowOpen));
      card.classList.toggle("list__card--open", nowOpen);
      ctx.list.setOpen(i, nowOpen);
      if (nowOpen && !body.childElementCount) fill();
      if (nowOpen) requestAnimationFrame(() => body.querySelectorAll("textarea").forEach((a) => a._grow?.()));
    });
    wrap.append(card);
  });

  if (!items.length) wrap.append(h("p", { class: "list__empty" }, t("No items yet.")));
  wrap.append(
    h(
      "button",
      { type: "button", class: "btn btn--small btn--wide list__add", onclick: () => ctx.list.add() },
      icon("plus", 14),
      t("Add an item"),
    ),
  );
  return wrap;
}
