import { html, raw } from "../core/html.js";
import { themeCss } from "../core/render.js";

// HTML code pasted by the site owner: a map, an embedded video, a widget.
// On the site it goes into the page exactly as written (raw), so it is as "trusted" as a component.
//
// In the editor it runs isolated, in a sandboxed frame without "allow-same-origin": it looks the same,
// but it can't touch the editor, the files or /_api (for the server it comes from the "null" origin).
// The frame only sends us its height; js() accepts nothing but numbers, and only from its own frame.

const MIN_HEIGHT = 40;
const MAX_HEIGHT = 4000;

// It comes first in the frame, so badly pasted code (an unclosed "<!--") can't swallow it.
const MEASURE =
  "<script>new ResizeObserver(() => parent.postMessage(Math.ceil(document.documentElement.getBoundingClientRect().height), \"*\"))" +
  ".observe(document.documentElement);</script>";

// The document inside the frame: the site's theme (font, colors), the measuring script, then the code.
function isolated(code, site) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${themeCss(site)}html,body{margin:0;background:transparent}` +
    `body{font-family:var(--font);color:var(--text)}</style>${MEASURE}</head><body>${code}</body></html>`;
}

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Paste the HTML code of a widget (bookings, reviews…) in the panel on the right.", frame: "Embed code" },
  ro: { empty: "Lipește codul HTML al unui widget (rezervări, recenzii…) în panoul din dreapta.", frame: "Cod HTML" },
};

export default {
  name: "Embed code",
  category: "Page",
  icon: "code",
  description: "Paste the code of a widget (bookings, reviews, a map from another provider) and it shows up on the page.",
  tip: "The code goes into the page exactly as it is, scripts included, so only paste code from services you trust; maps and videos have their own blocks.",

  props: {
    code: { type: "html", label: "Widget code (bookings, reviews…)", default: "" },
  },

  i18n: {
    ro: {
      name: "Cod HTML",
      category: "Pagină",
      description: "Lipești codul unui widget (rezervări, recenzii, o hartă de la alt furnizor) și apare în pagină.",
      tip: "Codul intră în pagină exact cum e, cu tot cu scripturi, deci lipește doar cod de la servicii în care ai încredere; pentru hărți și video există blocuri separate.",
      props: {
        code: { label: "Codul widgetului (rezervări, recenzii…)" },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const editor = ctx.mode === "editor";
    if (!p.code.trim()) {
      if (!editor) return "";
      return html`<div class="b-block embed">
        <div class="b-container"><p class="embed__empty">${words.empty}</p></div>
      </div>`;
    }
    // In the editor: inside the isolated frame (escaped in srcdoc); a click selects the block, not what's in it.
    const content = editor
      ? html`<iframe class="embed__frame" sandbox="allow-scripts allow-popups allow-forms" srcdoc="${isolated(p.code, ctx.site)}"
          title="${words.frame}" loading="lazy"></iframe>`
      : html`<div class="embed__content">${raw(p.code)}</div>`;
    return html`<div class="b-block embed">
      <div class="b-container">${content}</div>
    </div>`;
  },

  css: `
    .embed { align-self: stretch; }
    .embed__content iframe, .embed__content img, .embed__content video { max-width: 100%; }
    .embed__frame { display: block; width: 100%; height: 150px; border: 0; pointer-events: none; }
    .embed__empty { display: grid; place-items: center; min-height: 8rem; margin: 0; padding: 1.5rem; text-align: center; opacity: 0.7;
      border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent); border-radius: var(--radius); }
  `,

  // Only in the editor: the frame tells its height, and the block grows or shrinks with it.
  js(el, p, api) {
    const frame = el.querySelector(".embed__frame");
    if (api.mode !== "editor" || !frame) return; // on the site the code sits directly in the page
    const win = el.ownerDocument.defaultView;
    const onMessage = (e) => {
      if (e.source !== frame.contentWindow || typeof e.data !== "number" || !Number.isFinite(e.data)) return;
      frame.style.height = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(e.data)))}px`;
    };
    win.addEventListener("message", onMessage);
    api.onStop(() => win.removeEventListener("message", onMessage));
  },
};
