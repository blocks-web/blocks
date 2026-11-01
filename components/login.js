import { html, url } from "../core/html.js";

// Logging in. The server handles the accounts (server/auth.js), not the component.

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: {
    email: "Email",
    password: "Password",
    button: "Log in",
    fill: "Please fill in this field.",
    emailInvalid: "Enter an email address, like name@example.com.",
    editor: "Forms can't be sent from the editor. Try it on the site.",
    failed: "We couldn't log you in. Please try again.",
  },
  ro: {
    email: "Email",
    password: "Parolă",
    button: "Intră",
    fill: "Completează acest câmp.",
    emailInvalid: "Scrie o adresă de email, de forma nume@exemplu.ro.",
    editor: "În editor formularul nu se trimite. Încearcă pe site.",
    failed: "Nu am putut intra în cont. Încearcă din nou.",
  },
};
const wordsFor = (lang) => WORDS[lang === "ro" ? "ro" : "en"];

// Only paths on the same site ("/account"), so "?next=" can't send the visitor to another site.
function safePath(value) {
  if (typeof value !== "string" || !/^\/(?![/\\])[^\\\s\u0000-\u001f\u007f]*$/.test(value)) return null;
  try {
    return new URL(value, location.origin).origin === location.origin ? value : null;
  } catch {
    return null;
  }
}

export default {
  name: "Log in",
  category: "Members",
  icon: "login",
  description: "A form with email and password for the site's members.",
  tip: "Put it on the page you chose as the “Login page” in Site settings; after logging in, people go back to where they were.",
  needsServer: true,

  props: {
    title: { type: "text", label: "Title", default: "Log in" },
    headingLevel: {
      type: "choice",
      label: "Title role",
      options: [
        { value: "h2", label: "Section title" },
        { value: "h1", label: "The page's main title" },
      ],
      default: "h2",
      help: "Every page should have a single main title (screen readers and search engines use it).",
    },
    buttonText: { type: "text", label: "Button text", default: "Log in" },
    afterLogin: { type: "link", label: "After logging in, take them to", default: "/account", help: "The page that opens once they're logged in." },
    signupQuestion: { type: "text", label: "Question for people without an account", default: "Don't have an account?" },
    signupLinkText: { type: "text", label: "Sign-up link text", default: "Create one" },
    signupLink: { type: "link", label: "Sign-up link", default: "/signup", help: "Leave it empty to hide it." },
    noServerMessage: {
      type: "text",
      label: "Message when logging in isn't possible",
      default: "Logging in isn't available on this site.",
      help: "Only shows on a site published without a server, where the form doesn't work.",
    },
  },

  i18n: {
    ro: {
      name: "Intrare în cont",
      category: "Membri",
      description: "Formular cu email și parolă pentru membrii site-ului.",
      tip: "Pune-l pe pagina aleasă în Setări site ca „Pagina de intrare în cont”; după intrare, omul se întoarce de unde a plecat.",
      props: {
        title: { label: "Titlu" },
        headingLevel: {
          label: "Rolul titlului",
          help: "Fiecare pagină ar trebui să aibă un singur titlu principal (îl folosesc cititoarele de ecran și motoarele de căutare).",
          options: { h2: "Titlu de secțiune", h1: "Titlul principal al paginii" },
        },
        buttonText: { label: "Text buton" },
        afterLogin: { label: "După intrare, du-l la", help: "Pagina deschisă după ce intră în cont." },
        signupQuestion: { label: "Întrebare pentru cine n-are cont" },
        signupLinkText: { label: "Text link înregistrare" },
        signupLink: { label: "Link înregistrare", help: "Lasă gol ca să nu apară." },
        noServerMessage: {
          label: "Mesaj când nu se poate intra",
          help: "Apare doar pe un site publicat fără server, unde formularul nu merge.",
        },
      },
    },
  },

  html(p, ctx) {
    const words = wordsFor(ctx.site?.lang);
    // The static export has no server: the fields are disabled, so nobody types for nothing.
    const off = ctx.mode === "static" ? "disabled" : "";
    const title = p.headingLevel === "h1" ? html`<h1 class="login__title">${p.title}</h1>` : html`<h2 class="login__title">${p.title}</h2>`;
    return html`<div class="b-block login">
      <div class="b-container">
        <div class="login__card">
          ${p.title ? title : ""}
          <form class="b-form login__form" method="post">
            <label class="b-field">${words.email}
              <input type="email" name="email" required maxlength="200" autocomplete="email" inputmode="email" ${off}>
            </label>
            <label class="b-field">${words.password}
              <input type="password" name="password" required maxlength="200" autocomplete="current-password" ${off}>
            </label>
            <button class="b-btn login__button" type="submit" ${off}>${p.buttonText || words.button}</button>
            <p class="b-message" role="status">${off ? p.noServerMessage : ""}</p>
          </form>
          ${p.signupLink && p.signupLinkText
            ? html`<p class="login__signup">${p.signupQuestion} <a class="login__link" href="${url(p.signupLink)}">${p.signupLinkText}</a></p>`
            : ""}
        </div>
      </div>
    </div>`;
  },

  css: `
    .login { align-self: stretch; }
    .login__card { max-width: 440px; margin: 1rem auto; padding: 2rem; text-align: left; color: var(--text);
      background: var(--background); border: 1px solid color-mix(in srgb, var(--text) 12%, transparent); border-radius: var(--radius);
      box-shadow: 0 10px 30px -18px color-mix(in srgb, var(--text) 45%, transparent); }
    .login__title { margin-bottom: 1.25rem; font-size: 1.6rem; }
    .login__form { max-width: none; }
    .login__button { width: 100%; }
    .login__signup { margin: 1.25rem 0 0; font-size: 0.95rem; text-align: center; }
    .login__link { font-weight: 600; }
    @container (max-width: 480px) {
      .login__card { padding: 1.5rem 1.25rem; }
    }
  `,

  js(el, p, api) {
    const form = el.querySelector(".login__form");
    if (!form) return;
    // The page's language (<html lang>, from site.json), the same one html() used.
    const words = wordsFor(document.documentElement.lang);
    const button = form.querySelector('button[type="submit"]');
    const message = form.querySelector(".b-message");
    const { email, password } = form.elements;
    const show = (text, kind) => {
      message.className = `b-message${kind ? ` b-message--${kind}` : ""}`;
      message.textContent = text;
    };
    const next = api.mode === "site" ? safePath(new URLSearchParams(location.search).get("next")) : null;

    // The browser's own messages for empty or wrong fields, in the page's language (not the browser's).
    for (const f of [email, password]) {
      f.addEventListener("invalid", () => f.setCustomValidity(f.validity.valueMissing ? words.fill : f.validity.typeMismatch ? words.emailInvalid : ""));
      f.addEventListener("input", () => f.setCustomValidity(""));
    }
    // An old error goes away when the browser stops the next try or the visitor changes a field.
    form.addEventListener("invalid", () => show("", ""), true);
    form.addEventListener("input", () => {
      if (message.className.includes("b-message--error")) show("", "");
    });

    // Whoever signs up from here also comes back to the page they came from.
    const link = el.querySelector(".login__link");
    if (link && next) {
      const href = link.getAttribute("href") || "";
      link.setAttribute("href", `${href}${href.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`);
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (api.mode === "editor") return show(words.editor, "");
      if (api.mode !== "site") return show(p.noServerMessage, "error");

      button.disabled = true;
      show("", "");
      const r = await api.post("/api/auth/login", { email: email.value, password: password.value });
      if (r.ok) {
        location.href = next || url(p.afterLogin) || "/";
        return;
      }
      button.disabled = false;
      show(r.data?.error || words.failed, "error");
      password.select();
    });
  },
};
