// The top bar: the open document, new page, Undo / Redo, the screen width, the editor's language,
// the site settings, "View page" and the save status.

import { canRedo, canUndo, fileOf, on, state } from "./store.js";
import { h, MOD, SHIFT } from "./util.js";
import { icon, openMenu } from "./ui.js";
import { getLang, t } from "./i18n.js";

// The save pill: a green dot for "Saved", coral while saving, a warm red on an error.
const STATUS = {
  saved: { text: t("Saved"), icon: null },
  saving: { text: t("Saving…"), icon: null },
  unsaved: { text: t("Unsaved changes"), icon: null },
  error: { text: t("Couldn't save — trying again"), icon: "alert" },
};

export function sortedPages(pages) {
  return [...pages].sort((a, b) => {
    const rank = (p) => (p.slug === "index" ? 0 : p.slug === "404" ? 2 : 1);
    return rank(a) - rank(b) || String(a.title).localeCompare(String(b.title), getLang());
  });
}

export function initTopbar({ els, actions }) {
  const { docBtn, newPage, undoBtn, redoBtn, devices, langs, settings, view, status } = els;

  undoBtn.title = t("Undo the last change ({keys})", { keys: `${MOD}Z` });
  redoBtn.title = t("Redo ({keys})", { keys: `${MOD}${SHIFT}Z` });

  function renderDoc() {
    let ic = "page";
    let title = "";
    let sub = "";
    if (state.kind === "page") {
      const page = state.pages.find((p) => p.slug === state.name);
      title = state.doc?.title || page?.title || state.name || "";
      sub = state.name === "index" ? "/" : `/${state.name}`;
    } else if (state.kind === "zone") {
      ic = state.name;
      title = state.name === "header" ? t("Shared header") : t("Shared footer");
      sub = t("on every page");
    }
    docBtn.replaceChildren(
      icon(ic, 16),
      h("span", { class: "doc-button__title" }, title || t("Loading…")),
      sub && h("span", { class: `doc-button__path ${state.kind === "zone" ? "doc-button__path--text" : ""}` }, sub),
      icon("chevron-down", 14),
    );
    docBtn.title = state.kind ? t("File: {file}", { file: `pages/${fileOf()}` }) : "";
  }

  docBtn.addEventListener("click", () => {
    if (docBtn.getAttribute("aria-expanded") === "true") return;
    const pages = sortedPages(state.pages);
    openMenu(
      docBtn,
      [
        { group: t("Pages") },
        ...pages.map((p) => ({
          label: p.title || p.slug,
          sub: p.path,
          mono: true,
          icon: "page",
          checked: state.kind === "page" && state.name === p.slug,
          badge: p.access === "members" ? t("members") : null,
          badgeTitle: t("Only for logged-in members"),
          onSelect: () => actions.openDoc("page", p.slug),
        })),
        { group: t("Shared by every page") },
        {
          label: t("Header"),
          sub: t("above every page"),
          icon: "header",
          checked: state.kind === "zone" && state.name === "header",
          onSelect: () => actions.openDoc("zone", "header"),
        },
        {
          label: t("Footer"),
          sub: t("below every page"),
          icon: "footer",
          checked: state.kind === "zone" && state.name === "footer",
          onSelect: () => actions.openDoc("zone", "footer"),
        },
        { sep: true },
        { label: t("New page…"), icon: "plus", onSelect: () => actions.newPage() },
      ],
      { className: "menu--docs", width: 300 },
    );
  });

  function renderHistory() {
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
  }

  function renderStatus() {
    const s = STATUS[state.status] || STATUS.saved;
    status.className = `status status--${state.status}`;
    status.replaceChildren(
      s.icon ? icon(s.icon, 14) : h("span", { class: "status__dot", "aria-hidden": "true" }),
      h("span", { class: "status__text" }, s.text),
    );
    const where = state.kind ? `pages/${fileOf()}` : "";
    status.title =
      state.status === "error"
        ? t("{message} Click to try again now.", { message: state.statusMessage || t("The server isn't answering.") })
        : state.status === "unsaved"
          ? t("It saves by itself in a moment ({keys} to save now).", { keys: `${MOD}S` })
          : where
            ? t("Everything is saved in {file}", { file: where })
            : "";
  }

  function renderDevice(name) {
    for (const b of devices.querySelectorAll("[data-device]")) {
      b.setAttribute("aria-pressed", String(b.dataset.device === name));
    }
  }

  // The editor's language: the chosen one is pressed; the other one saves, then reloads the editor in it.
  for (const b of langs.querySelectorAll("[data-lang]")) {
    b.setAttribute("aria-pressed", String(b.dataset.lang === getLang()));
  }
  langs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (b && b.dataset.lang !== getLang()) actions.setLanguage(b.dataset.lang);
  });

  newPage.addEventListener("click", () => actions.newPage());
  undoBtn.addEventListener("click", () => actions.undo());
  redoBtn.addEventListener("click", () => actions.redo());
  settings.addEventListener("click", () => actions.openSiteSettings());
  view.addEventListener("click", () => actions.viewPage());
  status.addEventListener("click", () => {
    if (state.status === "error" || state.status === "unsaved") actions.saveNow();
  });
  devices.addEventListener("click", (e) => {
    const b = e.target.closest("[data-device]");
    if (b) actions.setDevice(b.dataset.device);
  });

  on("document", renderDoc);
  on("pages", renderDoc);
  on("doc", (e) => {
    if (["props", "page", "history"].includes(e?.source)) renderDoc();
  });
  on("history", renderHistory);
  on("status", renderStatus);
  renderDoc();
  renderHistory();
  renderStatus();

  return { renderDevice };
}
