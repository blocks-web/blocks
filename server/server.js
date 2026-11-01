// The server: serves the site, logging in, the component routes and (in dev mode) the editor.
//
//   mode "dev"   – the editor at /_editor/, listening only on 127.0.0.1 (the editor can write files).
//                  The editor lives on http://localhost:PORT, the site's pages on http://127.0.0.1:PORT:
//                  two origins, so code on the pages (Embed, scripts) can't reach /_api.
//   mode "start" – only the site, without the editor; for publishing
//
// Routes:
//   /                         the pages in pages/
//   /core/*  /components/*.js /assets/*   public files (never *.server.js)
//   /api/auth/{login,logout,register,me}
//   /api/c/<component>/<route>             the routes in components/<component>.server.js
//   /_editor/  /_api/*                      the editor (dev only)
//
// What a visitor reads (errors, the error pages) is in the site's language (site.json → "lang"),
// from server/i18n.js. The editor's API answers in English; the editor translates.

import { createServer } from "node:http";
import { createReadStream, mkdirSync, watch } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import { createGzip, gzipSync } from "node:zlib";
import { escape, fold } from "../core/html.js";
import { eachBlock, renderPage, renderParts, ZONES } from "../core/render.js";
import { COMPONENT_FILE, createProject, DEFAULT_SITE, SLUG, slugForPath } from "./project.js";
import { createStore } from "./store.js";
import { createAuth, HttpError, visitorError } from "./auth.js";
import { contentSecurityPolicy } from "./csp.js";
import { message, siteLang } from "./i18n.js";
import { addressKey, createLimiter } from "./limits.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

const UPLOAD_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"]);
const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Text files: sent compressed (gzip) when the browser accepts it.
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".mjs", ".json", ".txt", ".svg"]);

// The pages the server makes itself (error, "not found") have no custom code: the strict rules.
const CSP_STRICT = contentSecurityPolicy();

const acceptsGzip = (req) => /\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""));

// The requested path, inside `base`; null if it tries to get out of it or touches hidden files.
export function safeJoin(base, rel) {
  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((s) => s.startsWith("."))) return null;
  const root = resolve(base);
  const full = resolve(root, ...segments);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

function readBody(req, limit) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        tooBig = true;
        chunks.length = 0;
      } else if (!tooBig) chunks.push(chunk);
    });
    req.on("end", () => (tooBig ? fail(visitorError(413, "requestTooLarge")) : ok(Buffer.concat(chunks))));
    req.on("error", fail);
  });
}

async function readJsonBody(req, limit = 1_000_000) {
  // Only the type, without parameters: "text/plain; x=application/json" isn't JSON (and needs no CORS preflight).
  const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw visitorError(415, "jsonRequired");
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw visitorError(400, "jsonInvalid");
  }
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendHtml(req, res, status, body, headers = {}) {
  let data = Buffer.from(body);
  const extra = { vary: "accept-encoding" };
  if (data.length > 1024 && acceptsGzip(req)) {
    data = gzipSync(data);
    extra["content-encoding"] = "gzip";
  }
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": data.length,
    ...extra,
    ...headers,
  });
  res.end(req.method === "HEAD" ? undefined : data);
}

function redirect(res, location, status = 302) {
  res.writeHead(status, { location, "cache-control": "no-store" });
  res.end();
}

// "Site.com:443" and "site.com" are the same address for https://site.com.
function normalHost(host, protocol) {
  const h = String(host || "").trim().toLowerCase();
  const port = protocol === "https:" ? ":443" : ":80";
  return h.endsWith(port) ? h.slice(0, -port.length) : h;
}

let originHint = true; // the tip about the proxy shows only once in the terminal

// Requests that change something must come from the same site (CSRF protection).
// `hint`: in start mode, a refusal can come from a misconfigured proxy; we say how to fix it.
function checkOrigin(req, hint = false) {
  const origin = req.headers.origin;
  if (!origin) return;
  let from = null;
  try {
    from = new URL(origin);
  } catch {
    // invalid origin
  }
  // The address the request reached: Host, and behind a proxy (TRUST_PROXY=1) also X-Forwarded-Host.
  const hosts = [req.headers.host];
  const forwarded = req.headers["x-forwarded-host"];
  if (process.env.TRUST_PROXY === "1" && forwarded) hosts.push(String(forwarded).split(",").pop());
  if (from && hosts.some((h) => normalHost(h, from.protocol) === normalHost(from.host, from.protocol))) return;
  // A local Host (127.0.0.1:3000) for a request from a domain is the sign of a proxy that doesn't pass the real address.
  if (hint && originHint && /^(localhost|127\.|\[::1\])/.test(String(req.headers.host))) {
    originHint = false;
    console.warn(
      `[blocks] Rejected a request from ${origin} (the server sees itself as “${req.headers.host}”). ` +
        "If the site is behind a proxy (e.g. nginx), pass it the real address: proxy_set_header Host $host;",
    );
  }
  throw visitorError(403, "otherSite");
}

function clientIp(req) {
  if (process.env.TRUST_PROXY === "1") {
    // The last address is the one the proxy added; anyone can write the ones before it (and get around the attempt limit).
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").pop().trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || "";
}

function isSecure(req) {
  return process.env.COOKIE_SECURE === "1" || req.headers["x-forwarded-proto"] === "https" || !!req.socket.encrypted;
}

// What the editor writes to disk has a known shape: at most MAX_DEPTH levels and MAX_NODES values.
// Otherwise a small request could swell on disk (each level adds indentation) or stop the server.
const MAX_DEPTH = 64;
const MAX_NODES = 50_000;

function checkSize(value, what) {
  let nodes = 1;
  const stack = [[value, 0]];
  while (stack.length) {
    const [v, depth] = stack.pop();
    if (!v || typeof v !== "object") continue;
    if (depth >= MAX_DEPTH) throw new HttpError(400, `${what} has too many blocks nested inside each other.`);
    const children = Array.isArray(v) ? v : Object.values(v);
    nodes += children.length;
    if (nodes > MAX_NODES) throw new HttpError(413, `${what} is too large: it has too many blocks or settings.`);
    for (const c of children) stack.push([c, depth + 1]);
  }
}

// Every block (including those in its areas) is an object, and its areas are lists: anything else is refused, not written.
function checkBlocks(blocks, what) {
  if (blocks === undefined) return;
  if (!Array.isArray(blocks)) throw new HttpError(400, "“blocks” must be a list.");
  const stack = [blocks];
  while (stack.length) {
    for (const b of stack.pop()) {
      if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, `${what}: every block must be an object { type, props }.`);
      if (b.slots === undefined) continue;
      if (!b.slots || typeof b.slots !== "object" || Array.isArray(b.slots)) {
        throw new HttpError(400, `${what}: “slots” must be an object with lists of blocks.`);
      }
      for (const kids of Object.values(b.slots)) {
        if (!Array.isArray(kids)) throw new HttpError(400, `${what}: every area in “slots” must be a list of blocks.`);
        stack.push(kids);
      }
    }
  }
}

function validatePage(page) {
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new HttpError(400, "The page must be an object.");
  checkSize(page, "The page");
  checkBlocks(page.blocks, "The page");
  if (page.access !== undefined && !["public", "members"].includes(page.access)) {
    throw new HttpError(400, "“access” can be “public” or “members”.");
  }
  return { title: "", access: "public", ...page, blocks: page.blocks || [] };
}

// The first bytes of each kind of image. A file with other content (an SVG, a page, a script) under a
// .png name never reaches the site; an image with the wrong extension gets its real one.
function imageKind(data) {
  const text = (start, end) => data.toString("latin1", start, end);
  if (data.length >= 8 && data[0] === 0x89 && text(1, 4) === "PNG") return ".png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return ".jpg";
  if (text(0, 4) === "GIF8") return ".gif";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return ".webp";
  if (data.length >= 12 && text(4, 8) === "ftyp") {
    // The brands in the "ftyp" box (the main one at 8, then the compatible ones from 16): AVIF has "avif" or "avis".
    const end = Math.min(data.length, data.readUInt32BE(0), 64);
    for (let i = 8; i + 4 <= end; i += i === 8 ? 8 : 4) if (["avif", "avis"].includes(text(i, i + 4))) return ".avif";
  }
  return null;
}

// The page shown when a page can't be rendered. In dev it also says which file is broken.
function errorHtml(lang, detail) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(message(lang, "pageErrorTitle"))}</title>
<link rel="stylesheet" href="/core/base.css"></head>
<body><main class="b-container" style="padding:4rem 0;text-align:center">
<h1>${escape(message(lang, "pageErrorHeading"))}</h1><p>${escape(message(lang, "pageErrorText"))}</p>
${detail ? `<pre style="text-align:left;white-space:pre-wrap">${escape(detail)}</pre>\n` : ""}</main></body></html>`;
}

function notFoundHtml(site) {
  const lang = siteLang(site);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(message(lang, "notFoundTitle"))}</title>
<link rel="stylesheet" href="/core/base.css"></head>
<body><main class="b-container" style="padding:4rem 0;text-align:center">
<h1>${escape(message(lang, "notFoundTitle"))}</h1><p><a href="/">${escape(message(lang, "notFoundLink"))}</a></p></main></body></html>`;
}

export async function startServer({ root, mode = "dev", host, port = 3000, quiet = false } = {}) {
  const editor = mode === "dev";
  // The editor can write files to disk, so we never expose it on the network.
  const listenHost = editor ? "127.0.0.1" : host || "0.0.0.0";
  const project = createProject(root);
  const store = createStore(project.dirs.data);
  const auth = createAuth(store);
  const clients = new Set(); // the editor's SSE connections
  const watchers = [];
  let actualPort = port;

  function allowedHost(hostHeader) {
    // Protection against "DNS rebinding": in dev we only accept local addresses.
    const h = String(hostHeader || "").toLowerCase();
    return [`localhost:${actualPort}`, `127.0.0.1:${actualPort}`, `[::1]:${actualPort}`].includes(h);
  }

  async function serveStatic(req, res, base, rel) {
    const file = safeJoin(base, rel);
    if (!file) return json(res, 404, { error: "File not found." });
    let info;
    try {
      info = await stat(file);
    } catch {
      return json(res, 404, { error: "File not found." });
    }
    if (!info.isFile()) return json(res, 404, { error: "File not found." });
    const ext = extname(file).toLowerCase();
    // After the 5 minutes of cache, the browser asks "has it changed?"; if not, it gets only a 304.
    const etag = `W/"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    const validators = {
      etag,
      "last-modified": info.mtime.toUTCString(),
      "cache-control": editor ? "no-store" : "public, max-age=300",
    };
    const ifNoneMatch = req.headers["if-none-match"];
    const ifModifiedSince = Date.parse(req.headers["if-modified-since"] || "");
    const unchanged = ifNoneMatch
      ? ifNoneMatch.split(",").some((tag) => tag.trim() === etag)
      : ifModifiedSince >= Math.floor(info.mtimeMs / 1000) * 1000;
    if (unchanged) {
      res.writeHead(304, validators);
      return res.end();
    }
    const gzip = COMPRESSIBLE.has(ext) && info.size > 1024 && acceptsGzip(req);
    const headers = { "content-type": MIME[ext] || "application/octet-stream", ...validators };
    if (COMPRESSIBLE.has(ext)) headers.vary = "accept-encoding";
    if (gzip) headers["content-encoding"] = "gzip";
    else headers["content-length"] = info.size;
    // An SVG opened directly could run scripts; we treat it strictly as an image.
    if (ext === ".svg") headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(file).on("error", () => res.destroy());
    (gzip ? stream.pipe(createGzip()).on("error", () => res.destroy()) : stream).pipe(res);
  }

  // A file broken by hand (site.json) doesn't stop the whole site: we report it and carry on without it.
  async function orDefault(promise, fallback) {
    try {
      return await promise;
    } catch (err) {
      console.error(`[blocks] ${err.message}`);
      return fallback;
    }
  }

  // The site settings, quietly: with a broken site.json, the defaults (the error is reported where the page is served).
  const readSiteQuietly = () => project.readSite().catch(() => ({ ...DEFAULT_SITE }));

  async function pageFailed(req, res, err) {
    if (err.file) console.error(`[blocks] Can't display ${req.url}: ${err.message}`);
    else console.error("[blocks] Error:", err);
    if (res.headersSent) return res.end();
    const next = err.file ? "Fix the file and reload the page." : "The details are in the terminal.";
    const detail = editor ? `${err.message}\n\n${next}` : "";
    const lang = siteLang(await readSiteQuietly());
    return sendHtml(req, res, 500, errorHtml(lang, detail), { "cache-control": "no-store", "content-security-policy": CSP_STRICT });
  }

  // The page at the address `pathname`, as `user` sees it: { page, status } (404: the site's error page),
  // { login } when the visitor must log in first, or null when there isn't even a 404 page.
  // The same rule for displaying pages and for the component routes (ctx.block).
  async function pageFor(pathname, user, site) {
    const slug = slugForPath(pathname);
    let page = slug ? await project.readPage(slug) : null;
    let status = 200;
    if (!page) {
      status = 404;
      page = await orDefault(project.readPage("404"), null);
      if (!page) return null;
    }
    if (status === 200 && page.access === "members" && !user) {
      const login = String(site.loginPage || "/login");
      // The login page isn't sent to itself (a loop), not even written as "/login/" or "/login?x=1".
      const loginPath = `/${login.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "")}`;
      if (loginPath !== pathname) return { login };
    }
    return { page, status };
  }

  async function servePage(req, res, url) {
    const pathname = url.pathname;
    const site = await orDefault(project.readSite(), { ...DEFAULT_SITE });
    // A single address for every page: /about/ → /about
    if (pathname.length > 1 && pathname.endsWith("/")) {
      // A single "/" at the start: "//other-site.com" would send the visitor to another site.
      return redirect(res, `/${pathname.replace(/^\/+|\/+$/g, "")}${url.search}`, 301);
    }
    const user = auth.userFromRequest(req);
    const found = await pageFor(pathname, user, site);
    if (!found) return sendHtml(req, res, 404, notFoundHtml(site), { "content-security-policy": CSP_STRICT });
    if (found.login) {
      const { login } = found;
      return redirect(res, `${login}${login.includes("?") ? "&" : "?"}next=${encodeURIComponent(pathname + url.search)}`);
    }
    const { page, status } = found;
    const components = await project.loadComponents();
    const zones = await project.readZones();
    const body = renderPage({ page, site, components, mode: "site", user, zones, path: pathname });
    return sendHtml(req, res, status, body, {
      // A page with someone's data on it doesn't stay in the cache: after "Log out", the "Back" button can't show it.
      "cache-control": user ? "no-store" : "private, no-cache",
      // What the page may load and run: strict, relaxed only if it has custom code.
      "content-security-policy": contentSecurityPolicy({ page, site, zones, components }),
    });
  }

  async function authApi(req, res, action) {
    if (action === "me") {
      if (req.method !== "GET") return json(res, 405, { error: "Use GET." });
      return json(res, 200, { user: auth.userFromRequest(req) });
    }
    if (!["login", "logout", "register"].includes(action)) throw visitorError(404, "routeNotFound");
    if (req.method !== "POST") return json(res, 405, { error: "Use POST." });
    checkOrigin(req, !editor);
    const body = await readJsonBody(req, 10_000);
    const secure = isSecure(req);
    if (action === "logout") {
      auth.logout(auth.tokenFromRequest(req));
      res.setHeader("set-cookie", auth.cookie(null, { secure }));
      return json(res, 200, { ok: true });
    }
    const { user, token } =
      action === "login" ? await auth.login(body, clientIp(req)) : await auth.register(body, clientIp(req));
    res.setHeader("set-cookie", auth.cookie(token, { secure }));
    return json(res, 200, { user });
  }

  async function componentApi(req, res, url) {
    const match = url.pathname.match(/^\/api\/c\/([a-z0-9][a-z0-9-]*)(\/[^]*)?$/);
    if (!match) throw visitorError(404, "routeNotFound");
    const [, id, routePath = "/"] = match;
    const routes = await project.loadServerRoutes(id);
    const key = `${req.method} ${routePath}`;
    const handler = routes && Object.hasOwn(routes, key) ? routes[key] : null;
    if (typeof handler !== "function") throw visitorError(404, "routeNotFound");
    let body = {};
    if (BODY_METHODS.has(req.method)) {
      checkOrigin(req, !editor);
      body = await readJsonBody(req);
      // Routes always get an object: `request.body.email` doesn't throw for a `null` or `5` body.
      if (!body || typeof body !== "object" || Array.isArray(body)) throw visitorError(400, "jsonObjectRequired");
    }
    const site = await orDefault(project.readSite(), { ...DEFAULT_SITE });
    const request = {
      method: req.method,
      path: routePath,
      query: Object.fromEntries(url.searchParams),
      body,
      user: auth.userFromRequest(req),
      ip: clientIp(req),
      headers: req.headers,
    };
    const ctx = {
      // The site settings (site.json), e.g. ctx.site.lang to answer in the site's language.
      site,
      data: (name) => store.collection(name),
      // The block with the id `blockId` on the page at the address `path` (e.g. location.pathname), exactly as
      // the visitor sending the request sees it: { block, component, page, path } or null. Null also when the
      // page is members only, the block isn't displayed (a hidden area, "Members only", a page without the
      // shared zones) or it is another kind of block than this route's (or an alias of it, e.g. contact-form).
      block: (path, blockId) => seenBlock(id, path, blockId, request.user, site),
      // One more attempt; above `max` within `minutes` → 429 with `message`. Per visitor address (IPv6: per
      // /64 network), or with `allVisitors: true` a single count for the whole site.
      limit: (options) => routeLimit(id, request.ip, options),
      error(status, text) {
        // Easy to get wrong, e.g. ctx.error("Message") without a status: we still answer with the message (400) and say so in the terminal.
        if (!Number.isInteger(status) || status < 400 || status > 599) {
          console.warn(
            `[blocks] components/${id}.server.js: ctx.error(status, message) wants a status between 400 and 599 first ` +
              `(you gave ${JSON.stringify(status)}). Answering with 400.`,
          );
          throw new HttpError(400, String(text ?? status ?? "Bad request."));
        }
        throw new HttpError(status, text);
      },
    };
    const result = await handler(request, ctx);
    return json(res, 200, result === undefined ? { ok: true } : result);
  }

  // The block on the page for a component route (see ctx.block). The page is rendered as for the visitor,
  // so a block hidden on the page doesn't exist for the route either.
  async function seenBlock(routeType, path, blockId, user, site) {
    if (typeof path !== "string" || typeof blockId !== "string" || !blockId) return null;
    const clean = path.split(/[?#]/)[0];
    const pathname = clean.length > 1 ? `/${clean.replace(/^\/+|\/+$/g, "")}` : clean;
    if (!pathname.startsWith("/")) return null;
    const found = await pageFor(pathname, user, site);
    if (!found?.page) return null;
    const components = await project.loadComponents();
    const zones = await project.readZones();
    const { shown } = renderParts({ page: found.page, site, components, mode: "site", user, zones, path: pathname });
    // An alias (e.g. contact-form, with `alias: "form"`) is the same block as the one it names.
    const family = (type) => (Object.hasOwn(components, type) && typeof components[type].alias === "string" ? components[type].alias : type);
    let match = null;
    for (const blocks of [found.page.blocks, zones.header?.blocks, zones.footer?.blocks]) {
      eachBlock(blocks, (b) => {
        if (!match && b.id === blockId && shown.has(b)) match = b;
      });
    }
    if (!match || family(match.type) !== family(routeType)) return null;
    return { block: structuredClone(match), component: components[match.type], page: structuredClone(found.page), path: pathname };
  }

  // The limits of the component routes, one per time window, shared by every request.
  const limits = new Map(); // minutes → createLimiter
  function routeLimit(routeType, ip, options = {}) {
    const { name = "", max = 10, minutes = 10, message: text = "", allVisitors = false } = options && typeof options === "object" ? options : {};
    const n = Number.isInteger(max) && max > 0 ? max : 10;
    const m = Number.isFinite(minutes) ? Math.min(Math.max(Math.round(minutes), 1), 24 * 60) : 10;
    if (!limits.has(m)) limits.set(m, createLimiter(m * 60 * 1000));
    const limiter = limits.get(m);
    const key = `${routeType}:${String(name).slice(0, 64)}:${allVisitors === true ? "*" : addressKey(ip)}`;
    if (limiter.count(key) >= n) {
      throw typeof text === "string" && text ? new HttpError(429, text) : visitorError(429, "tooManyAttempts");
    }
    limiter.add(key);
  }

  async function upload(req, res, url) {
    const original = basename(String(url.searchParams.get("name") || "image"));
    const ext = extname(original).toLowerCase();
    if (!UPLOAD_EXT.has(ext)) throw new HttpError(400, "You can only upload images (png, jpg, gif, webp, avif).");
    const stem =
      fold(original.slice(0, -ext.length))
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "image";
    const data = await readBody(req, 10 * 1024 * 1024);
    if (!data.length) throw new HttpError(400, "The file is empty.");
    const kind = imageKind(data);
    if (!kind) throw new HttpError(400, "You can only upload images (png, jpg, gif, webp, avif); this file isn't an image.");
    const final = kind === ".jpg" && ext === ".jpeg" ? ext : kind;
    const dir = join(project.dirs.assets, "uploads");
    await mkdir(dir, { recursive: true });
    for (let i = 0; ; i++) {
      const name = i ? `${stem}-${i}${final}` : `${stem}${final}`;
      try {
        await writeFile(join(dir, name), data, { flag: "wx" });
        return json(res, 200, { url: `/assets/uploads/${name}` });
      } catch (err) {
        if (err.code !== "EEXIST") throw err;
      }
    }
  }

  function events(req, res) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  }

  function broadcast(event) {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) res.write(line);
  }

  async function editorApi(req, res, url) {
    const [resource, arg, extra] = url.pathname.slice("/_api/".length).split("/");
    if (extra !== undefined) return json(res, 404, { error: "Route not found." });
    if (req.method !== "GET" && req.method !== "HEAD") {
      // A custom header makes the browser ask first before a request from another site.
      if (req.headers["x-blocks"] !== "1") throw new HttpError(403, "The x-blocks header is missing.");
      checkOrigin(req);
    }

    if (resource === "components" && !arg && req.method === "GET") {
      // With the reason for the ones that don't load (and the line of the mistake), so the editor can show it.
      const failures = await project.componentErrors();
      const list = await project.listComponents();
      return json(res, 200, list.map((c) => (Object.hasOwn(failures, c.id) ? { ...c, error: failures[c.id] } : c)));
    }

    if (resource === "pages") {
      if (!arg) {
        if (req.method !== "GET") return json(res, 405, { error: "Use GET." });
        return json(res, 200, await project.listPages());
      }
      if (!SLUG.test(arg)) throw new HttpError(400, "The page name can only have lowercase letters, digits and hyphens.");
      if (req.method === "GET") {
        const page = await project.readPage(arg);
        return page ? json(res, 200, page) : json(res, 404, { error: "The page doesn't exist." });
      }
      if (req.method === "PUT") {
        const page = validatePage(await readJsonBody(req, 2_000_000));
        await project.writePage(arg, page);
        return json(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        if (arg === "index") throw new HttpError(400, "The home page (index) can't be deleted.");
        return (await project.deletePage(arg)) ? json(res, 200, { ok: true }) : json(res, 404, { error: "The page doesn't exist." });
      }
      return json(res, 405, { error: "Method not allowed." });
    }

    if (resource === "zones" && arg) {
      if (!ZONES.includes(arg)) return json(res, 404, { error: "Unknown zone." });
      if (req.method === "GET") return json(res, 200, (await project.readZone(arg)) || { blocks: [] });
      if (req.method === "PUT") {
        const zone = await readJsonBody(req, 2_000_000);
        if (!zone || typeof zone !== "object" || Array.isArray(zone) || !Array.isArray(zone.blocks ?? [])) {
          throw new HttpError(400, "The zone must have a “blocks” list.");
        }
        const what = arg === "header" ? "The header" : "The footer";
        checkSize(zone, what);
        checkBlocks(zone.blocks, what);
        await project.writeZone(arg, { ...zone, blocks: zone.blocks || [] });
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: "Method not allowed." });
    }

    if (resource === "site" && !arg) {
      if (req.method === "GET") return json(res, 200, await project.readSite());
      if (req.method === "PUT") {
        const site = await readJsonBody(req, 100_000);
        if (!site || typeof site !== "object" || Array.isArray(site)) throw new HttpError(400, "The settings must be an object.");
        checkSize(site, "The site.json file");
        await project.writeSite(site);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: "Method not allowed." });
    }

    if (resource === "upload" && !arg && req.method === "POST") return upload(req, res, url);
    if (resource === "events" && !arg && req.method === "GET") return events(req, res);
    return json(res, 404, { error: "Route not found." });
  }

  async function handle(req, res) {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("x-frame-options", "SAMEORIGIN");

    if (editor && !allowedHost(req.headers.host)) return json(res, 403, { error: "Address not allowed." });

    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    // In dev: the editor and /_api only on localhost, the pages only on 127.0.0.1 (see above).
    const editorOrigin = `http://localhost:${actualPort}`;
    const onEditorHost = editor && String(req.headers.host).toLowerCase() === `localhost:${actualPort}`;

    if (path.startsWith("/core/")) return serveStatic(req, res, project.dirs.core, path.slice("/core/".length));
    if (path.startsWith("/components/")) {
      const name = path.slice("/components/".length);
      // Only <id>.js; the server part (<id>.server.js) never goes to the browser.
      if (!COMPONENT_FILE.test(name)) return json(res, 404, { error: "File not found." });
      return serveStatic(req, res, project.dirs.components, name);
    }
    if (path.startsWith("/assets/")) return serveStatic(req, res, project.dirs.assets, path.slice("/assets/".length));

    if (editor) {
      if (path === "/_editor" || path.startsWith("/_editor/")) {
        const rel = path.slice("/_editor/".length);
        if (!onEditorHost || path === "/_editor") return redirect(res, `${editorOrigin}/_editor/${rel}${url.search}`);
        // A site page opened from the editor ("View page") doesn't get window.opener:
        // the code on it couldn't move the editor's tab to another address.
        res.setHeader("cross-origin-opener-policy", "same-origin");
        return serveStatic(req, res, project.dirs.editor, rel || "index.html");
      }
      if (path.startsWith("/_api/")) {
        if (!onEditorHost) return json(res, 403, { error: `The editor only answers on ${editorOrigin}.` });
        return editorApi(req, res, url);
      }
    }

    if (path.startsWith("/api/auth/")) return authApi(req, res, path.slice("/api/auth/".length));
    if (path.startsWith("/api/c/")) return componentApi(req, res, url);
    if (path.startsWith("/api/")) throw visitorError(404, "routeNotFound");
    if (path.startsWith("/_")) return json(res, 404, { error: "Route not found." });

    if (req.method === "GET" || req.method === "HEAD") {
      // An absolute address: "//other-site.com" stays a path on 127.0.0.1, it doesn't send anyone to another site.
      if (onEditorHost) return redirect(res, `http://127.0.0.1:${actualPort}${path}${url.search}`);
      return servePage(req, res, url).catch((err) => pageFailed(req, res, err));
    }
    // A form sent before JavaScript started (or without it) lands here:
    // the visitor is sent back to the page instead of seeing a JSON answer.
    const type = String(req.headers["content-type"] || "").toLowerCase();
    if (req.method === "POST" && !type.includes("json")) return redirect(res, `/${path.replace(/^\/+/, "")}${url.search}`, 303);
    return json(res, 405, { error: "Method not allowed." });
  }

  // The answer to an error: the visitor's messages in the site's language (the editor's API in English).
  async function failed(req, res, err) {
    // An invalid status (e.g. ctx.error(42, ...)) would make writeHead throw and stop the server.
    const valid = err instanceof HttpError && Number.isInteger(err.status) && err.status >= 400 && err.status <= 599;
    const status = valid ? err.status : 500;
    // `reported`: the error was already explained in the terminal (e.g. a .server.js that doesn't load).
    if (status === 500 && !err.reported) console.error("[blocks] Error:", err);
    if (res.headersSent) return res.end();
    const forEditor = String(req.url).startsWith("/_api/");
    const lang = forEditor ? "en" : status === 500 || err.key ? siteLang(await readSiteQuietly()) : "en";
    if (res.headersSent) return res.end();
    const text = status === 500 ? message(lang, "serverError") : err.key ? message(lang, err.key, err.values) : err.message;
    json(res, status, { error: text });
  }

  const server = createServer((req, res) => {
    handle(req, res)
      .catch((err) => failed(req, res, err))
      .catch((err) => {
        console.error("[blocks] Error:", err);
        if (!res.headersSent) json(res, 500, { error: message("en", "serverError") });
        else res.end();
      });
  });

  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, listenHost, () => {
      server.off("error", fail);
      ok();
    });
  });
  actualPort = server.address().port;

  let heartbeat = null;
  if (editor) {
    // Tells the editor when files change (e.g. a programmer edits a component).
    const timers = new Map();
    const notify = (event) => {
      const key = JSON.stringify(event);
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => (timers.delete(key), broadcast(event)), 80));
    };
    for (const [dir, type] of [
      [project.dirs.components, "components"],
      [project.dirs.pages, "pages"],
    ]) {
      mkdirSync(dir, { recursive: true });
      watchers.push(watch(dir, (_, file) => file && !file.endsWith(".tmp") && notify({ type, file: String(file) })));
    }
    watchers.push(
      watch(project.dirs.root, (_, file) => String(file) === "site.json" && notify({ type: "site", file: "site.json" })),
    );
    heartbeat = setInterval(() => {
      for (const res of clients) res.write(": ping\n\n");
    }, 25_000);
  }

  const shownHost = listenHost === "0.0.0.0" ? "localhost" : listenHost === "127.0.0.1" ? "localhost" : listenHost;
  const url = `http://${shownHost}:${actualPort}`;
  if (!quiet) {
    console.log(`\n  Blocks is running (${editor ? "dev" : "start"})`);
    if (editor) console.log(`  Editor:  ${url}/_editor/`);
    // In dev, the site lives on another origin than the editor (see above).
    console.log(`  Site:    ${editor ? `http://127.0.0.1:${actualPort}` : url}/\n`);
  }

  return {
    url,
    port: actualPort,
    server,
    close() {
      clearInterval(heartbeat);
      for (const w of watchers) w.close();
      for (const res of clients) res.end();
      clients.clear();
      return new Promise((ok) => server.close(() => ok()));
    },
  };
}
