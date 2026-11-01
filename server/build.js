// Static export: turns the pages into HTML files in dist/, ready to upload to any hosting
// (no Node needed). What needs the server (login, forms, members-only pages) doesn't work in the
// static export, so the export warns you. The members-only pages are left out, and so are the links
// to them in the Header and the Footer (ctx.reachable), so visitors don't land on "Page not found".
//
// Errors (a page with broken JSON, a component that doesn't load, a block that doesn't render)
// don't stop the export, but they are collected in `errors`: the `build` command shows them and
// ends with an error code.
//
// Every page gets the safety rules (server/csp.js) as a <meta>; the pages with custom code, where
// the rules are relaxed, are named at the end, with the reason.

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { eachBlock, renderPage } from "../core/render.js";
import { contentSecurityPolicy, foreignCode } from "./csp.js";
import { createProject, DEFAULT_SITE, pathForSlug } from "./project.js";

// The export folder is deleted on every export, so it can't be (or sit inside) one of the project's folders.
const PROTECTED = new Set(["core", "components", "pages", "assets", "data", "editor", "server", "docs", "test", "node_modules"]);

// The "/x" addresses in a page become "/base/x", for a site uploaded into a subfolder (e.g. /project/).
function withBase(text, base) {
  return text
    .replace(/(\s(?:href|src)=")\/(?!\/)/g, `$1${base}`)
    .replace(/<style>[^]*?<\/style>/g, (css) => css.replace(/(url\(\s*['"]?)\/(?!\/)/g, `$1${base}`));
}

// The addresses on the same site ("/products", "/assets/a.png") the page points to.
function localLinks(text) {
  const out = new Set();
  for (const [, value] of text.matchAll(/\s(?:href|src)="(\/(?!\/)[^"#?]*)/g)) {
    try {
      out.add(decodeURIComponent(value.replace(/&amp;/g, "&")));
    } catch {
      out.add(value);
    }
  }
  return out;
}

// "Page “Home” has", "Pages “Home”, “Products” and 4 more have", "All pages have"
//   label: how each name shows (between quotes by default)
function pagesHave(names, total, label = (n) => `“${n}”`) {
  const list = [...names].map(label);
  if (list.length === 1) return `Page ${list[0]} has`;
  if (list.length === total) return "All pages have";
  const shown = list.length > 3 ? `${list.slice(0, 3).join(", ")} and ${list.length - 3} more` : list.join(", ");
  return `Pages ${shown} have`;
}

export async function buildSite({ root, out = join(root, "dist"), base = "/", quiet = false } = {}) {
  const warnings = [];
  const errors = [];
  const relaxedBy = new Map(); // reason → the pages with it (e.g. a script in "head" is on all of them)
  const project = createProject(root, { warn: (m) => warnings.push(m), error: (m) => errors.push(m) });
  const log = quiet ? () => {} : (...args) => console.log(...args);
  const outDir = resolve(out);
  if (!outDir.startsWith(resolve(root) + sep)) {
    throw new Error("The export folder must be inside the project (e.g. dist/).");
  }
  const rel = relative(resolve(root), outDir);
  // Lowercase: on macOS and Windows "Pages" is the same folder as "pages".
  const first = rel.split(sep)[0].toLowerCase();
  if (PROTECTED.has(first) || first.startsWith(".") || (existsSync(outDir) && !statSync(outDir).isDirectory())) {
    throw new Error(`Exporting to “${rel}” would delete project files. Choose a new folder (e.g. dist/).`);
  }
  const prefix = `/${String(base).replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
  if (!/^\/([A-Za-z0-9._~-]+\/)*$/.test(prefix) || prefix.split("/").some((part) => /^\.+$/.test(part))) {
    throw new Error(`The base “${base}” isn't valid. Write the subfolder's path, e.g. --base /project/.`);
  }

  let site;
  try {
    site = await project.readSite();
  } catch (err) {
    errors.push(`${err.message}. Exported with the default name and colors.`);
    site = { ...DEFAULT_SITE };
  }
  const components = await project.loadComponents();
  const zones = await project.readZones();
  const withServer = new Set((await project.listComponents()).filter((c) => c.hasServer).map((c) => c.id));
  const componentName = (type) => components[type]?.name || type;
  const written = [];
  const membersOnly = new Set(); // the paths of the pages that aren't exported
  const linksFrom = new Map(); // path → the names of the pages that point to it
  const reported = new Set();

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // First all the pages, so every page knows which ones are left out (for its menus).
  const exported = [];
  for (const { slug, title } of await project.listPages()) {
    let page;
    try {
      page = await project.readPage(slug);
    } catch (err) {
      errors.push(`${err.message}. The page wasn't exported.`); // changed just now
      continue;
    }
    if (!page) continue;
    const name = `“${title}” (${pathForSlug(slug)})`;
    if (page.access === "members") {
      membersOnly.add(pathForSlug(slug));
      warnings.push(`Page ${name} is for members only, so it isn't exported (it needs the server).`);
      continue;
    }
    exported.push({ slug, title, name, page });
  }

  for (const { slug, title, name, page } of exported) {
    const needsServer = new Set();
    const zoneBlocks = page.zones === false ? [] : [...(zones.header?.blocks || []), ...(zones.footer?.blocks || [])];
    eachBlock([...zoneBlocks, ...(page.blocks || [])], (block) => {
      if (withServer.has(block.type) || components[block.type]?.needsServer === true) needsServer.add(block.type);
    });
    for (const type of needsServer) {
      warnings.push(`Page ${name} uses “${componentName(type)}”, which needs the server and won't work in the static export.`);
    }

    // The blocks that don't render are missing from the page: we name them.
    const onError = ({ type, zone, error }) => {
      const where = zone ? `In the ${zone}` : `On page ${name}`;
      const message = error
        ? `${where}, the “${componentName(type)}” block failed and is missing from the export: ${error.message}`
        : `${where}, the component “${type}” doesn't exist (or couldn't be loaded), so its block is missing from the export.`;
      if (reported.has(message)) return; // a broken block in the header shows up on every page
      reported.add(message);
      errors.push(message);
    };
    const file = slug === "index" ? "index.html" : slug === "404" ? "404.html" : join(slug, "index.html");
    for (const reason of foreignCode({ page, site, zones, components })) {
      relaxedBy.set(reason, [...(relaxedBy.get(reason) || []), name]);
    }
    const csp = contentSecurityPolicy({ page, site, zones, components }, { meta: true });
    const htmlText = renderPage({
      page, site, components, mode: "static", user: null, zones, onError, path: pathForSlug(slug), csp, missingPages: membersOnly,
    });
    for (const link of localLinks(htmlText)) {
      if (!linksFrom.has(link)) linksFrom.set(link, new Set());
      linksFrom.get(link).add(title);
    }
    await mkdir(join(outDir, file, ".."), { recursive: true });
    await writeFile(join(outDir, file), prefix === "/" ? htmlText : withBase(htmlText, prefix));
    written.push(file);
  }

  await cp(project.dirs.core, join(outDir, "core"), { recursive: true });
  await mkdir(join(outDir, "components"), { recursive: true });
  for (const { id } of await project.listComponents()) {
    // Only the browser part, and only the components that loaded; *.server.js stays at home.
    if (components[id]) await cp(join(project.dirs.components, `${id}.js`), join(outDir, "components", `${id}.js`));
  }
  if (existsSync(project.dirs.assets)) {
    await cp(project.dirs.assets, join(outDir, "assets"), {
      recursive: true,
      filter: (src) => !/(^|[/\\])\.[^/\\]+$/.test(src),
    });
  }

  // Links and images pointing to what isn't in the export (e.g. a button to a members-only page).
  for (const [link, pages] of linksFrom) {
    const target = resolve(outDir, link.replace(/^\/+/, ""));
    const inside = target === outDir || target.startsWith(outDir + sep);
    const found = inside && (existsSync(join(target, "index.html")) || (existsSync(target) && statSync(target).isFile()));
    if (found) continue;
    const pathname = link.replace(/\/+$/, "") || "/";
    warnings.push(
      membersOnly.has(pathname)
        ? `${pagesHave(pages, written.length)} a link to “${pathname}”, which is for members only and isn't in the export (visitors land on the 404 page).`
        : `${pagesHave(pages, written.length)} a link or an image pointing to “${link}”, which doesn't exist in the export.`,
    );
  }

  // The pages where the safety rules are relaxed, with the reason (e.g. the “Embed code” block).
  const relaxed = [...relaxedBy].map(
    ([reason, names]) =>
      `${pagesHave(names, written.length, (n) => n)} custom code (${reason}), ` +
      `so the safety rules are relaxed on ${names.length === 1 ? "it" : "them"}.`,
  );

  log(errors.length ? `\n  Export finished with errors, in ${outDir}` : `\n  Export ready in ${outDir}`);
  for (const file of written) log(`    ${file}`);
  if (prefix !== "/") log(`  Addresses start with ${prefix}: the folder's contents must end up at https://…${prefix}`);
  if (relaxed.length) {
    log("\n  Safety:");
    for (const r of relaxed) log(`    - ${r}`);
  }
  if (warnings.length) {
    log("\n  Warnings:");
    for (const w of warnings) log(`    - ${w}`);
    log("    To make these work, publish with the server: node blocks.js start");
  }
  if (errors.length) {
    log(`\n  Errors (${errors.length}):`);
    for (const e of errors) log(`    - ${e.replace(/\n/g, "\n      ")}`);
    log("    The export is incomplete: fix what's above and export again.");
  }
  log("");
  return { outDir, written, warnings, errors, relaxed };
}
