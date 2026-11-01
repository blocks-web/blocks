import { html } from "../core/html.js";

const ID = /^[A-Za-z0-9_-]{11}$/;
const RATIOS = ["16-9", "4-3"];

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: {
    video: "YouTube video",
    wrong: "This address doesn't look like a YouTube video. Check that you copied all of it.",
    empty: "Paste the address of a YouTube video in the panel on the right.",
  },
  ro: {
    video: "Video YouTube",
    wrong: "Adresa nu pare un video YouTube. Verifică dacă ai copiat-o întreagă.",
    empty: "Lipește în panoul din dreapta adresa unui video de pe YouTube.",
  },
};

// The address as a URL (it also accepts “youtu.be/...” without https://), or null.
function toUrl(address) {
  const s = String(address ?? "").trim();
  if (!s) return null;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

// The id of a YouTube video, taken from its address. Anything else → null.
//   youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID, youtube.com/shorts/ID
function videoId(address) {
  const u = toUrl(address);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else id = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/)?.[1];
  }
  return id && ID.test(id) ? id : null;
}

// The starting second, from “?t=90”, “?t=1m30s” or “?start=90”.
function start(address) {
  const u = toUrl(address);
  const t = u && (u.searchParams.get("t") || u.searchParams.get("start"));
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
}

export default {
  name: "Video",
  category: "Text & images",
  icon: "video",
  description: "A YouTube video, placed on the page.",
  tip: "Paste the address exactly as it shows in your browser (“youtu.be/…” works too, and “?t=90” starts it at a given second); the editor shows a placeholder, and the video plays on the site.",

  props: {
    url: {
      type: "text",
      label: "Video address",
      default: "",
      help: "Copy the address from YouTube, for example https://www.youtube.com/watch?v=… or https://youtu.be/…",
    },
    title: { type: "text", label: "Title", default: "Video", help: "For screen readers: what the video is about." },
    ratio: {
      type: "choice",
      label: "Format",
      options: [
        { value: "16-9", label: "Wide (16:9)" },
        { value: "4-3", label: "Classic (4:3)" },
      ],
      default: "16-9",
    },
  },

  i18n: {
    ro: {
      name: "Video",
      category: "Text și imagini",
      description: "Un video de pe YouTube, pus în pagină.",
      tip: "Lipește adresa exact cum e în browser (merge și „youtu.be/…” sau cu „?t=90” ca să pornească de la o secundă anume); în editor apare un loc gol, video-ul pornește pe site.",
      props: {
        url: { label: "Adresa video-ului", help: "Copiază adresa de pe YouTube, de exemplu https://www.youtube.com/watch?v=… sau https://youtu.be/…" },
        title: { label: "Titlu", help: "Pentru cititoarele de ecran: despre ce e video-ul." },
        ratio: { label: "Format", options: { "16-9": "Lat (16:9)", "4-3": "Clasic (4:3)" } },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const id = videoId(p.url);
    const ratio = RATIOS.includes(p.ratio) ? p.ratio : "16-9";
    const editor = ctx.mode === "editor";
    if (!id && !editor) return "";

    let content;
    if (editor) {
      // No iframe in the editor: it would "swallow" the mouse and you couldn't move the block anymore.
      content = id
        ? html`<div class="video__placeholder"><span class="video__play" aria-hidden="true">▶</span><strong>${words.video}</strong><span>${id}</span></div>`
        : html`<div class="video__placeholder video__placeholder--empty"><strong>${words.video}</strong>
            <span>${p.url ? words.wrong : words.empty}</span>
          </div>`;
    } else {
      const second = start(p.url);
      const src = `https://www.youtube-nocookie.com/embed/${id}${second ? `?start=${second}` : ""}`;
      content = html`<iframe class="video__iframe" src="${src}" title="${p.title || words.video}" loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    }

    return html`<div class="b-block video">
      <div class="b-container">
        <div class="video__frame video__frame--${ratio} ${id ? "" : "video__frame--empty"}">${content}</div>
      </div>
    </div>`;
  },

  css: `
    .video { align-self: stretch; }
    .video__frame { position: relative; aspect-ratio: 16 / 9; overflow: hidden; border-radius: var(--radius); background: #1c1410; }
    .video__frame--4-3 { aspect-ratio: 4 / 3; }
    .video__frame.video__frame--empty { aspect-ratio: auto; min-height: 10rem; background: none; }
    .video__iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    /* On a canvas, when the block fills its cell (b-cell--fill), the frame takes the cell's size instead of 16:9. */
    .b-cell--fill .video, .b-cell--fill .video > .b-container { display: flex; flex-direction: column; flex: 1 1 auto; }
    .b-cell--fill .video__frame { flex: 1 1 auto; aspect-ratio: auto; }
    .video__placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 0.4rem; padding: 1rem; text-align: center; color: #fff;
      background: linear-gradient(135deg, #2b1d14, color-mix(in srgb, var(--primary) 55%, #1c1410)); }
    .video__placeholder span { opacity: 0.85; font-size: 0.95rem; max-width: 40ch; }
    .video__placeholder--empty { background: var(--surface); color: var(--text); border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    .video__placeholder .video__play { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; margin-bottom: 0.4rem; border-radius: 50%;
      background: rgba(255, 255, 255, 0.18); font-size: 1.4rem; }
  `,
};
