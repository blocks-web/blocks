import { html, url } from "../core/html.js";

// A new account. The server (server/auth.js) checks the details and saves the password as a hash.
// The password: at least 15 characters, no composition rules (NIST SP 800-63B-4). Here we only check
// the length; obviously weak passwords (e.g. "aaaa…", "qwerty…", padded with invisible characters) are
// refused by the server, with a message.
const PASSWORD_MIN = 15;

// Only paths on the same site ("/account"), so "?next=" can't send the visitor to another site.
function safePath(value) {
  if (typeof value !== "string" || !/^\/(?![/\\])[^\\\s\u0000-\u001f\u007f]*$/.test(value)) return null;
  try {
    return new URL(value, location.origin).origin === location.origin ? value : null;
  } catch {
    return null;
  }
}

// What this block writes by itself, in the site's language: in html() from site.json → "lang", in js() from <html lang>.
const WORDS = {
  en: {
    name: "Name",
    email: "Email",
    password: "Password",
    passwordHelp: `At least ${PASSWORD_MIN} characters. A short sentence is easy to remember.`,
    confirm: "Confirm password",
    button: "Create account",
    tooShort: `The password must be at least ${PASSWORD_MIN} characters long. A short sentence is easy to remember.`,
    mismatch: "The passwords don't match.",
    fill: "Please fill in this field.",
    emailInvalid: "Enter an email address, like name@example.com.",
    editor: "Forms can't be sent from the editor. Try it on the site.",
    failed: "We couldn't create your account. Please try again.",
  },
  ro: {
    name: "Nume",
    email: "Email",
    password: "Parolă",
    passwordHelp: `Cel puțin ${PASSWORD_MIN} caractere. O propoziție scurtă e ușor de ținut minte.`,
    confirm: "Repetă parola",
    button: "Creează contul",
    tooShort: `Parola trebuie să aibă cel puțin ${PASSWORD_MIN} caractere. O propoziție scurtă e ușor de ținut minte.`,
    mismatch: "Parolele nu se potrivesc.",
    fill: "Completează acest câmp.",
    emailInvalid: "Scrie o adresă de email, de forma nume@exemplu.ro.",
    editor: "În editor formularul nu se trimite. Încearcă pe site.",
    failed: "Nu am putut crea contul. Încearcă din nou.",
  },
};

export default {
  name: "Sign up",
  category: "Members",
  icon: "signup",
  description: "A form where visitors create an account on the site.",
  tip: "Anyone can create an account, so only put things behind “Members only” that you'd happily give to anyone who asks nicely.",
  needsServer: true,

  props: {
    title: { type: "text", label: "Title", default: "Create an account" },
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
    buttonText: { type: "text", label: "Button text", default: "Create account" },
    afterSignup: { type: "link", label: "After signing up, take them to", default: "/account" },
    loginQuestion: { type: "text", label: "Question for people who already have an account", default: "Already have an account?" },
    loginLinkText: { type: "text", label: "Login link text", default: "Log in" },
    loginLink: { type: "link", label: "Login link", default: "", help: "Leave it empty to use the login page from the site settings." },
    noServerMessage: {
      type: "text",
      label: "Message when accounts can't be created",
      default: "Creating an account isn't available on this site.",
      help: "Only shows on a site published without a server, where the form doesn't work.",
    },
  },

  i18n: {
    ro: {
      name: "Înregistrare",
      category: "Membri",
      description: "Formular prin care vizitatorii își fac cont pe site.",
      tip: "Oricine își poate face cont, deci pune în „Doar pentru membri” doar ce ai da oricui cere frumos.",
      props: {
        title: { label: "Titlu" },
        headingLevel: {
          label: "Rolul titlului",
          options: { h2: "Titlu de secțiune", h1: "Titlul principal al paginii" },
          help: "Fiecare pagină ar trebui să aibă un singur titlu principal (îl folosesc cititoarele de ecran și motoarele de căutare).",
        },
        buttonText: { label: "Text buton" },
        afterSignup: { label: "După înregistrare, du-l la" },
        loginQuestion: { label: "Întrebare pentru cine are cont" },
        loginLinkText: { label: "Text link intrare" },
        loginLink: { label: "Link intrare", help: "Lasă gol pentru pagina de intrare în cont din Setări site." },
        noServerMessage: {
          label: "Mesaj când nu se poate crea cont",
          help: "Apare doar pe un site publicat fără server, unde formularul nu merge.",
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    // The static export has no server: the fields are disabled, so nobody types for nothing.
    const off = ctx.mode === "static" ? "disabled" : "";
    const title = p.headingLevel === "h1"
      ? html`<h1 class="signup__title">${p.title}</h1>`
      : html`<h2 class="signup__title">${p.title}</h2>`;
    const login = p.loginLink || ctx.site?.loginPage || "/login";
    const passwordId = `${ctx.id}-password`;
    const helpId = `${ctx.id}-password-help`;
    return html`<div class="b-block signup">
      <div class="b-container">
        <div class="signup__card">
          ${p.title ? title : ""}
          <form class="b-form signup__form" method="post">
            <label class="b-field">${words.name}
              <input name="name" required maxlength="80" autocomplete="name" ${off}>
            </label>
            <label class="b-field">${words.email}
              <input type="email" name="email" required maxlength="200" autocomplete="email" inputmode="email" ${off}>
            </label>
            <div class="b-field">
              <label for="${passwordId}">${words.password}</label>
              <input type="password" id="${passwordId}" name="password" required minlength="${PASSWORD_MIN}" maxlength="200" autocomplete="new-password" aria-describedby="${helpId}" ${off}>
              <small class="signup__help" id="${helpId}">${words.passwordHelp}</small>
            </div>
            <label class="b-field">${words.confirm}
              <input type="password" name="confirm" required minlength="${PASSWORD_MIN}" maxlength="200" autocomplete="new-password" ${off}>
            </label>
            <button class="b-btn signup__button" type="submit" ${off}>${p.buttonText || words.button}</button>
            <p class="b-message" role="status">${off ? p.noServerMessage : ""}</p>
          </form>
          ${p.loginLinkText
            ? html`<p class="signup__other">${p.loginQuestion} <a class="signup__link" href="${url(login)}">${p.loginLinkText}</a></p>`
            : ""}
        </div>
      </div>
    </div>`;
  },

  css: `
    .signup { align-self: stretch; }
    .signup__card { max-width: 440px; margin: 1rem auto; padding: 2rem; text-align: left; color: var(--text);
      background: var(--background); border: 1px solid color-mix(in srgb, var(--text) 12%, transparent); border-radius: var(--radius);
      box-shadow: 0 10px 30px -18px color-mix(in srgb, var(--text) 45%, transparent); }
    .signup__title { margin-bottom: 1.25rem; font-size: 1.6rem; }
    .signup__form { max-width: none; }
    .signup__help { font-weight: 400; font-size: 0.85rem; opacity: 0.75; }
    .signup__button { width: 100%; }
    .signup__other { margin: 1.25rem 0 0; font-size: 0.95rem; text-align: center; }
    .signup__link { font-weight: 600; }
    @container (max-width: 480px) {
      .signup__card { padding: 1.5rem 1.25rem; }
    }
  `,

  js(el, p, api) {
    const form = el.querySelector(".signup__form");
    if (!form) return;
    const words = WORDS[el.ownerDocument?.documentElement?.lang === "ro" ? "ro" : "en"];
    const button = form.querySelector('button[type="submit"]');
    const message = form.querySelector(".b-message");
    const { name, email, password, confirm } = form.elements;
    const show = (text, kind) => {
      message.className = `b-message${kind ? ` b-message--${kind}` : ""}`;
      message.textContent = text;
    };
    const next = api.mode === "site" ? safePath(new URLSearchParams(location.search).get("next")) : null;

    const link = el.querySelector(".signup__link");
    if (link && next) {
      const href = link.getAttribute("href") || "";
      link.setAttribute("href", `${href}${href.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`);
    }

    // The browser's own messages for empty, wrong or short fields, in the page's language (not the
    // browser's). A message we set ourselves (the passwords don't match) stays until the field changes.
    const messageFor = (v) => (v.valueMissing ? words.fill : v.typeMismatch ? words.emailInvalid : v.tooShort ? words.tooShort : "");
    for (const f of [name, email, password, confirm]) {
      f.addEventListener("invalid", () => {
        if (!f.validity.customError) f.setCustomValidity(messageFor(f.validity));
      });
    }
    for (const f of [name, email, password]) f.addEventListener("input", () => f.setCustomValidity(""));
    // We catch different passwords before sending anything.
    const checkConfirm = () => confirm.setCustomValidity(confirm.value && confirm.value !== password.value ? words.mismatch : "");
    password.addEventListener("input", checkConfirm);
    confirm.addEventListener("input", checkConfirm);
    // An old error goes away when the browser stops the next try or the visitor changes a field.
    form.addEventListener("invalid", () => show("", ""), true);
    form.addEventListener("input", () => {
      if (message.className.includes("b-message--error")) show("", "");
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (api.mode === "editor") return show(words.editor, "");
      if (api.mode !== "site") return show(p.noServerMessage, "error");
      // Characters, not UTF-16 units (an emoji is a single character), without the extra spaces, as on the server.
      if ([...password.value.trim().replace(/\s+/g, " ")].length < PASSWORD_MIN) {
        password.focus();
        return show(words.tooShort, "error");
      }
      if (password.value !== confirm.value) {
        confirm.focus();
        return show(words.mismatch, "error");
      }

      button.disabled = true;
      show("", "");
      const r = await api.post("/api/auth/register", { name: name.value, email: email.value, password: password.value });
      if (r.ok) {
        location.href = next || url(p.afterSignup) || "/";
        return;
      }
      button.disabled = false;
      show(r.data?.error || words.failed, "error");
    });
  },
};
