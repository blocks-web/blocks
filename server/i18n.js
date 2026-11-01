// What the server says to visitors (logging in, signing up, password rules, forms, limits), in the
// site's language (site.json → "lang"): English by default, or Romanian. Messages for programmers
// and the command line stay in English.
//
//   message("ro", "wrongLogin") → "Email sau parolă greșită."
//   message("en", "passwordTooShort", { min: 15 }) → "The password must be at least 15 characters long. ..."
//
// Both languages have exactly the same keys and the same {placeholders} (a test checks this).

export const MESSAGES = {
  en: {
    serverError: "Something went wrong on the server.",
    serverBusy: "The server is very busy right now. Please try again in a few seconds.",
    tooManyAttempts: "Too many attempts. Please try again in a few minutes.",
    otherSite: "Request blocked: it came from another site.",
    requestTooLarge: "The request is too large.",
    jsonRequired: "Send the data as JSON (Content-Type: application/json).",
    jsonInvalid: "The data sent isn't valid JSON.",
    jsonObjectRequired: "Send the data as a JSON object, like { ... }.",
    nameRequired: "Please enter your name (up to 80 characters).",
    emailInvalid: "That email address doesn't look right.",
    tooManyAccounts: "Too many new accounts from this address. Please try again in an hour.",
    accountTaken: "We couldn't create an account with this address. If you already have one, log in.",
    wrongLogin: "Wrong email or password.",
    passwordTooLong: "The password is too long.",
    passwordTooShort: "The password must be at least {min} characters long. A short sentence is easy to remember.",
    passwordTooShortPadded:
      "The password must be at least {min} characters long. Extra spaces and invisible characters don't count. A short sentence is easy to remember.",
    passwordRepeated: "The password can't be one short piece repeated over and over (like “aaaa…” or “abcabc…”). A short sentence is safer.",
    passwordSequence: "The password can't be a simple run of keys or characters (like “qwerty…”, “abcdef…” or “123456…”). A short sentence is safer.",
    passwordHasEmail: "The password can't contain your email address (not even the part before the “@”).",
    pageErrorTitle: "This page can't be shown",
    pageErrorHeading: "This page can't be shown right now",
    pageErrorText: "Something went wrong on the server. Please try again in a little while.",
    notFoundTitle: "Page not found",
    notFoundLink: "Back to the home page",
    routeNotFound: "Route not found.",
  },
  ro: {
    serverError: "A apărut o eroare pe server.",
    serverBusy: "Serverul e foarte ocupat acum. Încearcă din nou peste câteva secunde.",
    tooManyAttempts: "Prea multe încercări. Încearcă din nou peste câteva minute.",
    otherSite: "Cerere blocată: a venit de pe alt site.",
    requestTooLarge: "Cererea e prea mare.",
    jsonRequired: "Trimite datele ca JSON (Content-Type: application/json).",
    jsonInvalid: "Datele trimise nu sunt JSON valid.",
    jsonObjectRequired: "Trimite datele ca obiect JSON, de forma { ... }.",
    nameRequired: "Scrie un nume (cel mult 80 de caractere).",
    emailInvalid: "Adresa de email nu pare corectă.",
    tooManyAccounts: "Prea multe conturi noi de pe această adresă. Încearcă din nou peste o oră.",
    accountTaken: "Nu am putut crea contul cu această adresă. Dacă ai deja cont, intră în cont.",
    wrongLogin: "Email sau parolă greșită.",
    passwordTooLong: "Parola e prea lungă.",
    passwordTooShort: "Parola trebuie să aibă cel puțin {min} caractere. O propoziție scurtă e ușor de ținut minte.",
    passwordTooShortPadded:
      "Parola trebuie să aibă cel puțin {min} caractere. Spațiile în plus și caracterele invizibile nu se numără. O propoziție scurtă e ușor de ținut minte.",
    passwordRepeated: "Parola nu poate fi aceeași bucată repetată (ex. „aaaa…” sau „abcabc…”). O propoziție scurtă e mai sigură.",
    passwordSequence: "Parola nu poate fi un șir de taste sau de caractere la rând (ex. „qwerty…”, „abcdef…”, „123456…”). O propoziție scurtă e mai sigură.",
    passwordHasEmail: "Parola nu poate conține adresa de email (nici partea dinaintea lui „@”).",
    pageErrorTitle: "Pagina nu poate fi afișată",
    pageErrorHeading: "Pagina nu poate fi afișată acum",
    pageErrorText: "A apărut o eroare pe server. Încearcă din nou puțin mai târziu.",
    notFoundTitle: "Pagina nu există",
    notFoundLink: "Înapoi la prima pagină",
    routeNotFound: "Ruta nu există.",
  },
};

// The visitor's language for a site: "ro" when site.json says so, English otherwise.
export function siteLang(site) {
  return site?.lang === "ro" ? "ro" : "en";
}

// The message `key` in `lang` ("en" when the language is unknown), with its {placeholders} filled in.
export function message(lang, key, values = {}) {
  const words = Object.hasOwn(MESSAGES, lang) ? MESSAGES[lang] : MESSAGES.en;
  const text = Object.hasOwn(words, key) ? words[key] : Object.hasOwn(MESSAGES.en, key) ? MESSAGES.en[key] : key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (values && Object.hasOwn(values, name) ? String(values[name]) : m));
}
