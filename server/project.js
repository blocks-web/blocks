// A project's files: components, pages, the site settings.
//
//   components/<id>.js         a component (it also runs in the browser)
//   components/<id>.server.js  its optional server part (it never reaches the browser)
//   pages/<slug>.json          a page; index.json is the home page (/)
//   pages/_header.json, _footer.json   the shared zones, shown on every page
//   site.json                  the site's name, theme and login page
//   assets/                    images and other public files
//   data/                      the data saved by the server (accounts, messages)

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { eachBlock, validateComponent, ZONES } from "../core/render.js";

export const COMPONENT_FILE = /^([a-z0-9][a-z0-9-]*)\.js$/;
export const SERVER_FILE = /^([a-z0-9][a-z0-9-]*)\.server\.js$/;
export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const DEFAULT_SITE = {
  name: "My site",
  lang: "en",
  theme: {},
  loginPage: "/login",
};

export function pathForSlug(slug) {
  return slug === "index" ? "/" : `/${slug}`;
}

// "/" → "index", "/about" or "/about/" → "about"; anything else → null
export function slugForPath(pathname) {
  if (pathname === "/" || pathname === "") return "index";
  const slug = pathname.replace(/^\/+|\/+$/g, "");
  if (slug === "index") return null; // the home page has a single address: /
  return SLUG.test(slug) ? slug : null;
}

// The starting file for `node blocks.js component <id>`.
export function componentTemplate(id) {
  const name = id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  return `import { html, inline, paragraphs } from "../core/html.js";

// The “${name}” block. Save the file and the editor loads it by itself.
export default {
  name: "${name}", // the name in the palette; it can have spaces and accents (e.g. “Café menu”)
  category: "My blocks", // the first palette category; any other name becomes a category of your own, also at the top
  icon: "block", // an icon name from docs/DESIGN.md, or an emoji
  description: "Say in a few words what it does.",
  tip: "A short tip for whoever uses the block.", // shown on hover, after the description

  // What people can change in the panel on the right.
  // format: true → the title accepts **bold**, *italic* and [link](/page); a "longtext" always does.
  props: {
    title: { type: "text", format: true, label: "Title", default: "Hello!" },
    text: { type: "longtext", label: "Text", default: "Write something here.\\n\\nAn empty line starts a new paragraph." },
  },

  // The block's HTML. Everything inside \${...} is escaped automatically.
  // b-block adds space above and below (it goes away inside sections and columns), b-container sets the width.
  html(p) {
    return html\`<div class="b-block"><div class="b-container">
      <h2>\${inline(p.title)}</h2>
      \${paragraphs(p.text)}
    </div></div>\`;
  },

  // .c-${id} wraps every block of this kind: put it in front of your rules so they don't touch the rest of the page.
  css: \`
    .c-${id} h2 { color: var(--primary); }
  \`,

  // Optional: JavaScript that runs in the browser for each block.
  // js(el, p, api) {
  //   el.querySelector("h2").addEventListener("click", () => alert(p.title));
  // },
};
`;
}

// The keys of a .server.js: the method in capital letters, a space and the path (e.g. "POST /submit").
const ROUTE_KEY = /^(GET|POST|PUT|PATCH|DELETE) \/\S*$/;

function validateRoutes(routes) {
  const out = [];
  for (const [key, handler] of Object.entries(routes)) {
    if (!ROUTE_KEY.test(key)) {
      out.push(`the route “${key}” will never answer. Write the method in capital letters, a space and the path with “/”, e.g. “POST /submit”.`);
    } else if (typeof handler !== "function") {
      out.push(`the route “${key}” must be a function: (request, ctx) => { ... }.`);
    }
  }
  return out;
}

// `node --check` with the file as an ES module; returns what it prints on errors (empty if the syntax is fine).
function checkSyntax(source) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, ["--input-type=module", "--check"], { stdio: ["pipe", "ignore", "pipe"], timeout: 5000 });
    let out = "";
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("error", () => ok(""));
    child.on("close", () => ok(out));
    child.stdin.on("error", () => {});
    child.stdin.end(source);
  });
}

// Why a file didn't load, with the line of the mistake. For syntax errors, Node doesn't tell the line
// at import(), so we find it with `node --check`.
async function describeLoadError(file, rel, err) {
  const message = err?.message || String(err);
  if (err instanceof SyntaxError) {
    const report = await checkSyntax(await readFile(file, "utf8").catch(() => ""));
    const m = report.match(/^\[stdin\]:(\d+)\n(.*)\n(.*)\n/);
    // The line of code and a "^" under the mistake; for "Unexpected end of input" the line is empty (a brace is missing).
    if (m) return `${rel}, line ${m[1]}: ${message}${m[2].trim() ? `\n    ${m[2]}\n    ${m[3]}` : ""}`;
  }
  // Another error (e.g. while running the file): the line is in the "stack", after the file's address (we
  // only look for its end, "components/x.js", because Node may show the real path of a linked folder).
  const tail = rel.split(sep).join("/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const at = String(err?.stack || "").match(new RegExp(`/${tail}(?:\\?[^:]*)?:(\\d+)`));
  return at ? `${rel}, line ${at[1]}: ${message}` : `${rel}: ${message}`;
}

let tmpCount = 0;

async function writeAtomic(file, text) {
  // A unique name: two saves of the same file at once don't write to the same temporary file.
  const tmp = `${file}.${process.pid}.${++tmpCount}.tmp`;
  try {
    await writeFile(tmp, text);
    await rename(tmp, file);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

// `report` receives the warnings and errors (by default: in the terminal). The static export collects them.
export function createProject(root, report = {}) {
  const warn = report.warn || ((message) => console.warn(`[blocks] ${message}`));
  const error = report.error || ((message) => console.error(`[blocks] ${message}`));
  const dirs = {
    root,
    components: join(root, "components"),
    pages: join(root, "pages"),
    assets: join(root, "assets"),
    data: join(root, "data"),
    core: join(root, "core"),
    editor: join(root, "editor"),
  };
  const siteFile = join(root, "site.json");
  const modules = new Map(); // file → { mtime, module } or { mtime, error, message }
  const skipped = new Set(); // files with a wrong name, reported once
  let failures = {}; // id → why the component didn't load, at the last loadComponents (with the line of the mistake)

  // Imports a module and reloads it if the file changed since it was last read. It also remembers the
  // errors, so a broken file is reported once per version, not on every request.
  //   → { module } or { error, message }, plus `fresh` (the first read of this version)
  async function importFresh(file) {
    const { mtimeMs } = await stat(file);
    const cached = modules.get(file);
    if (cached && cached.mtime === mtimeMs) return { ...cached, fresh: false };
    const entry = { mtime: mtimeMs };
    try {
      entry.module = await import(`${pathToFileURL(file).href}?v=${mtimeMs}`);
    } catch (err) {
      entry.error = err;
      entry.message = await describeLoadError(file, relative(root, file), err);
    }
    if (modules.get(file)?.mtime === mtimeMs) return { ...modules.get(file), fresh: false }; // another request was faster
    modules.set(file, entry);
    return { ...entry, fresh: true };
  }

  async function readJson(file) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return null;
      const rel = relative(root, file);
      throw Object.assign(new Error(`The file ${rel} isn't valid JSON: ${err.message}`), { file: rel });
    }
  }

  function skip(rel, why) {
    if (skipped.has(rel)) return;
    skipped.add(rel);
    warn(`Skipped ${rel}: ${why}`);
  }

  async function listDir(dir) {
    try {
      return await readdir(dir);
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }

  return {
    dirs,

    // [{ id, hasServer }]
    async listComponents() {
      const files = await listDir(dirs.components);
      for (const f of files) {
        if (f.endsWith(".js") && !f.startsWith(".") && !COMPONENT_FILE.test(f) && !SERVER_FILE.test(f)) {
          skip(`components/${f}`, "the name can only have lowercase letters, digits and hyphens (e.g. product-price.js).");
        }
      }
      const servers = new Set(files.map((f) => f.match(SERVER_FILE)?.[1]).filter(Boolean));
      return files
        .map((f) => f.match(COMPONENT_FILE)?.[1])
        .filter(Boolean)
        .sort()
        .map((id) => ({ id, hasServer: servers.has(id) }));
    },

    // { id: component } — a component with errors is skipped (and reported once); it doesn't stop the server.
    async loadComponents() {
      const out = {};
      const latest = {};
      for (const { id } of await this.listComponents()) {
        const rel = `components/${id}.js`;
        let entry;
        try {
          entry = await importFresh(join(dirs.components, `${id}.js`));
        } catch (err) {
          error(`Couldn't load ${rel}: ${err.message}`); // e.g. deleted just now
          continue;
        }
        const component = entry.module?.default;
        if (entry.error || !component || typeof component.html !== "function") {
          latest[id] = entry.error ? entry.message : `${rel} doesn't export a component with html(p, ctx).`;
          if (entry.fresh) error(entry.error ? `Couldn't load ${entry.message}` : `${rel} doesn't export a component with html(p, ctx).`);
          continue;
        }
        if (entry.fresh) for (const message of validateComponent(component)) warn(`${rel}: ${message}`);
        out[id] = component;
      }
      failures = latest;
      return out;
    },

    // { id: message } for the components that don't load, e.g. "components/x.js, line 12: Unexpected …"
    // (`node --check` finds the line; the browser doesn't tell it). The editor shows them.
    async componentErrors() {
      await this.loadComponents();
      return { ...failures };
    },

    // A component's server routes, or null if it has none.
    async loadServerRoutes(id) {
      if (!COMPONENT_FILE.test(`${id}.js`)) return null;
      let entry;
      try {
        entry = await importFresh(join(dirs.components, `${id}.server.js`));
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
      if (entry.error) {
        if (entry.fresh) error(`Couldn't load ${entry.message}`);
        throw Object.assign(new Error(entry.message), { reported: true });
      }
      const routes = entry.module.default && typeof entry.module.default === "object" ? entry.module.default : null;
      if (entry.fresh && routes) for (const message of validateRoutes(routes)) warn(`components/${id}.server.js: ${message}`);
      return routes;
    },

    // [{ slug, title, path, access, types }] — a page with broken JSON is skipped (and reported).
    // types: the kinds of blocks on the page (without the shared zones), e.g. so the editor knows where the login block is.
    async listPages() {
      const out = [];
      for (const file of (await listDir(dirs.pages)).sort()) {
        const slug = file.endsWith(".json") ? file.slice(0, -5) : null;
        if (!slug || !SLUG.test(slug)) {
          if (slug && !/^[_.]/.test(slug)) {
            skip(`pages/${file}`, "the name can only have lowercase letters, digits and hyphens (e.g. about.json); the page's address comes from it.");
          }
          continue;
        }
        try {
          const page = await readJson(join(dirs.pages, file));
          const types = new Set();
          eachBlock(page?.blocks, (b) => typeof b.type === "string" && types.add(b.type));
          out.push({ slug, title: page?.title || slug, path: pathForSlug(slug), access: page?.access || "public", types: [...types].sort() });
        } catch (err) {
          error(`${err.message}. The page is skipped until you fix it.`);
        }
      }
      return out;
    },

    async readPage(slug) {
      if (!SLUG.test(slug)) return null;
      return readJson(join(dirs.pages, `${slug}.json`));
    },

    async writePage(slug, page) {
      if (!SLUG.test(slug)) throw new Error("Invalid page name.");
      await mkdir(dirs.pages, { recursive: true });
      await writeAtomic(join(dirs.pages, `${slug}.json`), `${JSON.stringify(page, null, 2)}\n`);
    },

    async deletePage(slug) {
      if (!SLUG.test(slug)) return false;
      try {
        await unlink(join(dirs.pages, `${slug}.json`));
        return true;
      } catch (err) {
        if (err.code === "ENOENT") return false;
        throw err;
      }
    },

    // The shared zones (header, footer): pages/_header.json, pages/_footer.json
    async readZone(name) {
      if (!ZONES.includes(name)) return null;
      return readJson(join(dirs.pages, `_${name}.json`));
    },

    // For rendering: a zone with broken JSON is reported and left out; the rest of the page works.
    async readZones() {
      const out = {};
      for (const name of ZONES) {
        try {
          out[name] = (await this.readZone(name)) || { blocks: [] };
        } catch (err) {
          error(`${err.message}. Pages show without the ${name} until you fix it.`);
          out[name] = { blocks: [] };
        }
      }
      return out;
    },

    async writeZone(name, zone) {
      if (!ZONES.includes(name)) throw new Error("Unknown zone.");
      await mkdir(dirs.pages, { recursive: true });
      await writeAtomic(join(dirs.pages, `_${name}.json`), `${JSON.stringify(zone, null, 2)}\n`);
    },

    async readSite() {
      const site = (await readJson(siteFile)) || {};
      return { ...DEFAULT_SITE, ...site, theme: { ...DEFAULT_SITE.theme, ...(site.theme || {}) } };
    },

    async writeSite(site) {
      await writeAtomic(siteFile, `${JSON.stringify(site, null, 2)}\n`);
    },
  };
}
