import { html, paragraphs } from "../core/html.js";

// Questions that open when clicked. It uses <details>, so it works without JavaScript too.

// What this block writes on the page by itself, in the site's language (site.json → "lang").
const WORDS = {
  en: { empty: "Add questions in the panel on the right." },
  ro: { empty: "Adaugă întrebări din panoul din dreapta." },
};

export default {
  name: "FAQ",
  category: "Lists",
  icon: "faq",
  description: "Questions and answers that open when clicked.",
  tip: "Write each question the way customers ask it on the phone (“Do you have oat milk?”); 5–8 questions are plenty, and the rest can go in a text block.",

  props: {
    title: { type: "text", label: "Title", default: "Frequently asked questions", help: "Optional." },
    questions: {
      type: "list",
      label: "Questions",
      fields: {
        question: { type: "text", label: "Question", default: "New question?" },
        answer: { type: "longtext", label: "Answer", default: "Write the answer here." },
      },
      default: [
        { question: "How soon will I hear back?", answer: "We usually reply the same day, or the next morning at the latest." },
        { question: "Where can I find you?", answer: "Our full address and opening hours are on the contact page." },
        { question: "Can I pay by card?", answer: "Yes, we take cards, cash and phone payments." },
      ],
    },
  },

  i18n: {
    ro: {
      name: "Întrebări frecvente",
      category: "Liste",
      description: "Întrebări și răspunsuri care se deschid la clic.",
      tip: "Scrie întrebarea exact cum o pun clienții la telefon („Aveți lapte vegetal?”); 5–8 întrebări sunt de ajuns, restul le pui în text.",
      props: {
        title: { label: "Titlu", help: "Opțional." },
        questions: {
          label: "Întrebări",
          fields: {
            question: { label: "Întrebare" },
            answer: { label: "Răspuns" },
          },
        },
      },
    },
  },

  html(p, ctx) {
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    const questions = p.questions.filter((q) => q.question);
    if (!questions.length && ctx.mode !== "editor") return "";
    return html`<div class="b-block faq">
      <div class="b-container">
        <div class="faq__inner">
          ${p.title ? html`<h2 class="faq__title">${p.title}</h2>` : ""}
          ${questions.length
            ? html`<div class="faq__list">
                ${questions.map(
                  (q) => html`<details class="faq__item">
                    <summary class="faq__question"><span>${q.question}</span><span class="faq__sign" aria-hidden="true"></span></summary>
                    <div class="faq__answer">${paragraphs(q.answer)}</div>
                  </details>`,
                )}
              </div>`
            : html`<p class="faq__empty">${words.empty}</p>`}
        </div>
      </div>
    </div>`;
  },

  css: `
    .faq { align-self: stretch; }
    .faq__inner { max-width: 760px; margin-inline: auto; }
    .faq__title { margin-bottom: 1.25rem; }
    .faq__list { display: flex; flex-direction: column; gap: 0.75rem; text-align: left; }
    .faq__item { color: var(--text); background: var(--surface); border-radius: var(--radius);
      border: 1px solid color-mix(in srgb, var(--text) 9%, transparent); }
    .faq__question { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      padding: 1rem 1.25rem; font-weight: 600; cursor: pointer; list-style: none; border-radius: var(--radius); }
    .faq__question::-webkit-details-marker { display: none; }
    .faq__question:hover { color: var(--primary); }
    .faq__question:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 60%, transparent); outline-offset: 2px; }
    .faq__sign { position: relative; flex: none; width: 1.75rem; height: 1.75rem; border-radius: 50%;
      background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); }
    .faq__sign::before, .faq__sign::after { content: ""; position: absolute; top: 50%; left: 50%;
      width: 0.75rem; height: 2px; margin: -1px 0 0 -0.375rem; border-radius: 2px; background: currentColor; transition: transform 0.2s ease; }
    .faq__sign::after { transform: rotate(90deg); }
    .faq__item[open] > .faq__question .faq__sign::after { transform: rotate(0deg); }
    .faq__answer { padding: 0 1.25rem 1.1rem; }
    .faq__answer > :last-child { margin-bottom: 0; }
    .faq__empty { padding: 1.5rem; text-align: center; opacity: 0.7; border: 2px dashed color-mix(in srgb, var(--text) 20%, transparent);
      border-radius: var(--radius); }
    @media (prefers-reduced-motion: reduce) {
      .faq__sign::before, .faq__sign::after { transition: none; }
    }
  `,
};
