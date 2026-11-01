// Safe HTML templates.
//
//   html`<h1>${p.title}</h1>`
//
// Everything you put inside ${...} is escaped automatically, so a title like <script> shows up
// as text and never runs. The exceptions are other html`...` pieces and raw(...), which count as
// trusted HTML. Lists (arrays) are joined together.

const SAFE = Symbol.for("blocks.html");

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export function escape(value) {
  return String(value ?? "").replace(/[&<>"'`]/g, (ch) => ESCAPES[ch]);
}

function safe(value) {
  return { [SAFE]: true, value, toString: () => value };
}

export function isSafe(value) {
  return value != null && value[SAFE] === true;
}

function toHtml(value) {
  if (value == null || value === false) return "";
  if (isSafe(value)) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join("");
  return escape(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return safe(out);
}

// Trusted HTML, inserted exactly as it is. Only use it for markup you wrote yourself.
export function raw(value) {
  return safe(value == null ? "" : String(value));
}

// Safe links: blocks "javascript:" and other schemes that can run code.
// Images written as data:image/... are allowed.
export function url(value) {
  const s = String(value ?? "").trim();
  const compact = s.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
  if (compact.startsWith("data:image/")) return s;
  if (/^(javascript|vbscript|data|file):/.test(compact)) return "#";
  return s;
}

// Formatting inside text, with three marks anyone can type:
//   **bold**   *italic*   [text](address)
// Everything else stays text (escaped). A mark without its pair, or a pair that spans a line
// break, stays as written ("5 * 3" makes nothing italic). Marks don't nest inside each other.
// Addresses go through url(); the ones that point to another site open in a new tab.
//   inline("Come *today*") → Come <em>today</em>
const MARKUP = /\[([^[\]\n]+)\]\(((?:[^\s()]|\([^\s()]*\))+)\)|\*\*([^*\s](?:[^*\n]*?[^*\s])?)\*\*|\*([^*\s](?:[^*\n]*?[^*\s])?)\*/g;
const EXTERNAL = /^(https?:)?\/\//i;

export function inline(text) {
  const s = String(text ?? "");
  const parts = [];
  let last = 0;
  for (const m of s.matchAll(MARKUP)) {
    parts.push(s.slice(last, m.index));
    if (m[1] !== undefined) {
      const address = url(m[2]);
      parts.push(html`<a href="${address}"${EXTERNAL.test(address) ? raw(' target="_blank" rel="noopener"') : ""}>${m[1]}</a>`);
    } else if (m[3] !== undefined) parts.push(html`<strong>${m[3]}</strong>`);
    else parts.push(html`<em>${m[4]}</em>`);
    last = m.index + m[0].length;
  }
  parts.push(s.slice(last));
  return html`${parts}`;
}

// Text with empty lines between paragraphs → <p>...</p>. A single Enter becomes <br>.
// Lines that start with "- " become a list (<ul><li>), one under the other, anywhere in a paragraph.
// Every line goes through inline(), so **bold**, *italic* and [link](address) work everywhere.
//   paragraphs("We have:\n- coffee\n- tea") → <p>We have:</p><ul><li>coffee</li><li>tea</li></ul>
const LIST_ITEM = /^\s*-\s+(\S.*?)\s*$/;

export function paragraphs(text) {
  const blocks = String(text ?? "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const out = [];
  for (const block of blocks) {
    // A paragraph can mix plain lines and list lines; each run of the same kind becomes one element.
    let lines = [];
    let items = [];
    const flush = () => {
      if (lines.length) out.push(html`<p>${lines.map((line, i) => (i ? [raw("<br>"), inline(line)] : inline(line)))}</p>`);
      if (items.length) out.push(html`<ul>${items.map((item) => html`<li>${inline(item)}</li>`)}</ul>`);
      lines = [];
      items = [];
    };
    for (const line of block.split("\n")) {
      const m = line.match(LIST_ITEM);
      if (m && lines.length) flush();
      if (!m && items.length) flush();
      if (m) items.push(m[1]);
      else lines.push(line);
    }
    flush();
  }
  return out;
}

// Lowercase text without accents: "Sâmbătă" → "sambata" (searches, comparisons, file names).
export function fold(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// "1 block", "3 blocks". In Romanian ("ro"), from 20 on the word "de" comes in between:
// "1 bloc", "3 blocuri", "20 de blocuri".
export function plural(n, one, many, lang = "en") {
  if (n === 1) return `1 ${one}`;
  const rest = n % 100;
  const of = lang === "ro" && n !== 0 && (rest === 0 || rest >= 20) ? "de " : "";
  return `${n} ${of}${many}`;
}

// A "YYYY-MM-DD" date (as a "date" field gives it) → "December 22, 2025", or "22 decembrie 2025"
// with lang "ro". Anything else → "".
const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ro: ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"],
};

export function formatDate(value, lang = "en") {
  const m = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const [year, month, day] = m.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return "";
  const names = lang === "ro" ? MONTHS.ro : MONTHS.en;
  return lang === "ro" ? `${day} ${names[month - 1]} ${year}` : `${names[month - 1]} ${day}, ${year}`;
}
