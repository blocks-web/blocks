// The pages' safety rules (Content-Security-Policy): what the browser may load and run on a page
// of the site.
//
// Strict by default: scripts only from the site, frames only from YouTube (without cookies) and
// Google Maps, requests and forms only to the site. This way a text slipped into a page can't run.
//
// Relaxed automatically, only on pages with custom code (code written by the owner, not by Blocks):
//   - a filled-in "html" field, in any block (including the blocks in the header and footer);
//   - a <script> (or an "onload=...") in "head", from site.json or from the page (JSON-LD isn't code);
//   - "scripts" from another site.
// Then scripts (including the ones written in the page), styles, fonts, frames, requests and forms
// may use any https site, so pasted widgets (bookings, newsletters) work.
// The export says on which pages, and why.

import { eachBlock, headExtras, siteFiles, withDefaults } from "../core/render.js";

const STRICT = {
  "default-src": "'self'",
  "script-src": "'self'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data: https:",
  "font-src": "'self' data:",
  "media-src": "'self' https:",
  "frame-src": "https://www.youtube-nocookie.com https://www.google.com",
  "connect-src": "'self'",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "frame-ancestors": "'self'",
};

const RELAXED = {
  "script-src": "'self' 'unsafe-inline' https:",
  "style-src": "'self' 'unsafe-inline' https:",
  "font-src": "'self' data: https:",
  "frame-src": "https:",
  "connect-src": "'self' https:",
  "form-action": "'self' https:",
};

// A script that runs, in "head": a <script> (except JSON data, such as JSON-LD for search engines,
// which doesn't run) or an attribute like onload="...".
// The browser also reads an attribute glued to a quote or after a "/" ("\"onload=", "/onload="),
// and "data-type" isn't "type".
const runs = (text) =>
  [...text.matchAll(/<script\b([^>]*)>/gi)].some(([, attributes]) => !/(?:^|[\s/])type\s*=\s*["']?[^"'\s>]*json/i.test(attributes)) ||
  /[\s"'/]on[a-z]+\s*=/i.test(text);

// A file's address, read the way the browser reads it ("/\other.com/x.js" is also on another site).
const BASE = "https://site.invalid/";
const address = (text) => {
  try {
    return new URL(text, BASE);
  } catch {
    return null;
  }
};
const foreign = (text) => address(text)?.origin !== new URL(BASE).origin;

// Does the block have a filled-in "html" field (directly or in a list item)?
function hasCode(component, props) {
  let p;
  try {
    p = withDefaults(component, props);
  } catch {
    return false; // a broken schema: the block doesn't show at all
  }
  const filled = (fields, values) =>
    Object.entries(fields || {}).some(([key, field]) => {
      if (field?.type === "html") return String(values[key] ?? "").trim() !== "";
      if (field?.type === "list") return values[key].some((item) => filled(field.fields, item));
      return false;
    });
  return filled(component.props, p);
}

// Why the page has custom code, in plain words; an empty list means it has none.
//   ["the “Embed” block", "a script in “head”", "a script from cdn.example.com"]
export function foreignCode({ page, site, zones, components } = {}) {
  const reasons = new Set();
  const search = (blocks, where) =>
    eachBlock(blocks, (block) => {
      const type = String(block.type ?? "");
      const component = components && Object.hasOwn(components, type) ? components[type] : null;
      if (typeof component?.html === "function" && hasCode(component, block.props)) {
        reasons.add(`the “${component.name || type}” block${where}`);
      }
    });
  const withZones = page?.zones !== false;
  if (withZones) search(zones?.header?.blocks, " in the header");
  search(page?.blocks, "");
  if (withZones) search(zones?.footer?.blocks, " in the footer");
  if (headExtras(page, site).some(runs)) reasons.add("a script in “head”");
  for (const src of siteFiles(page, site, "scripts")) {
    if (foreign(src)) reasons.add(`a script from ${address(src)?.host || src}`);
  }
  return [...reasons];
}

// The rules for a page, as text for the Content-Security-Policy header.
//   meta: true → for <meta http-equiv> (the static export), without frame-ancestors, which the browser ignores there.
export function contentSecurityPolicy({ page, site, zones, components } = {}, { meta = false } = {}) {
  const rules = { ...STRICT };
  // The site's styles from another site (e.g. a font): only that site, plus the fonts it asks for.
  // Only plain addresses ("https://fonts.example.com"): a ";" in the address would add a new rule.
  const styles = new Set(
    siteFiles(page, site, "styles")
      .filter(foreign)
      .map((href) => address(href)?.origin)
      .filter((origin) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/.test(origin ?? "")),
  );
  if (styles.size) {
    rules["style-src"] += ` ${[...styles].join(" ")}`;
    rules["font-src"] += " https:";
  }
  if (foreignCode({ page, site, zones, components }).length) Object.assign(rules, RELAXED);
  if (meta) delete rules["frame-ancestors"];
  return Object.entries(rules)
    .map(([name, value]) => `${name} ${value}`)
    .join("; ");
}
