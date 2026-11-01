// Reused pieces of interface: icons, notifications (toasts), confirmations, menus.

import { h } from "./util.js";
import { svgUi } from "./ui-icons.js";
import { t } from "./i18n.js";

// The interface icons (ui-icons.js), in a <span class="ic">.
export function icon(name, size = 16) {
  const span = document.createElement("span");
  span.className = "ic";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = svgUi(name, size);
  return span;
}

// ---- Notifications ----

const MAX_TOASTS = 4;

// toast("Text", { type: "info" | "success" | "error", action: { label, fn }, timeout })
//   timeout: Infinity → stays until you close it (e.g. a conflict with the file on disk)
export function toast(message, { type = "info", action = null, timeout } = {}) {
  const region = document.getElementById("toasts");
  if (!region) return { close() {} };
  // The same message twice: we refresh it instead of showing it twice.
  for (const old of region.children) {
    if (old._message === message && !old.classList.contains("toast--leaving")) {
      old._restart?.();
      return { close: old._close };
    }
  }
  const ms = timeout ?? (action ? 9000 : type === "error" ? 7000 : 3200);
  let timer = null;
  const sticky = !Number.isFinite(ms);
  const node = h(
    "div",
    { class: `toast toast--${type}${sticky ? " toast--sticky" : ""}`, role: type === "error" ? "alert" : "status" },
    icon(type === "error" ? "alert" : type === "success" ? "check" : "info", 16),
    h("span", { class: "toast__text" }, message),
    action &&
      h(
        "button",
        {
          type: "button",
          class: "toast__action",
          onclick: () => {
            close();
            action.fn();
          },
        },
        action.label,
      ),
    h("button", { type: "button", class: "toast__x", "aria-label": t("Close"), onclick: () => close() }, icon("x", 14)),
  );
  function close() {
    clearTimeout(timer);
    if (node.classList.contains("toast--leaving")) return;
    node.classList.add("toast--leaving");
    setTimeout(() => node.remove(), 180);
  }
  const restart = () => {
    clearTimeout(timer);
    if (!sticky) timer = setTimeout(close, ms);
  };
  node._message = message;
  node._close = close;
  node._restart = restart;
  node.addEventListener("mouseenter", () => clearTimeout(timer));
  node.addEventListener("mouseleave", () => {
    clearTimeout(timer);
    if (!sticky) timer = setTimeout(close, 1800);
  });
  region.append(node);
  // Too many: the ordinary ones leave first; one waiting for an answer (sticky) stays.
  while (region.children.length > MAX_TOASTS) (region.querySelector(".toast:not(.toast--sticky)") || region.firstElementChild).remove();
  restart();
  return { close };
}

// ---- Dialogs ----

let dialogCount = 0;

// A modal <dialog> with a title, content and buttons in the footer.
export function createDialog({ title, subtitle, body, footer, className = "", onCancel }) {
  const titleId = `dialog-title-${++dialogCount}`;
  const dialog = h(
    "dialog",
    { class: `dialog ${className}`, "aria-labelledby": titleId },
    h(
      "div",
      { class: "dialog__head" },
      h("h2", { class: "dialog__title", id: titleId }, title),
      subtitle && h("p", { class: "dialog__sub" }, subtitle),
    ),
    h("div", { class: "dialog__body" }, body),
    footer && h("div", { class: "dialog__footer" }, footer),
  );
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    onCancel ? onCancel() : close();
  });
  // A click on the dark backdrop closes the dialog.
  dialog.addEventListener("pointerdown", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) onCancel ? onCancel() : close();
  });
  // The keys stay in the dialog (Delete doesn't delete the block selected behind it).
  dialog.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") e.preventDefault();
  });
  function close() {
    if (dialog.open) dialog.close();
    dialog.remove();
  }
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

// await confirmDialog({ title, message, ok: t("Delete"), danger: true }) → true / false
// `extra`: elements put under the message (e.g. a checkbox read after the answer).
export function confirmDialog({ title, message, extra = null, ok = t("Continue"), cancel = t("Cancel"), danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      d.close();
      resolve(value);
    };
    const okBtn = h("button", { type: "button", class: `btn ${danger ? "btn--danger" : "btn--primary"}`, onclick: () => finish(true) }, ok);
    const d = createDialog({
      title,
      className: "dialog--small",
      body: [h("p", { class: "dialog__message" }, message), extra],
      footer: [h("button", { type: "button", class: "btn", onclick: () => finish(false) }, cancel), okBtn],
      onCancel: () => finish(false),
    });
    okBtn.focus();
  });
}

// ---- Drop-down menus ----

let openMenuState = null;

export function closeMenu() {
  if (!openMenuState) return;
  const { node, anchor, cleanup } = openMenuState;
  openMenuState = null;
  cleanup();
  node.remove();
  anchor.setAttribute("aria-expanded", "false");
}

export const isMenuOpen = () => openMenuState !== null;

// items: [{ group } | { sep: true } | { label, sub, mono, icon, checked, badge, badgeTitle, onSelect, danger }]
export function openMenu(anchor, items, { className = "", width } = {}) {
  closeMenu();
  const buttons = [];
  const node = h(
    "div",
    { class: `menu ${className}`, role: "menu" },
    items.map((item) => {
      if (item.group) return h("div", { class: "menu__group", role: "presentation" }, item.group);
      if (item.sep) return h("div", { class: "menu__sep", role: "separator" });
      const btn = h(
        "button",
        {
          type: "button",
          role: "menuitem",
          class: `menu__item ${item.checked ? "menu__item--checked" : ""} ${item.danger ? "menu__item--danger" : ""}`,
          onclick: () => {
            closeMenu();
            item.onSelect?.();
          },
        },
        item.icon ? icon(item.icon, 16) : null,
        h("span", { class: "menu__text" }, h("span", { class: "menu__label" }, item.label), item.sub && h("span", { class: `menu__sub ${item.mono ? "menu__sub--path" : ""}` }, item.sub)),
        item.badge ? h("span", { class: "menu__badge", title: item.badgeTitle || "" }, item.badge) : null,
        item.checked ? icon("check", 15) : null,
      );
      buttons.push(btn);
      return btn;
    }),
  );
  document.body.append(node);
  const r = anchor.getBoundingClientRect();
  node.style.minWidth = `${Math.max(width || 0, r.width)}px`;
  const left = Math.min(r.left, window.innerWidth - node.offsetWidth - 8);
  node.style.left = `${Math.max(8, left)}px`;
  node.style.top = `${r.bottom + 6}px`;
  node.style.maxHeight = `${window.innerHeight - r.bottom - 20}px`;
  anchor.setAttribute("aria-expanded", "true");

  const onDown = (e) => {
    if (!node.contains(e.target) && !anchor.contains(e.target)) closeMenu();
  };
  const onKey = (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      anchor.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === "Tab") {
      closeMenu();
    }
  };
  const onResize = () => closeMenu();
  document.addEventListener("pointerdown", onDown, true);
  node.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  openMenuState = {
    node,
    anchor,
    cleanup() {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onResize);
    },
  };
  (buttons.find((b) => b.classList.contains("menu__item--checked")) || buttons[0])?.focus();
  return node;
}
