// The editor's requests to the server (see "HTTP API" in docs/ARCHITECTURE.md).
// The ones that change something send the x-blocks: 1 header.

import { t } from "./i18n.js";

// The editor API always answers in English. These are the answers a person can see (in a toast or
// under a field), in the editor's language. A test checks that each key is its own English text.
export const ANSWERS = {
  "The page name can only have lowercase letters, digits and hyphens.": () => t("The page name can only have lowercase letters, digits and hyphens."),
  "The page doesn't exist.": () => t("The page doesn't exist."),
  "The home page (index) can't be deleted.": () => t("The home page (index) can't be deleted."),
  "Unknown zone.": () => t("Unknown zone."),
  "The zone must have a “blocks” list.": () => t("The zone must have a “blocks” list."),
  "The settings must be an object.": () => t("The settings must be an object."),
  "The page must be an object.": () => t("The page must be an object."),
  "“access” can be “public” or “members”.": () => t("“access” can be “public” or “members”."),
  "“blocks” must be a list.": () => t("“blocks” must be a list."),
  "You can only upload images (png, jpg, gif, webp, avif).": () => t("You can only upload images (png, jpg, gif, webp, avif)."),
  "You can only upload images (png, jpg, gif, webp, avif); this file isn't an image.": () =>
    t("You can only upload images (png, jpg, gif, webp, avif); this file isn't an image."),
  "The file is empty.": () => t("The file is empty."),
  "The request is too large.": () => t("The request is too large."),
  "The x-blocks header is missing.": () => t("The x-blocks header is missing."),
  "Request blocked: it came from another site.": () => t("Request blocked: it came from another site."),
  "Send the data as JSON (Content-Type: application/json).": () => t("Send the data as JSON (Content-Type: application/json)."),
  "The data sent isn't valid JSON.": () => t("The data sent isn't valid JSON."),
  "Something went wrong on the server.": () => t("Something went wrong on the server."),
};

// The answers about a page, a zone or site.json start with what they're about: "The page has …".
const SUBJECTS = {
  "The page": () => t("The page"),
  "The header": () => t("The header"),
  "The footer": () => t("The footer"),
  "The site.json file": () => t("The site.json file"),
};
const ABOUT = {
  " has too many blocks nested inside each other.": (what) => t("{what} has too many blocks nested inside each other.", { what }),
  " is too large: it has too many blocks or settings.": (what) => t("{what} is too large: it has too many blocks or settings.", { what }),
  ": every block must be an object { type, props }.": (what) => t("{what}: every block must be an object { type, props }.", { what }),
  ": “slots” must be an object with lists of blocks.": (what) => t("{what}: “slots” must be an object with lists of blocks.", { what }),
  ": every area in “slots” must be a list of blocks.": (what) => t("{what}: every area in “slots” must be a list of blocks.", { what }),
};

// The server's answer in the editor's language; one we don't know stays as the server wrote it.
export function serverText(text) {
  const s = String(text ?? "");
  if (Object.hasOwn(ANSWERS, s)) return ANSWERS[s]();
  for (const [subject, what] of Object.entries(SUBJECTS)) {
    const rest = s.startsWith(subject) ? s.slice(subject.length) : null;
    if (rest !== null && Object.hasOwn(ABOUT, rest)) return ABOUT[rest](what());
  }
  return s;
}

async function request(method, url, body, { raw = false, headers = {} } = {}) {
  const options = { method, headers: { ...headers }, credentials: "same-origin", cache: "no-store" };
  if (method !== "GET" && method !== "HEAD") options.headers["x-blocks"] = "1";
  if (raw) options.body = body;
  else if (body !== undefined) {
    options.headers["content-type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    const err = new Error(t("Can't reach the server. Is “node blocks.js dev” still running?"));
    err.status = 0;
    throw err;
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // the answer isn't JSON
  }
  if (!res.ok) {
    const text = typeof data?.error === "string" && data.error ? serverText(data.error) : t("The server answered with error {status}.", { status: res.status });
    const err = new Error(text);
    err.status = res.status;
    throw err;
  }
  return data;
}

const page = (slug) => `/_api/pages/${encodeURIComponent(slug)}`;
const zone = (name) => `/_api/zones/${encodeURIComponent(name)}`;

export const api = {
  components: () => request("GET", "/_api/components"),
  pages: () => request("GET", "/_api/pages"),
  page: (slug) => request("GET", page(slug)),
  savePage: (slug, doc) => request("PUT", page(slug), doc),
  deletePage: (slug) => request("DELETE", page(slug)),
  zone: (name) => request("GET", zone(name)),
  saveZone: (name, doc) => request("PUT", zone(name), doc),
  site: () => request("GET", "/_api/site"),
  saveSite: (site) => request("PUT", "/_api/site", site),
  upload: (file) =>
    request("POST", `/_api/upload?name=${encodeURIComponent(file.name || "image")}`, file, {
      raw: true,
      headers: { "content-type": file.type || "application/octet-stream" },
    }),
};

// A last try at saving when the page closes (fetch with keepalive, at most ~64 KB).
export function saveOnExit(kind, name, doc) {
  const url = kind === "page" ? page(name) : zone(name);
  const body = JSON.stringify(doc);
  // The limit is in bytes, not characters: "ă" or "ș" take 2 bytes each in UTF-8.
  if (new TextEncoder().encode(body).length > 60_000) return;
  try {
    fetch(url, {
      method: "PUT",
      keepalive: true,
      headers: { "content-type": "application/json", "x-blocks": "1" },
      body,
    }).catch(() => {});
  } catch {
    // nothing more we can do
  }
}
