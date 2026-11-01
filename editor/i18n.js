// The editor's words: English (the source) or Romanian.
//
//   t("Saved")                                → "Saved" / "Salvat"
//   t("Deleted “{name}”.", { name })           → the {placeholders} filled in
//   tn(n, "{n} block", "{n} blocks")          → "1 block", "3 blocks" / "1 bloc", "3 blocuri", "20 de blocuri"
//   quote(text)                               → “text” / „text”
//
// Every text the editor shows goes through t() or tn(), with the English text written right there,
// as a literal (so a test can find it). RO holds the Romanian for each one, keyed by the English
// text; the test fails when one is missing. index.html and canvas.html mark their texts with data-t
// (the element's text) and data-t-attr="title aria-label" (those attributes): translateStatic().
//
// The language is chosen per browser (localStorage, "blocks.lang"): "en" by default, or "ro". The
// editor reloads to apply a change everywhere (the switch in the top bar saves first).
//
// What comes out is plain text: the editor puts it in text nodes (h(), textContent) or escapes it.
// The values in {placeholders} are plain text too.

export const LANGS = ["en", "ro"];
const STORAGE_KEY = "blocks.lang";

function readLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "ro" ? "ro" : "en";
  } catch {
    return "en"; // no storage (Node, a blocked browser): English
  }
}

let lang = readLang();

export const getLang = () => lang;

// Remembers the language for this browser. Returns the language that was set.
export function setLang(next) {
  lang = LANGS.includes(next) ? next : "en";
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage isn't available: the choice lasts until the page reloads
  }
  return lang;
}

function fill(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (m, key) => (values && Object.hasOwn(values, key) ? String(values[key]) : m));
}

export function t(text, values) {
  return fill(lang === "ro" && Object.hasOwn(RO, text) ? RO[text] : text, values);
}

// The form for n (one: n === 1, many: anything else), with {n} filled in. In Romanian, from 20 on,
// "de" comes between the number and the word ("20 de blocuri", as plural() in core/html.js), so every
// Romanian form has {n} right before its word.
export function tn(n, one, many, values = {}) {
  const form = n === 1 ? one : many;
  const ro = lang === "ro";
  const rest = Math.abs(n) % 100;
  const number = ro && n !== 0 && (rest === 0 || rest >= 20) ? `${n} de` : String(n);
  return fill(ro && Object.hasOwn(RO, form) ? RO[form] : form, { ...values, n: number });
}

// A name in quotes, the way the language writes them.
export const quote = (text) => t("“{text}”", { text });

// "a, b and c" in the editor's language.
export function joinList(items) {
  const list = items.map(String);
  try {
    return new Intl.ListFormat(lang, { type: "conjunction" }).format(list);
  } catch {
    return list.join(", ");
  }
}

// The texts written in an HTML page (in English): data-t translates the element's own text (an
// element with only text in it), data-t-attr="title aria-label placeholder" the listed attributes.
export function translateStatic(root) {
  for (const el of root.querySelectorAll("[data-t]")) el.textContent = t(el.textContent.trim());
  for (const el of root.querySelectorAll("[data-t-attr]")) {
    for (const name of el.getAttribute("data-t-attr").split(/\s+/).filter(Boolean)) {
      const value = el.getAttribute(name);
      if (value) el.setAttribute(name, t(value));
    }
  }
}

// ---- The blocks' own words ----
// A component can carry its Romanian texts:
//   i18n: { ro: { name, description, tip, category,
//                 props: { key: { label, help, options: { value: label }, fields: { key: { … } } } },
//                 slots: { key: label } } }
// In Romanian the editor shows them and falls back to English for anything missing. Default content
// (`default`) is never translated: it's the visitor's text, written in the site's language.

const own = (o, key) => (o && typeof o === "object" && Object.hasOwn(o, key) ? o[key] : undefined);
const asObject = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const asText = (v) => (typeof v === "string" && v.trim() ? v : null);

function romanian(comp) {
  if (lang !== "ro") return null;
  try {
    return asObject(own(asObject(comp?.i18n), "ro"));
  } catch {
    return null; // a getter that throws in a component: English
  }
}

// One of the component's texts (name, description, tip, category), in the editor's language.
export function blockText(comp, key) {
  const local = asText(own(romanian(comp), key));
  if (local) return local;
  const value = comp?.[key];
  return typeof value === "string" ? value : "";
}

// The label of an area (slot), in the editor's language; its key if it has no label.
export function slotLabel(comp, name) {
  const local = asText(own(asObject(own(romanian(comp), "slots")), name));
  if (local) return local;
  const label = own(asObject(comp?.slots), name);
  return String(label ?? name);
}

// The component's `props`, with the labels, help texts and option labels in the editor's language
// (also for the fields of a list). Everything else (type, default, min, max, …) stays as it is.
export function blockFields(comp) {
  return localFields(asObject(comp?.props) || {}, asObject(own(romanian(comp), "props")));
}

function localFields(fields, ro) {
  const out = {};
  for (const [key, field] of Object.entries(fields)) out[key] = localField(field, asObject(own(ro, key)));
  return out;
}

function localField(field, ro) {
  if (!ro || !field || typeof field !== "object") return field;
  const out = { ...field };
  if (asText(ro.label)) out.label = ro.label;
  if (asText(ro.help)) out.help = ro.help;
  const options = asObject(ro.options);
  if (options && Array.isArray(field.options)) {
    out.options = field.options.map((o) => {
      const value = o && typeof o === "object" ? o.value : o;
      const label = asText(own(options, String(value ?? "")));
      return label ? { value: value ?? "", label } : o;
    });
  }
  const sub = asObject(ro.fields);
  if (sub && asObject(field.fields)) out.fields = localFields(field.fields, sub);
  return out;
}

// ---- Searching in Romanian ----
// The everyday Romanian words for the bundled blocks, by block id (without accents, as fold() gives
// them), added to the English ones (registry.js) when the editor speaks Romanian.
export const RO_SYNONYMS = {
  gallery: "galerie poze fotografii album",
  image: "imagine poza fotografie foto",
  logos: "sigle logo logouri parteneri sponsori",
  hours: "program orar ore deschidere",
  pricing: "preturi tarife meniu oferta",
  map: "harta adresa locatie",
  locations: "locatii harta adrese",
  social: "retele facebook instagram",
  faq: "intrebari raspunsuri",
  events: "evenimente agenda calendar",
  team: "echipa oameni angajati",
  form: "formular rezervare contact mesaj",
  hero: "erou banner cap coperta",
  cta: "indemn apel",
  navbar: "meniu navigare bara sus",
  login: "logare autentificare conectare",
  signup: "inscriere cont nou",
  quote: "recenzie recenzii parere testimonial",
  embed: "widget iframe cod",
  news: "noutati anunturi",
};

// ---- Romanian ----
// Keyed by the English text, exactly as it's written in the code (and in core/render.js for the
// core's editor texts). Romanian quotes are „…”, and ș ț have a comma below.
export const RO = {
  // The core's editor texts (core/render.js, through renderParts({ t }))
  "Drag a block here": "Trage un bloc aici",
  "Drag a block into “{label}”": "Trage un bloc în „{label}”",
  "Drag a block here, then place it anywhere and drag its corners to make it bigger.": "Trage un bloc aici, apoi așază-l oriunde și trage de colțuri ca să-l mărești.",
  "The “{type}” block no longer exists: remove it from the page or put the file components/{type}.js back.":
    "Blocul „{type}” nu mai există: șterge-l din pagină sau pune la loc fișierul components/{type}.js.",
  "The “{name}” block couldn't be displayed: {error}. It doesn't show on the site; its code is in components/{type}.js.":
    "Blocul „{name}” nu s-a putut afișa: {error}. Pe site nu apare; codul lui e în components/{type}.js.",

  // Little words
  "“{text}”": "„{text}”",
  "— choose —": "— alege —",
  "{value} (unknown)": "{value} (necunoscută)",
  "{type} (missing)": "{type} (lipsește)",
  "{path} (doesn't exist yet)": "{path} (nu există încă)",
  "{label}, code": "{label}, cod",
  "between {min} and {max}": "între {min} și {max}",
  "at least {min}": "cel puțin {min}",
  "at most {max}": "cel mult {max}",
  "{n} block": "{n} bloc",
  "{n} blocks": "{n} blocuri",
  "{n} column": "{n} coloană",
  "{n} columns": "{n} coloane",
  "{n} row": "{n} rând",
  "{n} rows": "{n} rânduri",
  "Item {n}": "Element {n}",
  empty: "gol",
  members: "membri",
  server: "server",
  Block: "Bloc",

  // The top bar
  "Blocks – the editor": "Blocks – editorul",
  "Choose the page you're editing": "Alege pagina pe care o editezi",
  "New page": "Pagină nouă",
  "New page…": "Pagină nouă…",
  "Screen width": "Lățimea ecranului",
  Desktop: "Desktop",
  "Desktop (the full width, at least 1024 px)": "Desktop (toată lățimea, cel puțin 1024 px)",
  Tablet: "Tabletă",
  "Tablet (768 px)": "Tabletă (768 px)",
  Phone: "Telefon",
  "Phone (390 px)": "Telefon (390 px)",
  Undo: "Anulează",
  Redo: "Refă",
  "Undo the last change ({keys})": "Anulează ultima modificare ({keys})",
  "Redo ({keys})": "Refă ({keys})",
  "The editor's language": "Limba editorului",
  "Site settings": "Setări site",
  "View page": "Vezi pagina",
  Saved: "Salvat",
  "Saving…": "Se salvează…",
  "Unsaved changes": "Modificări nesalvate",
  "Couldn't save — trying again": "Eroare la salvare — reîncerc",
  "{message} Click to try again now.": "{message} Dă clic ca să reîncerci acum.",
  "The server isn't answering.": "Serverul nu răspunde.",
  "It saves by itself in a moment ({keys} to save now).": "Se salvează singur în câteva clipe ({keys} ca să salvezi acum).",
  "Everything is saved in {file}": "Totul e salvat în {file}",
  "File: {file}": "Fișierul: {file}",
  "Loading…": "Se încarcă…",
  "on every page": "pe toate paginile",
  Pages: "Pagini",
  "Only for logged-in members": "Doar pentru membrii intrați în cont",
  "Shared by every page": "Comune pe toate paginile",
  Header: "Antet",
  Footer: "Subsol",
  "above every page": "deasupra fiecărei pagini",
  "below every page": "sub fiecare pagină",

  // The left panel: the palette, Structure, the "+" menu, the preview card
  "Blocks and structure": "Blocuri și structură",
  "Left panel": "Panoul din stânga",
  Blocks: "Blocuri",
  Structure: "Structură",
  "Search for a block…": "Caută un bloc…",
  "Search for a block": "Caută un bloc",
  "The page's blocks": "Blocurile paginii",
  "My blocks": "Blocurile mele",
  Sections: "Secțiuni",
  "Text & images": "Text și imagini",
  Lists: "Liste",
  Contact: "Contact",
  Members: "Membri",
  Page: "Pagină",
  "There are no blocks yet": "Încă nu există blocuri",
  "There are no blocks yet.": "Încă nu există blocuri.",
  "A programmer can create one with:": "Un programator poate crea unul cu:",
  "Nothing for “{query}”": "Nimic pentru „{query}”",
  "Nothing for “{query}”.": "Nimic pentru „{query}”.",
  "Try another word, for example “text” or “image”.": "Încearcă alt cuvânt, de exemplu „text” sau „imagine”.",
  "Drag a block onto the page, or press + where you want it.": "Trage un bloc în pagină sau apasă + acolo unde îl vrei.",
  "It only works on a site published with a server.": "Merge doar pe un site publicat cu server.",
  "Add a block": "Adaugă un bloc",
  "Add a block here": "Adaugă un bloc aici",
  "No description. Add one in components/{type}.js (description, tip).": "Fără descriere. Adaug-o în components/{type}.js (description, tip).",
  Settings: "Setări",
  "Click or press Enter: it goes where you pressed +.": "Dă clic sau apasă Enter: intră unde ai apăsat +.",
  "Drag it onto the page or click: it goes after the selected block.": "Trage-l în pagină sau dă clic: intră după blocul selectat.",
  "Drag it onto the page or click: it goes at the end of the page.": "Trage-l în pagină sau dă clic: intră la sfârșitul paginii.",
  "Drag it onto the page or click: it goes at the end of the header.": "Trage-l în pagină sau dă clic: intră la sfârșitul antetului.",
  "Drag it onto the page or click: it goes at the end of the footer.": "Trage-l în pagină sau dă clic: intră la sfârșitul subsolului.",
  "The page is empty": "Pagina e goală",
  "The header is empty": "Antetul e gol",
  "The footer is empty": "Subsolul e gol",
  "Drag a block from “Blocks” or press +.": "Trage un bloc din „Blocuri” sau apasă +.",
  "Edit the shared header (it shows on every page)": "Editează antetul comun (apare pe toate paginile)",
  "Edit the shared footer (it shows on every page)": "Editează subsolul comun (apare pe toate paginile)",
  "Shared header": "Antet comun",
  "Shared footer": "Subsol comun",
  "Show what's inside": "Arată conținutul",
  "Hide what's inside": "Ascunde conținutul",
  "“{block}” doesn't show “{area}” right now (see the block's settings), so the blocks here don't show on the page. Move them somewhere else.":
    "„{block}” nu afișează acum „{area}” (vezi setările blocului), așa că blocurile de aici nu apar pe pagină. Mută-le în altă parte.",
  "not on the page": "nu apare pe pagină",
  "Empty — drag here": "Încă nimic — trage aici",
  "Stays here": "Rămâne aici",
  "At the start of the page": "La începutul paginii",
  "At the end of the page": "La sfârșitul paginii",
  "At the start of the header": "La începutul antetului",
  "At the end of the header": "La sfârșitul antetului",
  "At the start of the footer": "La începutul subsolului",
  "At the end of the footer": "La sfârșitul subsolului",
  "In “{area}” · {block}": "În „{area}” · {block}",

  // The canvas
  "Page being edited": "Pagina în lucru",
  "Loading the editor…": "Se încarcă editorul…",
  "Scaled down to fit ({percent}%)": "Micșorat ca să încapă ({percent}%)",
  "You're editing the shared header": "Editezi antetul comun",
  "You're editing the shared footer": "Editezi subsolul comun",
  "— it shows on every page of the site.": "— apare pe toate paginile site-ului.",
  "Back to “{page}”": "Înapoi la „{page}”",
  "Members-only page": "Pagină doar pentru membri",
  "— people who aren't logged in are sent to the login page.": "— cine n-a intrat în cont ajunge la pagina de intrare în cont.",
  "The page is empty.": "Pagina e goală.",
  "The header is empty.": "Antetul e gol.",
  "The footer is empty.": "Subsolul e gol.",
  "Drag to move the block": "Trage ca să muți blocul",
  "Select the block it's in": "Selectează blocul în care stă",
  "Move up (Alt+↑; also into and out of other blocks)": "Mută mai sus (Alt+↑; și în / din alte blocuri)",
  "Move down (Alt+↓; also into and out of other blocks)": "Mută mai jos (Alt+↓; și în / din alte blocuri)",
  "Bring to front": "Adu în față",
  "Send to back": "Trimite în spate",
  Duplicate: "Duplică",
  Delete: "Șterge",
  "It doesn't overlap another block": "Nu se suprapune cu alt bloc",
  "Shared header — click to edit it": "Antet comun — dă clic ca să-l editezi",
  "Shared footer — click to edit it": "Subsol comun — dă clic ca să-l editezi",
  "The “{id}” block couldn't load: {error}. It doesn't show on the site until you fix the file.":
    "Blocul „{id}” nu s-a putut încărca: {error}. Pe site nu apare până repari fișierul.",
  "Drag a block here or press +. Then move it anywhere and drag its corners to make it bigger.":
    "Trage un bloc aici sau apasă +. Apoi îl muți oriunde și tragi de colțuri ca să-l mărești.",
  "Drag a block from the left or press +": "Trage un bloc din stânga sau apasă +",
  "Drag a block into “{area}” or press +": "Trage un bloc în „{area}” sau apasă +",
  "The page couldn't be displayed: {error}": "Pagina nu a putut fi afișată: {error}",
  "At the end of the canvas": "La sfârșitul pânzei",
  "Column {x} · row {y}": "Coloana {x} · rândul {y}",
  "On “{block}”": "Pe „{block}”",
  "On a phone, the blocks stack one under the other, in reading order.": "Pe telefon, blocurile se așază unul sub altul, în ordinea de citire.",
  "The canvas is narrow here, so the blocks stack one under the other, in reading order.":
    "Pânza e îngustă aici, așa că blocurile se așază unul sub altul, în ordinea de citire.",
  "The editor needs a wider screen": "Editorul are nevoie de un ecran mai lat",
  "Open it on a computer or a tablet. Your site looks good on phones too.": "Deschide-l pe calculator sau pe o tabletă. Site-ul tău arată bine și pe telefon.",

  // The settings panel: a block
  "Where the block is": "Unde se află blocul",
  "Move off canvas": "Scoate din pânză",
  "Alt+↓; Alt+↑ puts it just above": "Alt+↓; cu Alt+↑ ajunge chiar deasupra pânzei",
  "Move the block off the canvas, to just below it": "Scoate blocul din pânză, sub ea",
  Up: "Mută sus",
  Down: "Mută jos",
  "Move the block up": "Mută mai sus",
  "Move the block down": "Mută mai jos",
  "Alt+↑; also into and out of other blocks": "Alt+↑; și în / din alte blocuri",
  "Alt+↓; also into and out of other blocks": "Alt+↓; și în / din alte blocuri",
  "This block doesn't show on the page": "Blocul nu apare pe pagină",
  "It's in “{area}” of “{block}”, which that block doesn't show right now (see its settings). Move the block somewhere else to make it show.":
    "E în „{area}” din „{block}”, pe care acesta nu o afișează acum (vezi setările lui). Mută blocul în altă parte ca să apară.",
  "Something is misspelled in components/{type}.js": "Ceva e scris greșit în components/{type}.js",
  "This block has an error": "Blocul are o eroare",
  "This block no longer exists": "Blocul nu mai există",
  "Its file, components/{type}.js, is no longer in the project. Delete the block from the page or put the file back.":
    "Fișierul lui, components/{type}.js, nu mai e în proiect. Șterge blocul din pagină sau pune fișierul la loc.",
  "This block has no settings.": "Blocul acesta nu are setări.",
  "On the canvas you put blocks anywhere: drag them here, move them where you like and drag their corners to make them bigger. Everything snaps to an invisible grid.":
    "Pe pânză pui blocurile oriunde: trage-le aici, mută-le unde vrei și trage de colțuri ca să le mărești. Totul se lipește de o grilă invizibilă.",
  "You can put other blocks inside this one: drag them into the dotted areas on the page, or press + there.":
    "În blocul acesta poți pune alte blocuri: trage-le în zonele punctate din pagină sau apasă + acolo.",
  Placement: "Așezare",
  "On a phone, the blocks stack one under the other, in reading order. The place and size here are for big screens.":
    "Pe telefon, blocurile se așază unul sub altul, în ordinea de citire. Locul și mărimea de aici sunt pentru ecranele mari.",
  Column: "Coloană",
  Row: "Rând",
  Width: "Lățime",
  Height: "Înălțime",
  "The grid has 12 columns. The arrow keys move the block one step at a time; Shift + arrows change its size.":
    "Grila are 12 coloane. Săgețile mută blocul câte un pas; Shift + săgeți îi schimbă mărimea.",
  Shape: "Formă",
  Rectangle: "Dreptunghi",
  "Rounded corners": "Colțuri rotunjite",
  Circle: "Cerc",
  "The image fills the box": "Imaginea umple caseta",
  "The image covers the whole box; its edges are cut off if needed.": "Imaginea acoperă toată caseta; marginile ei se taie dacă e nevoie.",
  Layer: "Strat",
  "Put the block above the ones it overlaps": "Pune blocul deasupra celor cu care se suprapune",
  "Put the block under the ones it overlaps": "Pune blocul sub cele cu care se suprapune",
  "They work when the block overlaps another one.": "Merg când blocul se suprapune cu altul.",

  // The settings panel: the fields
  "HTML code. It goes into the page exactly as written, so only paste code you trust.":
    "Cod HTML. Intră în pagină exact cum e scris, așa că lipește doar cod în care ai încredere.",
  "**bold**, *italic*, [text](address)": "**îngroșat**, *înclinat*, [text](adresă)",
  "Unknown type (“{type}”), edited as text.": "Tip necunoscut („{type}”), editat ca text.",
  Formatting: "Formatare",
  Bold: "Îngroșat",
  Italic: "Înclinat",
  Link: "Link",
  "Clear the date": "Șterge data",
  "Pick the color": "Alege culoarea",
  "/assets/... or https://...": "/assets/... sau https://...",
  "/page or https://...": "/pagina sau https://...",
  "Upload an image": "Încarcă o imagine",
  "Remove the image": "Scoate imaginea",
  "The image doesn't load": "Imaginea nu se încarcă",
  "No image yet. Upload one or drag a file here.": "Încă nu e nicio imagine. Încarcă una sau trage un fișier aici.",
  "Choose an image (png, jpg, gif, webp or avif).": "Alege o imagine (png, jpg, gif, webp sau avif).",
  "The image is too big: 10 MB at most.": "Imaginea e prea mare: cel mult 10 MB.",
  "Uploading…": "Se încarcă…",
  "the server didn't send the image's address.": "serverul nu a trimis adresa imaginii.",
  "The image is uploaded.": "Imaginea a fost încărcată.",
  "Couldn't upload the image: {error}": "Nu am putut încărca imaginea: {error}",
  "Move up": "Mută mai sus",
  "Move down": "Mută mai jos",
  "Delete the item": "Șterge elementul",
  "No items yet.": "Niciun element încă.",
  "Add an item": "Adaugă un element",

  // The settings panel: the page and the shared zones
  "Page settings": "Setări pagină",
  "Click a block on the page to change its text, images and colors.": "Dă clic pe un bloc din pagină ca să-i schimbi textele, imaginile și culorile.",
  Title: "Titlu",
  "It shows in the browser tab and in Google results.": "Apare în fila browserului și în rezultatele Google.",
  Description: "Descriere",
  "A short sentence for search engines.": "O frază scurtă pentru motoarele de căutare.",
  "Who can see it": "Cine o poate vedea",
  Everyone: "Public",
  "Members only (logged in)": "Doar membri (intrați în cont)",
  "People who aren't logged in are sent to the login page ({path}).": "Cine n-a intrat în cont ajunge la pagina de intrare în cont ({path}).",
  "Anyone with the page's address can see it.": "Oricine are adresa paginii o poate vedea.",
  "Show the shared header and footer": "Arată antetul și subsolul comune",
  Address: "Adresă",
  Open: "Deschide",
  "Delete page": "Șterge pagina",
  "The home page (/) can't be deleted.": "Prima pagină (/) nu poate fi ștearsă.",
  "Above every page": "Deasupra fiecărei pagini",
  "Below every page": "Sub fiecare pagină",
  "The header shows on every page of the site. What you change here shows everywhere, so the menu and the contact details are edited only once.":
    "Antetul apare pe toate paginile site-ului. Ce schimbi aici se vede peste tot, așa că meniul și datele de contact se editează o singură dată.",
  "The footer shows on every page of the site. What you change here shows everywhere, so the menu and the contact details are edited only once.":
    "Subsolul apare pe toate paginile site-ului. Ce schimbi aici se vede peste tot, așa că meniul și datele de contact se editează o singură dată.",
  "A page can hide it in its own settings (“{setting}”).": "O pagină îl poate ascunde din setările ei („{setting}”).",

  // Dialogs: a new page
  "For example, About us": "De exemplu, Despre noi",
  "about-us": "despre-noi",
  "Create page": "Creează pagina",
  "Creating…": "Se creează…",
  "Write a title for the page.": "Scrie un titlu pentru pagină.",
  "Write the page's address.": "Scrie adresa paginii.",
  "The address can only have lowercase letters without accents, digits and hyphens, for example about-us.":
    "Adresa poate avea doar litere mici fără diacritice, cifre și cratime, de exemplu despre-noi.",
  "There's already a page with the address {address}.": "Există deja o pagină cu adresa {address}.",
  "It fills itself in from the title. You can change it.": "Se completează singură din titlu. O poți schimba.",
  "The page starts empty; you add blocks by dragging them from the left or with +.": "Pagina pornește goală; pui blocuri în ea trăgându-le din stânga sau cu +.",
  Cancel: "Renunță",
  Continue: "Continuă",
  Close: "Închide",

  // Dialogs: the site settings
  "Rounded (friendly, the default)": "Rotunjit (prietenos, cel implicit)",
  "System (modern, simple)": "Sistem (modern, simplu)",
  "Serif (classic, bookish)": "Serif (clasic, de carte)",
  "Monospace (technical)": "Monospace (tehnic)",
  "Main color": "Culoarea principală",
  "Buttons, links, accents": "Butoane, linkuri, accente",
  Text: "Text",
  "Titles and paragraphs": "Titluri și paragrafe",
  Background: "Fundal",
  "The page's background": "Fundalul paginii",
  "Light background": "Fundal deschis",
  "Sections set to “Light background”, cards and the footer": "Secțiunile cu „Fundal deschis”, cardurile și subsolul",
  "Log in": "Intrare în cont",
  "has “{name}”": "cu „{name}”",
  "The chosen page doesn't have the “{name}” block: people sent here would have nowhere to log in. Add the block to it or choose another page.":
    "Pagina aleasă nu are blocul „{name}”: cine ajunge aici n-ar avea unde să intre în cont. Adaugă blocul în pagină sau alege altă pagină.",
  Save: "Salvează",
  "Write the color as #rrggbb, for example #e8562a.": "Culoarea trebuie să fie de forma #rrggbb, de exemplu #e8562a.",
  "Custom (from site.json)": "Personalizat (din site.json)",
  "My site": "Site-ul meu",
  General: "General",
  "Site name": "Numele site-ului",
  "Site language": "Limba site-ului",
  "Blocks writes its own words for visitors (form messages, logging in, dates) in English or Romanian; with any other language, they stay in English.":
    "Blocks își scrie singur cuvintele pentru vizitatori (mesajele formularelor, intrarea în cont, datele) în engleză sau în română; la alte limbi, rămân în engleză.",
  "Login page": "Pagina de intrare în cont",
  "People who open a members-only page without being logged in are sent here.":
    "Aici ajunge cine deschide o pagină doar pentru membri fără să fi intrat în cont.",
  Colors: "Culori",
  "Text & shapes": "Text și forme",
  Font: "Font",
  "You see the changes on the page right away. They apply to the whole site.": "Vezi schimbările imediat în pagină. Se aplică pe tot site-ul.",
  "Couldn't save the settings: {error}": "Nu am putut salva setările: {error}",

  // Toasts and confirmations
  "Couldn't load the “{type}” block (components/{type}.js).": "Nu am putut încărca blocul „{type}” (components/{type}.js).",
  "Deleted “{name}”.": "Am șters „{name}”.",
  "{areas} has {n} block that no longer shows on the page.": "{areas} are {n} bloc care nu mai apare pe pagină.",
  "{areas} has {n} blocks that no longer show on the page.": "{areas} are {n} blocuri care nu mai apar pe pagină.",
  "{areas} have {n} block that no longer shows on the page.": "{areas} au {n} bloc care nu mai apare pe pagină.",
  "{areas} have {n} blocks that no longer show on the page.": "{areas} au {n} blocuri care nu mai apar pe pagină.",
  "Move to {area}": "Mută în {area}",
  "Nothing left to undo.": "Nu mai e nimic de anulat.",
  "Nothing left to redo.": "Nu mai e nimic de refăcut.",
  "The “{name}” page doesn't exist.": "Pagina „{name}” nu există.",
  "Couldn't open the document: {error}": "Nu am putut deschide documentul: {error}",
  "Created the “{title}” page. Drag a block into it or press +.": "Am creat pagina „{title}”. Trage un bloc în ea sau apasă +.",
  "Delete the “{title}” page?": "Ștergi pagina „{title}”?",
  "The file pages/{slug}.json will be deleted, and the address /{slug} will stop working. This can't be undone.":
    "Fișierul pages/{slug}.json va fi șters, iar adresa /{slug} nu va mai funcționa. Nu se poate anula.",
  "Couldn't delete the page: {error}": "Nu am putut șterge pagina: {error}",
  "Deleted the “{title}” page, but couldn't remove all the links to it. Check the menu.":
    "Am șters pagina „{title}”, dar nu am putut scoate toate linkurile spre ea. Verifică meniul.",
  "Deleted the “{title}” page and the link to it.": "Am șters pagina „{title}” și linkul spre ea.",
  "Deleted the “{title}” page and the {n} links to it.": "Am șters pagina „{title}” și cele {n} linkuri spre ea.",
  "Deleted the “{title}” page. {n} link still goes to /{slug}.": "Am șters pagina „{title}”. {n} link duce încă spre /{slug}.",
  "Deleted the “{title}” page. {n} links still go to /{slug}.": "Am șters pagina „{title}”. {n} linkuri duc încă spre /{slug}.",
  "Deleted the “{title}” page.": "Am șters pagina „{title}”.",
  "The login page no longer exists: choose another one in Site settings.": "Pagina de intrare în cont nu mai există: alege alta din Setări site.",
  "The site settings are saved.": "Setările site-ului au fost salvate.",
  "Couldn't restore the settings: {error}": "Nu am putut restaura setările: {error}",
  "Restored the previous site settings.": "Am pus înapoi setările site-ului de dinainte.",
  "The changes weren't saved": "Modificările nu s-au salvat",
  "The server couldn't save the latest changes ({reason}). If you go on, you lose them.":
    "Serverul nu a putut salva ultimele modificări ({reason}). Dacă mergi mai departe, le pierzi.",
  "it isn't answering": "nu răspunde",
  "Continue without them": "Continuă fără ele",
  "The “{title}” page": "Pagina „{title}”",
  "{n} link goes to /{slug}": "{n} link duce spre /{slug}",
  "{n} links go to /{slug}": "{n} linkuri duc spre /{slug}",
  "/{slug} is used in the settings": "/{slug} e folosită în setări",
  "Site settings: the login page (choose another one after deleting)": "Setări site: pagina de intrare în cont (alege alta după ștergere)",
  "Remove the links too, so visitors don't end up on a page that doesn't exist":
    "Scoate și linkurile, ca vizitatorii să nu ajungă pe o pagină care nu există",
  "Error in {error}. Fix the file and save it: the editor reloads it by itself.": "Eroare în {error}. Repară fișierul și salvează-l: editorul îl reîncarcă singur.",
  "Reloaded “{name}”.": "Am reîncărcat „{name}”.",
  "Couldn't reload: {error}": "Nu am putut reîncărca: {error}",
  "The “{title}” page was deleted from the disk.": "Pagina „{title}” a fost ștearsă de pe disc.",
  "Loaded the new version of pages/{file}.": "Am încărcat versiunea nouă din pages/{file}.",
  "The file pages/{file} changed on the disk. We're keeping your changes here; to load the version on the disk, use “Reload”.":
    "Fișierul pages/{file} s-a schimbat pe disc. Păstrăm modificările tale de aici; versiunea de pe disc o încarci cu „Reîncarcă”.",
  Reload: "Reîncarcă",
  "Couldn't save: {error} Trying again automatically.": "Nu am putut salva: {error} Reîncerc automat.",
  "The editor couldn't start": "Editorul nu a putut porni",
  "Try again": "Încearcă din nou",
  Home: "Acasă",
  "Couldn't open the page.": "Nu am putut deschide pagina.",

  // The server's answers (api.js)
  "Can't reach the server. Is “node blocks.js dev” still running?": "Nu pot contacta serverul. Mai rulează „node blocks.js dev”?",
  "The server answered with error {status}.": "Serverul a răspuns cu eroarea {status}.",
  "The page name can only have lowercase letters, digits and hyphens.": "Numele paginii poate avea doar litere mici, cifre și cratime.",
  "The page doesn't exist.": "Pagina nu există.",
  "The home page (index) can't be deleted.": "Prima pagină (index) nu poate fi ștearsă.",
  "Unknown zone.": "Zonă necunoscută.",
  "The zone must have a “blocks” list.": "Zona trebuie să aibă o listă „blocks”.",
  "The settings must be an object.": "Setările trebuie să fie un obiect.",
  "The page must be an object.": "Pagina trebuie să fie un obiect.",
  "“access” can be “public” or “members”.": "„access” poate fi „public” sau „members”.",
  "“blocks” must be a list.": "„blocks” trebuie să fie o listă.",
  "You can only upload images (png, jpg, gif, webp, avif).": "Poți încărca doar imagini (png, jpg, gif, webp, avif).",
  "You can only upload images (png, jpg, gif, webp, avif); this file isn't an image.":
    "Poți încărca doar imagini (png, jpg, gif, webp, avif); acest fișier nu e o imagine.",
  "The file is empty.": "Fișierul e gol.",
  "The request is too large.": "Cererea e prea mare.",
  "The x-blocks header is missing.": "Lipsește headerul HTTP x-blocks.",
  "Request blocked: it came from another site.": "Cerere blocată: a venit de pe alt site.",
  "Send the data as JSON (Content-Type: application/json).": "Trimite datele ca JSON (Content-Type: application/json).",
  "The data sent isn't valid JSON.": "Datele trimise nu sunt JSON valid.",
  "Something went wrong on the server.": "A apărut o eroare pe server.",
  "The page": "Pagina",
  "The header": "Antetul",
  "The footer": "Subsolul",
  "The site.json file": "Fișierul site.json",
  "{what} has too many blocks nested inside each other.": "{what} are prea multe blocuri puse unul în altul.",
  "{what} is too large: it has too many blocks or settings.": "{what} e prea mare: are prea multe blocuri sau setări.",
  "{what}: every block must be an object { type, props }.": "{what}: fiecare bloc trebuie să fie un obiect { type, props }.",
  "{what}: “slots” must be an object with lists of blocks.": "{what}: „slots” trebuie să fie un obiect cu liste de blocuri.",
  "{what}: every area in “slots” must be a list of blocks.": "{what}: fiecare zonă din „slots” trebuie să fie o listă de blocuri.",
};
