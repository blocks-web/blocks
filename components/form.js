import { html, inline, paragraphs, raw } from "../core/html.js";

// A form with the fields the owner chooses: contact, booking, sign-up, appointment, quote request.
// The server (form.server.js) reads the fields from the page, not from the visitor, and checks every value
// by the kind of its field. Messages end up in data/messages.json (`node blocks.js messages`).
const KINDS = ["text", "email", "phone", "longtext", "checkbox", "choice"];

// The choices of a "choice" field: "Morning, Evening" → ["Morning", "Evening"]. (The same rule on the server.)
const choicesOf = (text) => String(text ?? "").split(",").map((v) => v.trim()).filter(Boolean);

// What this block writes by itself, in the site's language: in html() from site.json → "lang", in js()
// from <html lang>. The browser's own messages for wrong fields (tick … tooLong) would otherwise come in
// the browser's language.
const WORDS = {
  en: {
    optional: "(optional)",
    choose: "Choose…",
    trap: "Don't fill in this field",
    send: "Send",
    editorNote: "Forms can't be sent from the editor: open the page with “View page” to try it.",
    empty: "Add fields in the panel on the right.",
    tick: "Check the box to send the form.",
    pick: "Choose an option from the list.",
    fill: "Please fill in this field.",
    email: "Enter an email address, like name@example.com.",
    tooLong: "The text is too long.",
    editor: "Forms can't be sent from the editor. Try it on the site.",
    sent: "Thank you! We got your message.",
    failed: "We couldn't send your message. Please try again.",
  },
  ro: {
    optional: "(opțional)",
    choose: "Alege…",
    trap: "Nu completa acest câmp",
    send: "Trimite",
    editorNote: "În editor formularul nu trimite: încearcă-l pe site, cu „Vezi pagina”.",
    empty: "Adaugă câmpuri din panoul din dreapta.",
    tick: "Bifează căsuța ca să poți trimite.",
    pick: "Alege o variantă din listă.",
    fill: "Completează acest câmp.",
    email: "Scrie o adresă de email, de forma nume@exemplu.ro.",
    tooLong: "Textul e prea lung.",
    editor: "În editor formularul nu se trimite. Încearcă pe site.",
    sent: "Mulțumim! Am primit mesajul.",
    failed: "Nu am putut trimite mesajul. Încearcă din nou.",
  },
};

export default {
  name: "Form",
  category: "Contact",
  icon: "form",
  description: "A form with the fields you choose: contact, booking, sign-up, appointment, quote request.",
  tip: "Only ask for what you need to reply: name, email and message are enough for contact.",
  needsServer: true,

  props: {
    title: { type: "text", format: true, label: "Title", default: "Send us a message" },
    text: { type: "longtext", label: "Text", default: "Leave us a message and we'll get back to you as soon as we can." },
    fields: {
      type: "list",
      label: "Fields",
      fields: {
        label: { type: "text", label: "Label", default: "New field" },
        type: {
          type: "choice",
          label: "Type",
          options: [
            { value: "text", label: "Short text" },
            { value: "email", label: "Email" },
            { value: "phone", label: "Phone" },
            { value: "longtext", label: "Long text" },
            { value: "checkbox", label: "Checkbox (yes / no)" },
            { value: "choice", label: "Choice from a list" },
          ],
          default: "text",
        },
        required: { type: "checkbox", label: "Required", default: true },
        options: { type: "text", label: "Choices", default: "", help: "Only for “Choice from a list”: separated by commas, for example “Morning, Evening”." },
      },
      default: [
        { label: "Name", type: "text", required: true, options: "" },
        { label: "Email", type: "email", required: true, options: "" },
        { label: "Message", type: "longtext", required: true, options: "" },
      ],
    },
    buttonText: { type: "text", label: "Button text", default: "Send" },
    successMessage: { type: "text", label: "Message after sending", default: "Thank you! We got your message and will reply soon." },
    noServerMessage: {
      type: "text",
      label: "Message when the form can't be sent",
      default: "You can't send messages from here. You'll find our contact details on the site.",
      help: "Only shows on a site published without a server, where the form can't be sent.",
    },
  },

  i18n: {
    ro: {
      name: "Formular",
      category: "Contact",
      description: "Un formular cu câmpurile alese de tine: contact, rezervare, înscriere, programare, cerere de ofertă.",
      tip: "Cere doar ce-ți trebuie ca să răspunzi: nume, email și mesaj ajung pentru contact.",
      props: {
        title: { label: "Titlu" },
        text: { label: "Text" },
        fields: {
          label: "Câmpuri",
          fields: {
            label: { label: "Etichetă" },
            type: {
              label: "Fel",
              options: {
                text: "Text scurt",
                email: "Email",
                phone: "Telefon",
                longtext: "Text lung",
                checkbox: "Bifă (da / nu)",
                choice: "Alegere dintr-o listă",
              },
            },
            required: { label: "Obligatoriu" },
            options: { label: "Variante", help: "Doar la „Alegere dintr-o listă”: despărțite prin virgulă, de exemplu „Dimineața, Seara”." },
          },
        },
        buttonText: { label: "Text buton" },
        successMessage: { label: "Mesaj după trimitere" },
        noServerMessage: {
          label: "Mesaj când formularul nu se poate trimite",
          help: "Apare doar pe un site publicat fără server, unde formularul nu se poate trimite.",
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    // Fields without a label are skipped, but their position in the list stays (the server uses the same rule).
    const fields = p.fields.map((f, i) => ({ ...f, i })).filter((f) => String(f.label ?? "").trim());
    if (!fields.length && ctx.mode !== "editor") return "";
    // The static export has no server: the fields are disabled, so nobody types for nothing.
    const off = ctx.mode === "static" ? "disabled" : "";

    const field = (f) => {
      const kind = KINDS.includes(f.type) ? f.type : "text";
      const name = `f${f.i}`;
      const required = f.required ? "required" : "";
      // The label is a single element: "(optional)" sits on the same line, not under it (b-field is a grid).
      const label = html`<span class="form__label">${f.label}${f.required ? "" : html` <span class="form__optional">${words.optional}</span>`}</span>`;
      if (kind === "checkbox") {
        return html`<label class="b-field form__checkbox"><input type="checkbox" name="${name}" data-field="${f.i}" ${required} ${off}> ${label}</label>`;
      }
      if (kind === "choice") {
        return html`<label class="b-field">${label}
          <select name="${name}" data-field="${f.i}" ${required} ${off}>
            <option value="">${words.choose}</option>
            ${choicesOf(f.options).map((v) => html`<option value="${v}">${v}</option>`)}
          </select>
        </label>`;
      }
      if (kind === "longtext") {
        return html`<label class="b-field">${label}<textarea name="${name}" data-field="${f.i}" rows="5" maxlength="5000" ${required} ${off}></textarea></label>`;
      }
      const attributes = {
        text: 'type="text" maxlength="200"',
        email: 'type="email" maxlength="200" autocomplete="email" inputmode="email"',
        phone: 'type="tel" maxlength="40" autocomplete="tel"',
      }[kind];
      return html`<label class="b-field">${label}<input ${raw(attributes)} name="${name}" data-field="${f.i}" ${required} ${off}></label>`;
    };

    return html`<div class="b-block form">
      <div class="b-container">
        <div class="form__inner">
          ${p.title ? html`<h2>${inline(p.title)}</h2>` : ""}
          ${paragraphs(p.text)}
          ${fields.length
            ? html`<form class="b-form form__fields" method="post">
                ${fields.map(field)}
                <div class="form__trap" aria-hidden="true">
                  <label>${words.trap} <input name="website" tabindex="-1" autocomplete="off"></label>
                </div>
                <div class="form__submit">
                  <button class="b-btn" type="submit" ${off}>${p.buttonText || words.send}</button>
                </div>
                <p class="b-message" role="status">${off ? p.noServerMessage : ""}</p>
                ${ctx.mode === "editor" ? html`<p class="form__note">${words.editorNote}</p>` : ""}
              </form>`
            : html`<p class="form__empty">${words.empty}</p>`}
        </div>
      </div>
    </div>`;
  },

  css: `
    .form { align-self: stretch; }
    .form__inner { max-width: 560px; }
    .form__inner > p { opacity: 0.9; }
    .form__fields { max-width: none; margin-top: 1.25rem; text-align: left; }
    .form__optional { font-weight: 400; opacity: 0.7; }
    .form__fields textarea { resize: vertical; min-height: 8rem; }
    .form__checkbox { display: flex; align-items: flex-start; gap: 0.6rem; font-weight: 400; }
    .form__checkbox input { width: 1.1rem; height: 1.1rem; margin-top: 0.2rem; accent-color: var(--primary); }
    .form__trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
    .form__submit .b-btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent); outline-offset: 3px; }
    .form__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    .form__note { margin: 0; font-size: 0.85rem; opacity: 0.7; }
  `,

  js(el, p, api) {
    const form = el.querySelector(".form__fields");
    if (!form) return;
    const words = WORDS[el.ownerDocument?.documentElement?.lang === "ro" ? "ro" : "en"];
    const button = form.querySelector('button[type="submit"]');
    const message = form.querySelector(".b-message");
    const show = (text, kind) => {
      message.className = `b-message${kind ? ` b-message--${kind}` : ""}`;
      message.textContent = text;
    };

    // The browser's messages for wrong fields, in the site's language.
    const messageFor = (f) => {
      const v = f.validity;
      if (v.valueMissing) return f.type === "checkbox" ? words.tick : f.tagName === "SELECT" ? words.pick : words.fill;
      if (v.typeMismatch && f.type === "email") return words.email;
      if (v.tooLong) return words.tooLong;
      return "";
    };
    for (const f of form.querySelectorAll("[data-field]")) {
      f.addEventListener("invalid", () => f.setCustomValidity(messageFor(f)));
      f.addEventListener(f.type === "checkbox" || f.tagName === "SELECT" ? "change" : "input", () => f.setCustomValidity(""));
    }
    // An old error goes away when the browser stops the next try or the visitor changes a field.
    const clearError = () => {
      if (message.className.includes("b-message--error")) show("", "");
    };
    form.addEventListener("invalid", () => show("", ""), true);
    form.addEventListener("input", clearError);
    form.addEventListener("change", clearError);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (api.mode === "editor") return show(words.editor, "");
      if (api.mode !== "site") return show(p.noServerMessage, "error");

      // The values, in the order of the fields on the page; the server checks them by the kind of each field.
      const values = [];
      for (const f of form.querySelectorAll("[data-field]")) values[Number(f.dataset.field)] = f.type === "checkbox" ? f.checked : f.value;
      button.disabled = true;
      show("", "");
      const r = await api.post("/api/c/form/submit", {
        page: location.pathname,
        block: el.dataset.id,
        values: Array.from(values, (v) => v ?? ""),
        website: form.elements.website?.value || "",
      });
      button.disabled = false;
      if (r.ok) {
        form.reset();
        show(p.successMessage || words.sent, "success");
      } else {
        show(r.data?.error || words.failed, "error");
      }
    });
  },
};
