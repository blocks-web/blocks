import { html, url } from "../core/html.js";

// The site's header. On phones the links fold away under a "☰" button.
// Without JavaScript the links stay visible (they just wrap onto more lines).

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { site: "My site", menu: "Menu", mainMenu: "Main menu" },
  ro: { site: "Site-ul meu", menu: "Meniu", mainMenu: "Meniu principal" },
};

// "/products/" and "/products" are the same page.
const normal = (path) => path.replace(/\/+$/, "") || "/";

function accountHtml(p, user, login) {
  if (user) {
    return html`<div class="navbar__account" data-state="member" data-login="${login}">
      <span class="navbar__greeting">${p.greeting ? `${p.greeting}, ` : ""}<strong>${user.name}</strong></span>
      <button class="navbar__logout" type="button">${p.logoutText}</button>
    </div>`;
  }
  return html`<div class="navbar__account" data-state="visitor" data-login="${login}">
    <a class="navbar__login" href="${login}">${p.loginText}</a>
  </div>`;
}

export default {
  name: "Header",
  category: "Page",
  icon: "navbar",
  description: "The top of your site: a name or logo, links to your pages, a button and the visitor's account.",
  tip: "You edit it just once, in the “Shared header” (click it on any page); 4–5 links fit well, and the rest can go in the footer.",

  props: {
    logoText: { type: "text", label: "Name shown", default: "", help: "Leave it empty to show the site name." },
    logoImage: { type: "image", label: "Logo", default: "", help: "Optional. It shows to the left of the name." },
    links: {
      type: "list",
      label: "Links",
      fields: {
        text: { type: "text", label: "Text", default: "New page" },
        link: { type: "link", label: "Link", default: "/" },
      },
      default: [
        { text: "Home", link: "/" },
        { text: "Contact", link: "/contact" },
      ],
    },
    buttonText: { type: "text", label: "Button text", default: "", help: "Optional. A highlighted button on the right." },
    buttonLink: { type: "link", label: "Button link", default: "/contact" },
    sticky: { type: "checkbox", label: "Stay at the top when scrolling", default: true },
    showAccount: {
      type: "checkbox",
      label: "Show the visitor's account",
      default: false,
      help: "A “Log in” link, or “Hi, Ana” with “Log out”. It only works on a site published with a server.",
    },
    loginText: { type: "text", label: "Text for “Log in”", default: "Log in" },
    greeting: { type: "text", label: "Greeting", default: "Hi", help: "Shows as “Hi, Ana”." },
    logoutText: { type: "text", label: "Text for “Log out”", default: "Log out" },
  },

  i18n: {
    ro: {
      name: "Antet",
      category: "Pagină",
      description: "Partea de sus a site-ului: nume sau logo, linkuri spre pagini, un buton și contul vizitatorului.",
      tip: "Se editează o singură dată, în „Antet comun” (dă clic pe el în orice pagină); 4–5 linkuri încap bine, restul pune-le în subsol.",
      props: {
        logoText: { label: "Nume afișat", help: "Lasă gol ca să apară numele site-ului." },
        logoImage: { label: "Logo", help: "Opțional. Apare în stânga numelui." },
        links: {
          label: "Linkuri",
          fields: {
            text: { label: "Text" },
            link: { label: "Link" },
          },
        },
        buttonText: { label: "Text buton", help: "Opțional. Un buton evidențiat în dreapta." },
        buttonLink: { label: "Link buton" },
        sticky: { label: "Rămâne sus când derulezi" },
        showAccount: {
          label: "Arată contul vizitatorului",
          help: "Un link „Intră” sau „Salut, Ana” cu „Ieși”. Merge doar pe site-ul publicat cu server.",
        },
        loginText: { label: "Text pentru „Intră”" },
        greeting: { label: "Salutul", help: "Apare ca „Salut, Ana”." },
        logoutText: { label: "Text pentru „Ieși”" },
      },
    },
  },

  html(p, ctx) {
    const site = ctx.site || {};
    const words = WORDS[site.lang === "ro" ? "ro" : "en"];
    const name = p.logoText || site.name || words.site;
    const navId = `navbar-${ctx.id}`;
    // A link to a page the static export leaves out (members only) isn't shown, so nobody lands on "Page not found".
    const links = p.links.filter((l) => l.text && ctx.reachable(l.link));
    const button = p.buttonText && ctx.reachable(p.buttonLink);
    const login = url(site.loginPage || "/login");
    // The static export has no server, so no account either.
    const account = p.showAccount && ctx.mode !== "static" ? accountHtml(p, ctx.mode === "site" ? ctx.user : null, login) : "";

    return html`<header class="navbar ${p.sticky ? "navbar--sticky" : ""}">
      <div class="b-container navbar__bar">
        <a class="navbar__logo" href="/">
          ${p.logoImage ? html`<img class="navbar__logo-img" src="${url(p.logoImage)}" alt="">` : ""}
          <span>${name}</span>
        </a>
        <button class="navbar__toggle" type="button" aria-expanded="false" aria-controls="${navId}" aria-label="${words.menu}">
          <span class="navbar__burger" aria-hidden="true"></span>
        </button>
        <nav class="navbar__nav" id="${navId}" aria-label="${words.mainMenu}">
          ${links.length
            ? html`<ul class="navbar__links">
                ${links.map((l) => html`<li><a class="navbar__link" href="${url(l.link)}">${l.text}</a></li>`)}
              </ul>`
            : ""}
          ${button || account
            ? html`<div class="navbar__actions">
                ${button ? html`<a class="b-btn navbar__button" href="${url(p.buttonLink)}">${p.buttonText}</a>` : ""}
                ${account}
              </div>`
            : ""}
        </nav>
      </div>
    </header>`;
  },

  css: `
    .navbar { position: relative; z-index: 40; background: color-mix(in srgb, var(--background) 92%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
      -webkit-backdrop-filter: saturate(1.4) blur(10px); backdrop-filter: saturate(1.4) blur(10px); }
    .navbar--sticky { position: sticky; top: 0; }
    .navbar__bar { display: flex; align-items: center; gap: 0.75rem 1.5rem; min-height: 4.25rem; padding-block: 0.6rem; }
    .navbar__logo { display: inline-flex; align-items: center; gap: 0.6rem; margin-right: auto; color: var(--text);
      text-decoration: none; font-weight: 800; font-size: 1.15rem; letter-spacing: -0.01em; }
    .navbar__logo-img { height: 2.5rem; width: auto; }
    .navbar__nav { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem 1.75rem; }
    .navbar__links { display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; list-style: none; margin: 0; padding: 0; }
    .navbar__link { display: inline-block; padding: 0.35rem 0; color: var(--text); font-weight: 500; text-decoration: none;
      border-bottom: 2px solid transparent; }
    .navbar__link:hover { color: var(--primary); }
    .navbar__link[aria-current="page"] { color: var(--primary); border-bottom-color: currentColor; }
    .navbar__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem 1.25rem; }
    .navbar__button { padding: 0.55em 1.1em; }
    .navbar__account { display: flex; align-items: center; gap: 0.75rem; font-size: 0.95rem; }
    .navbar__login { font-weight: 600; text-decoration: none; }
    .navbar__login:hover, .navbar__logout:hover { text-decoration: underline; }
    .navbar__logout { padding: 0.25rem 0; border: 0; background: none; color: var(--primary); font: inherit; font-weight: 600; cursor: pointer; }
    .navbar a:focus-visible, .navbar button:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent);
      outline-offset: 3px; border-radius: 4px; }
    .navbar__toggle { display: none; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; padding: 0;
      border: 1px solid color-mix(in srgb, var(--text) 18%, transparent); border-radius: calc(var(--radius) * 0.7);
      background: transparent; color: var(--text); cursor: pointer; }
    .navbar__burger, .navbar__burger::before, .navbar__burger::after { display: block; width: 1.25rem; height: 2px;
      border-radius: 2px; background: currentColor; transition: transform 0.2s, background-color 0.2s; }
    .navbar__burger { position: relative; }
    .navbar__burger::before, .navbar__burger::after { content: ""; position: absolute; left: 0; }
    .navbar__burger::before { top: -6px; }
    .navbar__burger::after { top: 6px; }
    .navbar--open .navbar__burger { background: transparent; }
    .navbar--open .navbar__burger::before { transform: translateY(6px) rotate(45deg); }
    .navbar--open .navbar__burger::after { transform: translateY(-6px) rotate(-45deg); }
    @media (max-width: 800px) {
      .navbar__bar { flex-wrap: wrap; }
      /* A long name wraps onto two lines in its own space; the menu button stays at the top right. */
      .navbar__logo { flex: 1 1 0; min-width: 0; }
      .navbar__logo span { overflow-wrap: anywhere; }
      .navbar__nav { flex-basis: 100%; }
      .navbar--js .navbar__toggle { display: inline-flex; }
      .navbar--js .navbar__nav { display: none; flex-direction: column; align-items: stretch; gap: 0.75rem;
        max-height: calc(100vh - 5rem); overflow-y: auto; padding-bottom: 0.75rem; }
      .navbar--js.navbar--open .navbar__nav { display: flex; }
      .navbar--js .navbar__links { flex-direction: column; gap: 0; }
      .navbar--js .navbar__link { display: block; padding: 0.7rem 0;
        border-bottom: 1px solid color-mix(in srgb, var(--text) 8%, transparent); }
      .navbar--js .navbar__link[aria-current="page"] { font-weight: 700;
        border-bottom-color: color-mix(in srgb, var(--text) 8%, transparent); }
      .navbar--js .navbar__actions { justify-content: space-between; }
    }
  `,

  js(el, p, api) {
    const header = el.querySelector(".navbar");
    const toggle = el.querySelector(".navbar__toggle");
    if (!header || !toggle) return;
    const editor = api.mode === "editor";
    header.classList.add("navbar--js");

    const setOpen = (open) => {
      header.classList.toggle("navbar--open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
    toggle.addEventListener("click", () => setOpen(!isOpen()));

    const onKey = (e) => {
      if (e.key === "Escape" && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    api.onStop(() => document.removeEventListener("keydown", onKey));

    // On a big screen the links are always visible: forget the phone state.
    const bigScreen = window.matchMedia("(min-width: 801px)");
    const onChange = () => bigScreen.matches && setOpen(false);
    bigScreen.addEventListener("change", onChange);
    api.onStop(() => bigScreen.removeEventListener("change", onChange));

    // The link to the current page.
    if (!editor) {
      const here = normal(location.pathname);
      for (const a of el.querySelectorAll(".navbar__link")) {
        try {
          const target = new URL(a.getAttribute("href") || "", location.href);
          if (target.origin === location.origin && normal(target.pathname) === here) a.setAttribute("aria-current", "page");
        } catch {
          // an invalid link: leave it as it is
        }
      }
    }

    el.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a");
      if (!a) return;
      // In the editor, links don't go anywhere.
      if (editor) e.preventDefault();
      else setOpen(false);
    });

    const account = el.querySelector(".navbar__account");
    if (!account || api.mode !== "site") return;
    const login = account.dataset.login || "/login";

    // After logging in, the visitor comes back to the page they left.
    const prepareLogin = () => {
      const a = account.querySelector(".navbar__login");
      if (!a) return;
      let loginPath = "";
      try {
        loginPath = normal(new URL(login, location.href).pathname);
      } catch {
        return;
      }
      if (normal(location.pathname) === loginPath) return;
      const next = encodeURIComponent(location.pathname + location.search);
      a.href = `${login}${login.includes("?") ? "&" : "?"}next=${next}`;
    };

    const draw = (user) => {
      account.replaceChildren();
      account.dataset.state = user ? "member" : "visitor";
      if (user) {
        const greeting = document.createElement("span");
        greeting.className = "navbar__greeting";
        const name = document.createElement("strong");
        name.textContent = user.name || "";
        greeting.append(p.greeting ? `${p.greeting}, ` : "", name);
        const logout = document.createElement("button");
        logout.type = "button";
        logout.className = "navbar__logout";
        logout.textContent = p.logoutText;
        account.append(greeting, logout);
      } else {
        const a = document.createElement("a");
        a.className = "navbar__login";
        a.href = login;
        a.textContent = p.loginText;
        account.append(a);
        prepareLogin();
      }
    };

    account.addEventListener("click", async (e) => {
      const logout = e.target.closest && e.target.closest(".navbar__logout");
      if (!logout) return;
      logout.disabled = true;
      const r = await api.post("/api/auth/logout", {});
      if (r.ok) location.reload();
      else logout.disabled = false;
    });

    prepareLogin();
    // The state comes from the page (the server knows it from the cookie), and api.user() returns the
    // same one, without a request. They only differ if another component already logged in or out
    // through api.post, without a reload.
    api.user().then((u) => {
      if (account.dataset.state !== (u ? "member" : "visitor")) draw(u);
    });
  },
};
