// The server side of the form. It never reaches the browser.
//
//   POST /api/c/form/submit   { page: "/contact", block: "b_x", values: ["Ana", "ana@example.com", ...], website: "" }
//
// The visitor only sends the values. The fields (label, kind, required, choices) are read from the page,
// on disk, through ctx.block: only a form the visitor really sees (not one on a members-only page, in a hidden
// area or in "Members only", when they aren't logged in). Every value is checked by the kind of its field,
// cleaned of control characters and saved as text in data/messages.json.

import { withDefaults } from "../core/render.js";

const WINDOW = 10; // minutes
const SENT_MAX = 5; // messages sent within the window, from the same address (IPv6: the same /64 network)
const TRIES_MAX = 30; // attempts within the window (wrong ones too), from the same address
const PER_HOUR = 100; // messages received in an hour, from all visitors together
const MAX_MESSAGES = 10_000; // after this many, the form stops until you move the old ones away

const BLOCK_ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()./\s-]*$/;
const LENGTHS = { text: 200, email: 200, phone: 40, longtext: 5000, choice: 200 };

// What the form says to visitors, in the site's language (site.json → "lang"). `name` arrives already in quotes.
const WORDS = {
  en: {
    gone: "This form is no longer on the page. Reload the page and try again.",
    noFields: "This form has no fields.",
    tick: (name) => `Please check ${name}.`,
    choose: (name) => `Please choose an option for ${name}.`,
    fill: (name) => `Please fill in ${name}.`,
    tooLong: (name, max) => `${name} is too long (${max} characters at most).`,
    email: (name) => `${name} doesn't look like a valid email address.`,
    phone: (name) => `${name} can only contain digits, spaces and + ( ) - . /`,
    full: "We can't take messages here right now. You'll find our contact details on the site.",
    tooMany: "You've already sent a few messages. Please try again in a few minutes.",
    busy: "We've received a lot of messages in the last hour. Please try again later.",
    quote: (text) => `“${text}”`,
    yes: "yes",
    no: "no",
  },
  ro: {
    gone: "Formularul nu mai există pe pagină. Reîncarcă pagina și încearcă din nou.",
    noFields: "Formularul nu are niciun câmp.",
    tick: (name) => `Bifează ${name}.`,
    choose: (name) => `Alege o variantă la ${name}.`,
    fill: (name) => `Completează ${name}.`,
    tooLong: (name, max) => `Textul de la ${name} e prea lung (cel mult ${max} de caractere).`,
    email: (name) => `${name} nu pare o adresă de email corectă.`,
    phone: (name) => `${name} poate avea doar cifre, spații și semnele + ( ) - . /`,
    full: "Momentan nu putem primi mesaje de aici. Ne găsești la datele de contact de pe site.",
    tooMany: "Ai trimis deja câteva mesaje. Te rugăm să încerci din nou peste câteva minute.",
    busy: "Am primit foarte multe mesaje în ultima oră. Te rugăm să încerci din nou mai târziu.",
    quote: (text) => `„${text}”`,
    yes: "da",
    no: "nu",
  },
};

// Invisible characters that change how text looks: direction (e.g. U+202E turns the line right to left),
// zero width, BOM. A visitor doesn't get to decide how the owner reads their messages.
const INVISIBLE = /[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

// Clean text, without control characters (no terminal sequences reach `node blocks.js messages`) and
// without the invisible ones above. On one line: any whitespace becomes a single space; on several
// lines, only the line breaks stay.
function clean(value, multiline) {
  const s = typeof value === "string" ? value : "";
  const lines = s.replace(/\r\n?/g, "\n").replace(/[\u2028\u2029]/g, "\n").replace(INVISIBLE, "");
  return multiline
    ? lines.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, "").trim()
    : lines.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
}

// The same rules as in form.js: fields without a label are skipped, their position stays; the choices come from commas.
const fieldsOf = (props) => props.fields.map((f, i) => ({ ...f, i })).filter((f) => String(f.label ?? "").trim());
const choicesOf = (text) => String(text ?? "").split(",").map((v) => v.trim()).filter(Boolean);

// The checked value of a field, or an error for a human.
function check(field, input, words, error) {
  const name = words.quote(clean(field.label));
  const kind = Object.hasOwn(LENGTHS, field.type) || field.type === "checkbox" ? field.type : "text";
  if (kind === "checkbox") {
    const ticked = input === true;
    if (field.required && !ticked) error(400, words.tick(name));
    return ticked;
  }
  let value = clean(input, kind === "longtext");
  if (!value) {
    if (field.required) error(400, kind === "choice" ? words.choose(name) : words.fill(name));
    return "";
  }
  if (value.length > LENGTHS[kind]) error(400, words.tooLong(name, LENGTHS[kind]));
  if (kind === "email") {
    value = value.toLowerCase();
    if (!EMAIL.test(value)) error(400, words.email(name));
  }
  if (kind === "phone" && !PHONE.test(value)) error(400, words.phone(name));
  if (kind === "choice" && !choicesOf(field.options).includes(value)) error(400, words.choose(name));
  return value;
}

let full = false; // the warning about a full data/messages.json shows only once in the terminal

export default {
  "POST /submit": async (request, ctx) => {
    const body = request.body;
    const words = WORDS[ctx.site?.lang === "ro" ? "ro" : "en"];
    // Every attempt counts (wrong ones too, which read the page from disk); messages sent, separately.
    ctx.limit({ name: "tries", max: TRIES_MAX, minutes: WINDOW });
    const sent = { name: "messages", max: SENT_MAX, minutes: WINDOW, message: words.tooMany };

    // The hidden field is filled in only by robots: we say "thank you" and save nothing.
    if (clean(body.website)) {
      ctx.limit(sent);
      return { ok: true };
    }

    const id = typeof body.block === "string" && BLOCK_ID.test(body.block) ? body.block : null;
    const found = id && typeof body.page === "string" ? await ctx.block(body.page, id) : null;
    if (!found) ctx.error(404, words.gone);

    const props = withDefaults(found.component, found.block.props);
    const fields = fieldsOf(props);
    if (!fields.length) ctx.error(404, words.noFields);
    const values = Array.isArray(body.values) ? body.values : [];
    const answers = fields.map((field) => ({
      label: clean(field.label),
      value: check(field, values[field.i], words, ctx.error),
    }));

    const messages = ctx.data("messages");
    if (messages.count() >= MAX_MESSAGES) {
      if (!full) {
        console.warn(
          `[blocks] data/messages.json has ${MAX_MESSAGES} messages: the form won't take any more until you move the file ` +
            "somewhere else (read it with node blocks.js messages).",
        );
      }
      full = true;
      ctx.error(503, words.full);
    }
    ctx.limit(sent);
    ctx.limit({ name: "site", max: PER_HOUR, minutes: 60, allVisitors: true, message: words.busy });
    // Next to the labeled answers, the fields `node blocks.js messages` shows: the name, email and phone
    // from the first field of their kind, and the message with all the answers.
    const first = (kind) => answers[fields.findIndex((f) => f.type === kind)]?.value || "";
    messages.add({
      form: clean(props.title),
      page: found.path,
      answers,
      name: first("text"),
      email: first("email"),
      phone: first("phone"),
      message: answers.map((a) => `${a.label}: ${a.value === true ? words.yes : a.value === false ? words.no : a.value}`).join("\n"),
    });
    return { ok: true };
  },
};
