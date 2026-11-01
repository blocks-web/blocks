import { html, inline, raw, url } from "../core/html.js";

// Links to social networks, WhatsApp, email or phone, as line icons drawn by us (the same
// 1.75 line as the other Blocks icons), not brand logos.
const ALIGNS = ["left", "center"];
const EXTERNAL = /^(https?:)?\/\//i;

// The name shown (and read by screen readers) and the drawing of each network, on a 24 square.
const NETWORKS = {
  facebook: { name: "Facebook", drawing: '<path d="M14 21v-7h2.5l.5-3.5h-3V8.4c0-1 .4-1.7 1.8-1.7H17V3.6c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2.5H7V14h3v7"/>' },
  instagram: { name: "Instagram", drawing: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="3.75"/><path d="M16.75 7.25h.01"/>' },
  tiktok: { name: "TikTok", drawing: '<path d="M14.5 3v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14.5 3c.4 2.6 2.1 4.3 4.5 4.5"/>' },
  youtube: { name: "YouTube", drawing: '<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>' },
  whatsapp: { name: "WhatsApp", drawing: '<path d="M4 20.5l1.3-4A8.5 8.5 0 1 1 8.4 19.3z"/><path d="M9.3 9.2c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.6 1.4c.1.2 0 .4-.1.6l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.5c.2-.2.4-.2.6-.1l1.4.6c.3.1.4.3.4.5v.5c0 .4-.2.7-.5.9-.6.4-1.3.5-2 .3a9 9 0 0 1-5.4-5.4c-.2-.7-.1-1.4.3-2z"/>' },
  linkedin: { name: "LinkedIn", drawing: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5V17M8 7.5h.01M12 17v-3.75a2.25 2.25 0 0 1 4.5 0V17M12 10.5V17"/>' },
  x: { name: "X", drawing: '<path d="M4.5 4.5 19.5 19.5M19 4.5 5 19.5"/>' },
  email: { name: "Email", drawing: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>' },
  phone: { name: "Phone", drawing: '<path d="M5.5 4h3l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5L16 14l4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A15 15 0 0 1 4 5.5 1.5 1.5 0 0 1 5.5 4z"/>' },
  website: { name: "Website", drawing: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14.5 0 17M12 3.5c-2.5 2.5-2.5 14.5 0 17"/>' },
};

// What this block writes on the page by itself, in the site's language (site.json → "lang"):
// the empty-list hint and the names that aren't brands.
const WORDS = {
  en: { empty: "Add links in the panel on the right.", names: {} },
  ro: { empty: "Adaugă rețele din panoul din dreapta.", names: { phone: "Telefon", website: "Site" } },
};

function icon(network) {
  return raw(
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      NETWORKS[network].drawing +
      "</svg>",
  );
}

// The final address of a link: WhatsApp from a number ("+1 555 010 0123" → wa.me/15550100123),
// email → mailto:, phone → tel:; everything else goes through url(). Empty when there's nothing to link to.
// A WhatsApp number written the local way, with one leading 0 ("0722 000 000"), gets a country code
// only on a Romanian site (+40); anywhere else, the owner writes the country code.
function href(network, link, lang) {
  const s = String(link ?? "").trim();
  if (!s) return "";
  if (network === "whatsapp") {
    if (/^https?:\/\//i.test(s)) return url(s);
    let digits = s.replace(/\D/g, "").replace(/^00/, "");
    if (lang === "ro") digits = digits.replace(/^0/, "40");
    return digits ? `https://wa.me/${digits}` : "";
  }
  if (network === "email") return /^mailto:/i.test(s) ? url(s) : `mailto:${s}`;
  if (network === "phone") {
    if (/^tel:/i.test(s)) return url(s);
    const number = s.replace(/[^\d+]/g, "");
    return number ? `tel:${number}` : "";
  }
  return url(s);
}

export default {
  name: "Social media",
  category: "Contact",
  icon: "social",
  description: "Links to Facebook, Instagram, TikTok, YouTube, WhatsApp, email or phone, as icons.",
  tip: "For WhatsApp, just write the number with its country code (+1 555 010 0123) and the block makes the link; put it in the footer's “Extra” area so it shows on every page.",

  props: {
    label: { type: "text", format: true, label: "Label", default: "Follow us", help: "Optional, next to the icons." },
    align: {
      type: "choice",
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
      ],
      default: "left",
    },
    showNames: { type: "checkbox", label: "Show the network names too", default: false },
    links: {
      type: "list",
      label: "Links",
      fields: {
        network: {
          type: "choice",
          label: "Network",
          options: Object.entries(NETWORKS).map(([value, n]) => ({ value, label: n.name })),
          default: "facebook",
        },
        link: { type: "text", label: "Address", default: "", help: "The page's address; for WhatsApp or phone, the number; for email, the email address." },
      },
      default: [
        { network: "facebook", link: "https://www.facebook.com/" },
        { network: "instagram", link: "https://www.instagram.com/" },
        { network: "whatsapp", link: "+1 555 010 0123" },
        { network: "email", link: "hello@example.com" },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Rețele sociale",
      category: "Contact",
      description: "Linkuri spre Facebook, Instagram, TikTok, YouTube, WhatsApp, email sau telefon, ca iconițe.",
      tip: "Pentru WhatsApp scrie numărul cu prefixul țării (+40 722 000 000) și blocul face linkul; pune-l în subsol, în zona „Extra”, ca să apară pe toate paginile.",
      props: {
        label: { label: "Etichetă", help: "Opțional, lângă iconițe." },
        align: { label: "Aliniere", options: { left: "Stânga", center: "Centru" } },
        showNames: { label: "Arată și numele rețelei" },
        links: {
          label: "Rețele",
          fields: {
            network: {
              label: "Rețea",
              options: {
                facebook: "Facebook",
                instagram: "Instagram",
                tiktok: "TikTok",
                youtube: "YouTube",
                whatsapp: "WhatsApp",
                linkedin: "LinkedIn",
                x: "X",
                email: "Email",
                phone: "Telefon",
                website: "Site",
              },
            },
            link: { label: "Adresă", help: "Adresa paginii; la WhatsApp, numărul cu prefixul țării (+40 722 000 000); la telefon, numărul; la email, adresa de email." },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const lang = ctx.site?.lang === "ro" ? "ro" : "en";
    const words = WORDS[lang];
    const align = ALIGNS.includes(p.align) ? p.align : "left";
    const links = p.links
      .map((l) => {
        const network = Object.hasOwn(NETWORKS, l.network) ? l.network : "website";
        return { network, address: href(network, l.link, lang) };
      })
      .filter((l) => l.address);
    if (!links.length && ctx.mode !== "editor") return "";
    const link = ({ network, address }) => {
      const external = EXTERNAL.test(address);
      const name = words.names[network] || NETWORKS[network].name;
      return html`<li><a class="social__link" href="${address}" aria-label="${name}" title="${name}"${external ? raw(' target="_blank" rel="noopener"') : ""}>
        ${icon(network)}${p.showNames ? html`<span class="social__name">${name}</span>` : ""}
      </a></li>`;
    };
    return html`<div class="b-block social social--${align}">
      <div class="b-container social__row">
        ${p.label ? html`<span class="social__label">${inline(p.label)}</span>` : ""}
        ${links.length
          ? html`<ul class="social__list">${links.map(link)}</ul>`
          : html`<p class="social__empty">${words.empty}</p>`}
      </div>
    </div>`;
  },

  css: `
    .social { align-self: stretch; }
    .social__row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.25rem; }
    .social--center .social__row { justify-content: center; }
    .social__label { font-weight: 600; }
    .social__list { display: flex; flex-wrap: wrap; gap: 0.5rem; list-style: none; margin: 0; padding: 0; }
    .social__link { display: inline-flex; align-items: center; gap: 0.45rem; min-height: 2.75rem; padding: 0 0.7rem; border-radius: 999px;
      color: var(--text); background: color-mix(in srgb, var(--text) 6%, transparent); text-decoration: none; font-weight: 600; font-size: 0.95rem;
      transition: background-color 0.15s ease-out, color 0.15s ease-out; }
    .social__link:hover { color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); }
    .social__link:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent); outline-offset: 2px; }
    .social__link svg { flex: none; }
    .social__empty { margin: 0; padding: 1rem 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @media (prefers-reduced-motion: reduce) {
      .social__link { transition: none; }
    }
  `,
};
