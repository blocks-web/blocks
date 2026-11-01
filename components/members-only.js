import { html, paragraphs, url } from "../core/html.js";

// Whatever you drag inside shows only to people who are logged in. The check happens on the server:
// for everyone else the content never even reaches the page (it isn't just hidden).
const LOCK = html`<svg class="members-only__lock" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/>
</svg>`;

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { label: "Only visible to logged-in members" },
  ro: { label: "Vizibil doar pentru membrii intrați în cont" },
};

export default {
  name: "Members only",
  category: "Members",
  icon: "members",
  description: "An area whose content only logged-in visitors can see.",
  tip: "Drag any block inside (an offer, a schedule, a list); for everyone else, the content isn't just hidden: it never reaches the page.",
  needsServer: true,

  props: {
    message: {
      type: "longtext",
      label: "Message for people who aren't logged in",
      default: "This part is for members only. Log in to see it.",
    },
    buttonText: { type: "text", label: "Button text", default: "Log in" },
  },

  slots: { content: "Members-only content" },

  i18n: {
    ro: {
      name: "Doar pentru membri",
      category: "Membri",
      description: "O zonă al cărei conținut îl văd doar vizitatorii intrați în cont.",
      tip: "Trage înăuntru orice bloc (o ofertă, un program, o listă); pentru ceilalți, conținutul nu e doar ascuns: nici nu ajunge în pagină.",
      props: {
        message: { label: "Mesaj pentru cine nu e în cont" },
        buttonText: { label: "Text buton" },
      },
      slots: { content: "Conținut pentru membri" },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    if (ctx.mode === "editor") {
      return html`<div class="b-block members-only members-only--editor">
        <div class="b-container">
          <div class="members-only__frame">
            <span class="members-only__label">${LOCK} ${words.label}</span>
            <div class="members-only__content">${ctx.slot("content")}</div>
          </div>
        </div>
      </div>`;
    }

    // A logged-in member: the content shows as if it were directly on the page.
    if (ctx.mode === "site" && ctx.user) {
      return html`<div class="members-only__open">${ctx.slot("content")}</div>`;
    }

    // The static export has no accounts: a "log in" with no way to do it would only confuse.
    // And an empty area doesn't ask anyone to log in to see nothing.
    if (ctx.mode === "static" || ctx.isEmpty("content")) return "";

    // A visitor: only the message. ctx.slot isn't called, so the content isn't in the HTML.
    const login = url(ctx.site?.loginPage || "/login");
    return html`<div class="b-block members-only">
      <div class="b-container">
        <div class="members-only__locked">
          <span class="members-only__icon">${LOCK}</span>
          <div class="members-only__text">${paragraphs(p.message)}</div>
          ${ctx.mode === "site" && p.buttonText ? html`<a class="b-btn members-only__login" href="${login}">${p.buttonText}</a>` : ""}
        </div>
      </div>
    </div>`;
  },

  css: `
    .members-only { align-self: stretch; }
    .members-only__open { display: contents; }
    .members-only__frame { position: relative; padding: 2.25rem 1rem 1rem; border-radius: var(--radius);
      border: 2px dashed color-mix(in srgb, var(--primary) 55%, transparent); }
    .members-only__label { position: absolute; top: 0; left: 1rem; transform: translateY(-50%); display: inline-flex; align-items: center;
      gap: 0.35rem; padding: 0.2rem 0.65rem; border-radius: 999px; background: var(--primary); color: #fff;
      font-size: 0.8rem; font-weight: 600; }
    .members-only__label .members-only__lock { width: 14px; height: 14px; }
    .members-only__content { display: flex; flex-direction: column; gap: 1.25rem; }
    .members-only__locked { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 1.25rem; max-width: 760px; margin-inline: auto;
      padding: 1.5rem 1.75rem; text-align: left; color: var(--text); background: var(--surface); border-radius: var(--radius);
      border: 1px solid color-mix(in srgb, var(--text) 9%, transparent); }
    .members-only__icon { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; flex: none; border-radius: 50%;
      background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); }
    .members-only__text { flex: 1 1 240px; }
    .members-only__text > :last-child { margin-bottom: 0; }
    .members-only__login { flex: none; }
  `,

  js(el, p, api) {
    if (api.mode !== "site") return;
    // After logging in, the visitor comes back to this page.
    const login = el.querySelector(".members-only__login");
    if (!login) return;
    const href = login.getAttribute("href") || "";
    login.setAttribute("href", `${href}${href.includes("?") ? "&" : "?"}next=${encodeURIComponent(location.pathname + location.search)}`);
  },
};
