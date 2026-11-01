import { html, paragraphs, url } from "../core/html.js";

// The logged-in visitor's account. The details come from the server (ctx.user), not from the browser.

// What this block writes by itself, in the site's language: in html() from site.json → "lang", in js() from <html lang>.
const WORDS = {
  en: { example: "(example in the editor)", logoutFailed: "We couldn't log you out. Please try again." },
  ro: { example: "(exemplu în editor)", logoutFailed: "Nu am putut ieși din cont. Încearcă din nou." },
};

export default {
  name: "My account",
  category: "Members",
  icon: "account",
  description: "Shows who is logged in, with a button to log out.",
  tip: "A members-only “My account” page (set it in the page settings), with this block at the top and your offers below, is all a café with a loyalty card needs.",
  needsServer: true,

  props: {
    greeting: { type: "text", label: "Greeting", default: "Hi", help: "Shows as “Hi, Ana!”." },
    logoutText: { type: "text", label: "Text for “Log out”", default: "Log out" },
    afterLogout: { type: "link", label: "After logging out, take them to", default: "/" },
    guestMessage: {
      type: "longtext",
      label: "Message for people who aren't logged in",
      default: "You're not logged in. Log in to see your account details.",
    },
    loginText: { type: "text", label: "Text for “Log in”", default: "Log in" },
  },

  i18n: {
    ro: {
      name: "Contul meu",
      category: "Membri",
      description: "Arată cine e în cont, cu un buton de ieșire.",
      tip: "O pagină „Contul meu” doar pentru membri (din setările paginii), cu acest bloc sus și ofertele dedesubt, e tot ce are nevoie o cafenea cu card de fidelitate.",
      props: {
        greeting: { label: "Salutul", help: "Apare ca „Salut, Ana!”." },
        logoutText: { label: "Text buton ieșire" },
        afterLogout: { label: "După ieșire, du-l la" },
        guestMessage: { label: "Mesaj pentru cine nu e în cont" },
        loginText: { label: "Text buton intrare" },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const editor = ctx.mode === "editor";
    // Nobody is logged in inside the editor, so we show an example.
    const user = editor ? { name: "Ana", email: "ana@example.com" } : ctx.mode === "site" ? ctx.user : null;

    if (!user) {
      const login = url(ctx.site?.loginPage || "/login");
      return html`<div class="b-block account">
        <div class="b-container">
          <div class="account__card account__card--guest">
            ${paragraphs(p.guestMessage)}
            ${ctx.mode === "site" && p.loginText ? html`<a class="b-btn account__login" href="${login}">${p.loginText}</a>` : ""}
          </div>
        </div>
      </div>`;
    }

    const name = String(user.name || "");
    const initial = name ? [...name.trim()][0]?.toUpperCase() || "" : "";
    return html`<div class="b-block account">
      <div class="b-container">
        <div class="account__card">
          <span class="account__avatar" aria-hidden="true">${initial}</span>
          <div class="account__info">
            <h2 class="account__greeting">${p.greeting ? `${p.greeting}, ` : ""}${name}!</h2>
            <p class="account__email">${user.email}</p>
            ${editor ? html`<p class="account__note">${words.example}</p>` : ""}
          </div>
          ${p.logoutText ? html`<button class="b-btn b-btn--outline account__logout" type="button">${p.logoutText}</button>` : ""}
          <p class="b-message account__message" role="status"></p>
        </div>
      </div>
    </div>`;
  },

  css: `
    .account { align-self: stretch; }
    .account__card { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 1.25rem; max-width: 640px; margin-inline: auto;
      padding: 1.5rem 1.75rem; text-align: left; color: var(--text); background: var(--background); border-radius: var(--radius);
      border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
      box-shadow: 0 10px 30px -18px color-mix(in srgb, var(--text) 45%, transparent); }
    .account__card--guest { flex-direction: column; align-items: flex-start; }
    .account__card--guest p { margin: 0; }
    .account__avatar { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; flex: none; border-radius: 50%;
      background: var(--primary); color: #fff; font-size: 1.4rem; font-weight: 700; }
    .account__info { flex: 1 1 200px; min-width: 0; }
    .account__greeting { margin: 0 0 0.15rem; font-size: 1.5rem; overflow-wrap: anywhere; }
    .account__email { margin: 0; opacity: 0.8; overflow-wrap: anywhere; }
    .account__note { margin: 0.25rem 0 0; font-size: 0.85rem; font-style: italic; opacity: 0.7; }
    .account__message { flex-basis: 100%; margin: 0; }
  `,

  js(el, p, api) {
    if (api.mode !== "site") return;
    const words = WORDS[el.ownerDocument?.documentElement?.lang === "ro" ? "ro" : "en"];

    // After logging in, the visitor comes back here.
    const login = el.querySelector(".account__login");
    if (login) {
      const href = login.getAttribute("href") || "";
      login.setAttribute("href", `${href}${href.includes("?") ? "&" : "?"}next=${encodeURIComponent(location.pathname + location.search)}`);
    }

    const logout = el.querySelector(".account__logout");
    if (!logout) return;
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      const r = await api.post("/api/auth/logout", {});
      if (r.ok) {
        location.href = url(p.afterLogout) || "/";
        return;
      }
      logout.disabled = false;
      const message = el.querySelector(".account__message");
      if (message) {
        message.className = "b-message b-message--error account__message";
        message.textContent = r.data?.error || words.logoutFailed;
      }
    });
  },
};
