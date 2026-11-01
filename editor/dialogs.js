// The dialogs: a new page and the site settings.

import { DEFAULT_THEME } from "../core/render.js";
import { api } from "./api.js";
import * as registry from "./registry.js";
import { state } from "./store.js";
import { h, SLUG, slugify } from "./util.js";
import { createDialog, icon, toast } from "./ui.js";
import { sortedPages } from "./topbar.js";
import { t } from "./i18n.js";

// ---- A new page ----

export function openNewPageDialog({ onCreated }) {
  let slugTouched = false;
  const title = h("input", { type: "text", class: "input", id: "np-title", placeholder: t("For example, About us"), autocomplete: "off" });
  const slug = h("input", {
    type: "text",
    class: "input address__input",
    id: "np-slug",
    placeholder: t("about-us"),
    autocomplete: "off",
    spellcheck: "false",
  });
  const error = h("p", { class: "field__error", role: "alert" });
  const createBtn = h("button", { type: "button", class: "btn btn--primary" }, t("Create page"));

  const taken = (s) => state.pages.some((p) => p.slug === s);

  function validate(showEmpty = false) {
    const tt = title.value.trim();
    const s = slug.value.trim();
    let msg = "";
    if (!tt && showEmpty) msg = t("Write a title for the page.");
    else if (!s) msg = showEmpty || tt ? t("Write the page's address.") : "";
    else if (!SLUG.test(s)) msg = t("The address can only have lowercase letters without accents, digits and hyphens, for example about-us.");
    else if (s === "index" || taken(s)) msg = t("There's already a page with the address {address}.", { address: `/${s === "index" ? "" : s}` });
    error.textContent = msg;
    slug.classList.toggle("input--invalid", Boolean(msg) && Boolean(s));
    return !msg && Boolean(tt) && Boolean(s);
  }

  title.addEventListener("input", () => {
    if (!slugTouched) slug.value = slugify(title.value);
    validate();
  });
  slug.addEventListener("input", () => {
    slugTouched = slug.value.trim() !== "";
    validate();
  });
  slug.addEventListener("change", () => {
    // We tidy up what was typed by hand (capitals, spaces, accents).
    const clean = slugify(slug.value);
    if (clean !== slug.value) slug.value = clean;
    validate();
  });

  const form = h(
    "form",
    { class: "dialog-form", novalidate: true },
    h("label", { class: "field" }, h("span", { class: "field__label" }, t("Title")), title),
    h(
      "label",
      { class: "field" },
      h("span", { class: "field__label" }, t("Address")),
      h("div", { class: "address" }, h("span", { class: "address__prefix" }, "/"), slug), // the address on the site, not the editor's
      h("span", { class: "field__help" }, t("It fills itself in from the title. You can change it.")),
    ),
    error,
  );

  const d = createDialog({
    title: t("New page"),
    subtitle: t("The page starts empty; you add blocks by dragging them from the left or with +."),
    body: form,
    footer: [h("button", { type: "button", class: "btn", onclick: () => d.close() }, t("Cancel")), createBtn],
    className: "dialog--new-page",
  });
  // The button is in the dialog's footer, outside the form; Enter submits too.
  createBtn.addEventListener("click", () => form.requestSubmit());
  for (const input of [title, slug]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    slug.value = slugify(slug.value) || slug.value.trim();
    if (!validate(true)) return;
    const page = { title: title.value.trim(), description: "", access: "public", blocks: [] };
    createBtn.disabled = true;
    createBtn.textContent = t("Creating…");
    try {
      // We check once more on the server: maybe someone created it in the meantime.
      const pages = await api.pages();
      if (pages.some((p) => p.slug === slug.value)) {
        error.textContent = t("There's already a page with the address {address}.", { address: `/${slug.value}` });
        return;
      }
      await api.savePage(slug.value, page);
      d.close();
      onCreated(slug.value, page);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = t("Create page");
    }
  });

  title.focus();
}

// ---- The site settings ----

// The fonts in "Site settings". The first is the one every site starts with (DEFAULT_THEME.font, rounded).
export const FONTS = [
  { id: "rounded", label: t("Rounded (friendly, the default)"), value: DEFAULT_THEME.font },
  {
    id: "system",
    label: t("System (modern, simple)"),
    value: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  { id: "serif", label: t("Serif (classic, bookish)"), value: "Georgia, Cambria, 'Times New Roman', Times, serif" },
  {
    id: "monospace",
    label: t("Monospace (technical)"),
    value: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
  },
];

// The site's language (for its visitors), each written in its own language.
const SITE_LANGS = [
  ["en", "English"],
  ["ro", "Română"],
  ["hu", "Magyar"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["it", "Italiano"],
  ["es", "Español"],
];

const COLORS = [
  ["primary", t("Main color"), t("Buttons, links, accents")],
  ["text", t("Text"), t("Titles and paragraphs")],
  ["background", t("Background"), t("The page's background")],
  ["surface", t("Light background"), t("Sections set to “Light background”, cards and the footer")],
];

const HEX = /^#[0-9a-f]{6}$/i;

export function openSiteSettingsDialog({ onPreview, onSaved, onClose }) {
  const original = structuredClone(state.site || {});
  const theme = { ...DEFAULT_THEME, ...(original.theme || {}) };
  let finished = false;

  const name = h("input", { type: "text", class: "input", value: original.name || "", autocomplete: "off" });

  const lang = h(
    "select",
    { class: "input" },
    SITE_LANGS.map(([v, l]) => h("option", { value: v }, l)),
    SITE_LANGS.some(([v]) => v === original.lang) || !original.lang ? null : h("option", { value: original.lang }, original.lang),
  );
  lang.value = original.lang || "en";

  const pages = sortedPages(state.pages);
  // The pages with the "Log in" block are marked; choosing a page without it shows a warning
  // (otherwise visitors to members-only pages would land on a page where they can't log in).
  const loginName = registry.has("login") ? registry.meta("login").name : t("Log in");
  const hasLogin = (path) => pages.find((p) => p.path === path)?.types?.includes("login") === true;
  const login = h(
    "select",
    { class: "input" },
    pages.map((p) =>
      h("option", { value: p.path }, `${p.title || p.slug} — ${p.path}${hasLogin(p.path) ? ` · ${t("has “{name}”", { name: loginName })}` : ""}`),
    ),
    original.loginPage && !pages.some((p) => p.path === original.loginPage)
      ? h("option", { value: original.loginPage }, t("{path} (doesn't exist yet)", { path: original.loginPage }))
      : null,
  );
  login.value = original.loginPage || "/login";
  if (!login.value && pages.length) login.value = pages[0].path;
  const noLogin = h(
    "p",
    { class: "notice notice--warning settings__notice" },
    icon("alert", 16),
    h(
      "span",
      null,
      t("The chosen page doesn't have the “{name}” block: people sent here would have nowhere to log in. Add the block to it or choose another page.", { name: loginName }),
    ),
  );
  const checkLogin = () => (noLogin.hidden = hasLogin(login.value));
  login.addEventListener("change", checkLogin);
  checkLogin();

  const saveBtn = h("button", { type: "button", class: "btn btn--primary" }, t("Save"));
  const colors = {};
  // A wrong color code isn't quietly saved as the old color: we say what's wrong, and "Save" waits
  // until it's fixed (or picked from the palette).
  const invalid = new Set();
  const mark = (text, error, ok) => {
    text.classList.toggle("input--invalid", !ok);
    text.setAttribute("aria-invalid", String(!ok));
    error.hidden = ok;
    if (ok) invalid.delete(text);
    else invalid.add(text);
    saveBtn.disabled = invalid.size > 0;
  };
  const colorRows = COLORS.map(([key, label, hint]) => {
    const value = HEX.test(theme[key]) ? theme[key].toLowerCase() : "#000000";
    const picker = h("input", { type: "color", class: "color__swatch", value, "aria-label": label });
    const text = h("input", { type: "text", class: "input color__hex", value, maxlength: "7", spellcheck: "false", "aria-label": t("{label}, code", { label }) });
    const error = h("p", { class: "field__error", hidden: true }, t("Write the color as #rrggbb, for example #e8562a."));
    picker.addEventListener("input", () => {
      text.value = picker.value;
      mark(text, error, true);
      preview();
    });
    text.addEventListener("input", () => {
      let v = text.value.trim();
      if (v && !v.startsWith("#")) v = `#${v}`;
      const ok = HEX.test(v);
      mark(text, error, ok);
      if (ok) {
        picker.value = v.toLowerCase();
        preview();
      }
    });
    colors[key] = picker;
    return h(
      "div",
      { class: "color-row" },
      h("div", { class: "color-row__text" }, h("span", { class: "field__label" }, label), h("span", { class: "field__help" }, hint)),
      h("div", { class: "color" }, picker, text),
      error,
    );
  });

  const known = FONTS.find((f) => f.value === theme.font);
  const font = h(
    "select",
    { class: "input" },
    FONTS.map((f) => h("option", { value: f.id }, f.label)),
    known ? null : h("option", { value: "custom" }, t("Custom (from site.json)")),
  );
  font.value = known ? known.id : "custom";
  const fontValue = () => FONTS.find((f) => f.id === font.value)?.value || theme.font;

  const radiusStart = Math.min(28, Math.max(0, parseInt(theme.radius, 10) || 0));
  const radius = h("input", { type: "range", class: "slider", min: "0", max: "28", step: "1", value: String(radiusStart), "aria-label": t("Rounded corners") });
  const radiusOut = h("output", { class: "slider__value" }, `${radiusStart}px`);
  const radiusDemo = h("span", { class: "radius-demo", style: { borderRadius: `${radiusStart}px` } });

  function draft() {
    const next = structuredClone(original);
    next.name = name.value.trim() || original.name || t("My site");
    next.lang = lang.value;
    next.loginPage = login.value;
    next.theme = {
      ...(original.theme || {}),
      primary: colors.primary.value,
      text: colors.text.value,
      background: colors.background.value,
      surface: colors.surface.value,
      font: fontValue(),
      radius: `${radius.value}px`,
    };
    return next;
  }

  function preview() {
    radiusOut.textContent = `${radius.value}px`;
    radiusDemo.style.borderRadius = `${radius.value}px`;
    onPreview(draft());
  }

  for (const el of [name, lang, login, font]) el.addEventListener("input", preview);
  radius.addEventListener("input", preview);

  const cancel = () => {
    if (finished) return;
    finished = true;
    d.close();
    onClose(false);
  };

  const body = h(
    "div",
    { class: "settings" },
    h(
      "section",
      { class: "settings__group" },
      h("h3", { class: "settings__title" }, t("General")),
      h("label", { class: "field" }, h("span", { class: "field__label" }, t("Site name")), name),
      // One under the other: the login page's options are long ("Log in — /login · has “Log in”").
      h(
        "label",
        { class: "field" },
        h("span", { class: "field__label" }, t("Site language")),
        lang,
        h(
          "span",
          { class: "field__help" },
          t("Blocks writes its own words for visitors (form messages, logging in, dates) in English or Romanian; with any other language, they stay in English."),
        ),
      ),
      h(
        "label",
        { class: "field" },
        h("span", { class: "field__label" }, t("Login page")),
        login,
        h("span", { class: "field__help" }, t("People who open a members-only page without being logged in are sent here.")),
      ),
      noLogin,
    ),
    h("section", { class: "settings__group" }, h("h3", { class: "settings__title" }, t("Colors")), colorRows),
    h(
      "section",
      { class: "settings__group" },
      h("h3", { class: "settings__title" }, t("Text & shapes")),
      h("label", { class: "field" }, h("span", { class: "field__label" }, t("Font")), font),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field__label" }, t("Rounded corners")),
        h("div", { class: "slider-row" }, radiusDemo, radius, radiusOut),
      ),
    ),
    h("p", { class: "settings__note" }, icon("info", 14), t("You see the changes on the page right away. They apply to the whole site.")),
  );

  const d = createDialog({
    title: t("Site settings"),
    body,
    footer: [h("button", { type: "button", class: "btn", onclick: cancel }, t("Cancel")), saveBtn],
    className: "dialog--settings",
    onCancel: cancel,
  });

  saveBtn.addEventListener("click", async () => {
    if (invalid.size) return [...invalid][0].focus();
    const next = draft();
    saveBtn.disabled = true;
    saveBtn.textContent = t("Saving…");
    try {
      await api.saveSite(next);
      finished = true;
      d.close();
      onSaved(next, original);
    } catch (err) {
      toast(t("Couldn't save the settings: {error}", { error: err.message }), { type: "error" });
      saveBtn.disabled = false;
      saveBtn.textContent = t("Save");
    }
  });

  name.focus();
  name.select();
}
