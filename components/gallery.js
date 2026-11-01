import { html, url } from "../core/html.js";

const COLUMNS = ["2", "3", "4"];

// What this block writes by itself, in the site's language: in html() from site.json → "lang", in js() from <html lang>.
const WORDS = {
  en: { empty: "Add images in the panel on the right.", gallery: "Gallery", close: "Close", previous: "Previous image", next: "Next image" },
  ro: {
    empty: "Adaugă imagini din panoul din dreapta.",
    gallery: "Galerie",
    close: "Închide",
    previous: "Imaginea anterioară",
    next: "Imaginea următoare",
  },
};

export default {
  name: "Gallery",
  category: "Text & images",
  icon: "gallery",
  description: "A grid of images; on the site, click an image to see it full size.",
  tip: "Photos are cropped square in the grid but show whole when opened; 6 or 9 images fill the rows exactly.",

  props: {
    title: { type: "text", label: "Title", default: "Gallery", help: "Optional." },
    columns: {
      type: "choice",
      label: "Images per row",
      options: [
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ],
      default: "3",
    },
    images: {
      type: "list",
      label: "Images",
      fields: {
        image: { type: "image", label: "Image", default: "" },
        description: { type: "text", label: "Description", default: "", help: "Shows under the enlarged image and helps screen readers." },
      },
      default: [
        { image: "/assets/demo/interior.svg", description: "The counter and the board with today's menu" },
        { image: "/assets/demo/latte-art.svg", description: "A cappuccino with a milk-foam heart" },
        { image: "/assets/demo/barista.svg", description: "Our espresso machine, ready for work" },
        { image: "/assets/demo/coffee-beans.svg", description: "Freshly roasted beans" },
        { image: "/assets/demo/terrace.svg", description: "The terrace on a sunny afternoon" },
        { image: "/assets/demo/carrot-cake.svg", description: "Carrot cake with cream cheese frosting" },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Galerie",
      category: "Text și imagini",
      description: "O grilă de imagini; pe site, apeși pe o imagine ca s-o vezi mare.",
      tip: "Pozele se decupează pătrat în grilă, dar se văd întregi când sunt deschise; 6 sau 9 imagini umplu rândurile exact.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        columns: { label: "Imagini pe rând" },
        images: {
          label: "Imagini",
          fields: {
            image: { label: "Imagine" },
            description: { label: "Descriere", help: "Apare sub imaginea mărită și ajută cititoarele de ecran." },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const columns = COLUMNS.includes(String(p.columns)) ? String(p.columns) : "3";
    const images = p.images.filter((i) => i.image);
    if (!images.length && ctx.mode !== "editor") return "";
    // Every image is a link to its file: without JavaScript it opens directly.
    return html`<div class="b-block gallery">
      <div class="b-container">
        ${p.title ? html`<h2 class="gallery__title">${p.title}</h2>` : ""}
        ${images.length
          ? html`<ul class="gallery__grid gallery__grid--${columns}">
              ${images.map(
                (img, i) => html`<li>
                  <a class="gallery__item" href="${url(img.image)}" data-index="${i}" data-description="${img.description}">
                    <img src="${url(img.image)}" alt="${img.description}" loading="lazy" decoding="async">
                  </a>
                </li>`,
              )}
            </ul>`
          : html`<p class="gallery__empty">${words.empty}</p>`}
      </div>
    </div>`;
  },

  css: `
    .gallery { align-self: stretch; }
    .gallery__title { margin-bottom: 1.25rem; }
    .gallery__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; list-style: none; margin: 0; padding: 0; }
    .gallery__grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .gallery__grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .gallery__item { display: block; overflow: hidden; border-radius: var(--radius); background: var(--surface); }
    .gallery__item img { width: 100%; aspect-ratio: 1; object-fit: cover; transition: transform 0.3s ease; }
    .gallery__item:hover img { transform: scale(1.04); }
    .gallery__item:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 60%, transparent); outline-offset: 3px; }
    .gallery__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @container (max-width: 720px) {
      .gallery__grid--3, .gallery__grid--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (prefers-reduced-motion: reduce) {
      .gallery__item img { transition: none; }
    }

    .gallery__lightbox { position: fixed; inset: 0; width: 100%; max-width: none; height: 100%; max-height: none; margin: 0;
      padding: 3.5rem 4.5rem; border: 0; background: transparent; color: #fff; touch-action: pan-y pinch-zoom; }
    .gallery__lightbox::backdrop { background: rgba(20, 14, 10, 0.92); }
    .gallery__lightbox[open] { display: flex; align-items: center; justify-content: center; }
    .gallery__figure { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; max-width: 100%; max-height: 100%; margin: 0; }
    .gallery__figure img { max-width: 100%; max-height: calc(100vh - 10rem); max-height: calc(100dvh - 10rem);
      width: auto; height: auto; object-fit: contain; border-radius: calc(var(--radius) * 0.6); }
    .gallery__figure figcaption { text-align: center; font-size: 0.95rem; }
    .gallery__counter { opacity: 0.75; margin-left: 0.5rem; font-variant-numeric: tabular-nums; }
    .gallery__btn { position: absolute; display: grid; place-items: center; width: 3rem; height: 3rem; padding: 0;
      border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.14); color: #fff; font: inherit; font-size: 1.6rem;
      line-height: 1; cursor: pointer; }
    .gallery__btn:hover { background: rgba(255, 255, 255, 0.26); }
    .gallery__btn:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
    .gallery__btn--close { top: 1rem; right: 1rem; font-size: 1.25rem; }
    .gallery__btn--previous { left: 1rem; top: 50%; transform: translateY(-50%); }
    .gallery__btn--next { right: 1rem; top: 50%; transform: translateY(-50%); }
    @media (max-width: 720px) {
      .gallery__lightbox { padding: 4rem 0.75rem 5.5rem; }
      .gallery__figure img { max-height: calc(100vh - 12rem); max-height: calc(100dvh - 12rem); }
      .gallery__btn--previous, .gallery__btn--next { top: auto; bottom: 1rem; transform: none; }
      .gallery__btn--previous { left: calc(50% - 3.5rem); }
      .gallery__btn--next { right: calc(50% - 3.5rem); }
    }
  `,

  js(el, p, api) {
    const links = [...el.querySelectorAll(".gallery__item")];
    if (!links.length) return;

    // In the editor nothing opens: a click selects the block.
    if (api.mode === "editor") {
      el.addEventListener("click", (e) => {
        if (e.target.closest && e.target.closest(".gallery__item")) e.preventDefault();
      });
      return;
    }

    const words = WORDS[el.ownerDocument?.documentElement?.lang === "ro" ? "ro" : "en"];
    let dialog = null;
    let image = null;
    let caption = null;
    let counter = null;
    let current = 0;
    let opener = null;
    let swiped = false;

    const button = (cls, label, symbol, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `gallery__btn ${cls}`;
      b.setAttribute("aria-label", label);
      b.textContent = symbol;
      b.addEventListener("click", fn);
      return b;
    };

    const show = (index) => {
      current = (index + links.length) % links.length;
      const a = links[current];
      image.src = a.getAttribute("href");
      image.alt = a.dataset.description || "";
      caption.firstChild.textContent = a.dataset.description || "";
      counter.textContent = links.length > 1 ? `${current + 1} / ${links.length}` : "";
    };

    const create = () => {
      dialog = document.createElement("dialog");
      dialog.className = "gallery__lightbox";
      dialog.setAttribute("aria-label", p.title || words.gallery);
      const figure = document.createElement("figure");
      figure.className = "gallery__figure";
      image = document.createElement("img");
      image.draggable = false;
      caption = document.createElement("figcaption");
      caption.append(document.createTextNode(""));
      counter = document.createElement("span");
      counter.className = "gallery__counter";
      caption.append(counter);
      figure.append(image, caption);
      dialog.append(button("gallery__btn--close", words.close, "✕", () => dialog.close()));
      dialog.append(figure);
      if (links.length > 1) {
        dialog.append(
          button("gallery__btn--previous", words.previous, "‹", () => show(current - 1)),
          button("gallery__btn--next", words.next, "›", () => show(current + 1)),
        );
      }
      // A click on the dark background closes it.
      dialog.addEventListener("click", (e) => {
        if (swiped) {
          swiped = false;
          return;
        }
        if (e.target === dialog || e.target === figure) dialog.close();
      });
      dialog.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft") show(current - 1);
        else if (e.key === "ArrowRight") show(current + 1);
      });
      // Swiping on a phone.
      let startX = null;
      dialog.addEventListener("pointerdown", (e) => {
        startX = e.clientX;
        swiped = false;
      });
      dialog.addEventListener("pointerup", (e) => {
        if (startX === null || links.length < 2) return;
        const dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) < 60) return;
        swiped = true; // the click that follows mustn't close it
        show(dx > 0 ? current - 1 : current + 1);
      });
      dialog.addEventListener("close", () => {
        document.documentElement.style.removeProperty("overflow");
        if (opener) opener.focus();
      });
      document.body.append(dialog);
    };

    el.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest(".gallery__item");
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (!dialog) create();
      opener = a;
      show(links.indexOf(a));
      document.documentElement.style.overflow = "hidden";
      if (!dialog.open) dialog.showModal();
    });

    api.onStop(() => {
      if (!dialog) return;
      opener = null;
      if (dialog.open) dialog.close();
      dialog.remove();
      document.documentElement.style.removeProperty("overflow");
    });
  },
};
