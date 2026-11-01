// The public docs: their links and images exist, and the code they show really works.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createProject } from "../server/project.js";
import { renderParts } from "../core/render.js";
import { startServer } from "../server/server.js";
import { makeProject, PROJECT_ROOT, removeProject, send, sendJson } from "./helpers.js";

const read = (rel) => readFileSync(join(PROJECT_ROOT, rel), "utf8");

// The docs anyone can read on GitHub: the top-level files and docs/*.md.
const DOCS = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ...readdirSync(join(PROJECT_ROOT, "docs"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/${f}`),
];

// Markdown without its code: `[text](address)` inside code is an example, not a link.
const prose = (text) => text.replace(/```[^]*?```/g, "").replace(/`[^`\n]*`/g, "");

// The relative links and images of a Markdown file: [text](target), src="target", href="target".
function localTargets(text) {
  const found = [...prose(text).matchAll(/\]\(([^)\s]+)\)|(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  return found.filter((t) => !/^(https?:|mailto:|#)/.test(t)).map((t) => t.split("#")[0]);
}

// The code blocks of the README, by the comment on their first line ("// components/notice.js").
function readmeCode(firstLine) {
  const blocks = [...read("README.md").matchAll(/```js\n([^]*?)```/g)].map((m) => m[1]);
  const found = blocks.find((b) => b.trimStart().startsWith(firstLine));
  assert.ok(found, `the README has no code block starting with “${firstLine}”`);
  // A block inside a list item is indented by two spaces.
  return found.startsWith("  ") ? found.replace(/^ {2}/gm, "") : found;
}

describe("the public docs", () => {
  test("every relative link and image points to a file that exists", () => {
    for (const doc of DOCS) {
      for (const target of localTargets(read(doc))) {
        const file = join(PROJECT_ROOT, dirname(doc), target);
        assert.ok(existsSync(file), `${doc} links to “${target}”, which doesn't exist`);
        assert.ok(!relative(PROJECT_ROOT, file).startsWith(join("docs", "propuneri")), `${doc} links to the internal docs: “${target}”`);
      }
    }
  });

  test("the Romanian docs are gone, and nothing points to them", () => {
    const old = ["FILOSOFIE", "ARHITECTURA"].map((name) => `${name}.md`);
    for (const name of old) assert.ok(!existsSync(join(PROJECT_ROOT, "docs", name)), `docs/${name} still exists`);
    const code = ["blocks.js", "core", "server", "editor", "components", "test"].flatMap((dir) => {
      const path = join(PROJECT_ROOT, dir);
      return statSync(path).isFile() ? [dir] : readdirSync(path).filter((f) => /\.(js|html|css)$/.test(f)).map((f) => `${dir}/${f}`);
    });
    for (const file of [...DOCS, ...code]) {
      const text = read(file);
      for (const name of old) assert.ok(!text.includes(name), `${file} still mentions ${name}`);
    }
  });

  test("the screenshots are PNG files under 300 KB, and the README shows each one", () => {
    const readme = read("README.md");
    const images = readdirSync(join(PROJECT_ROOT, "docs", "images"));
    assert.ok(images.length >= 3);
    for (const name of images) {
      const file = join(PROJECT_ROOT, "docs", "images", name);
      assert.match(name, /^[a-z0-9-]+\.png$/);
      assert.equal(readFileSync(file).subarray(1, 4).toString(), "PNG");
      assert.ok(statSync(file).size < 300 * 1024, `docs/images/${name} is over 300 KB`);
      assert.ok(readme.includes(`docs/images/${name}`), `the README doesn't show docs/images/${name}`);
    }
  });

  test("the social preview is a 1280 × 640 PNG", () => {
    const png = readFileSync(join(PROJECT_ROOT, ".github", "social-preview.png"));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1280, 640]);
  });

  test("the issue forms and their links are in place", () => {
    for (const name of ["bug.yml", "idea.yml", "config.yml"]) {
      assert.ok(existsSync(join(PROJECT_ROOT, ".github", "ISSUE_TEMPLATE", name)), `.github/ISSUE_TEMPLATE/${name} is missing`);
    }
    const readme = read("README.md");
    assert.ok(readme.includes("issues/new?template=bug.yml"));
    assert.ok(readme.includes("issues/new?template=idea.yml"));
  });

  test("the README starts the way the docs promise: the logo, the promise and the three commands", () => {
    const readme = read("README.md");
    assert.ok(readme.includes('src="editor/logo/shrimp-256.png"'));
    assert.ok(readme.includes("Build websites from blocks. Simple, yet everything possible."));
    assert.ok(readme.includes("git clone https://github.com/blocks-web/blocks.git\ncd blocks\nnode blocks.js dev\n"));
    assert.ok(readme.includes("http://localhost:3000/_editor/") && readme.includes("http://127.0.0.1:3000/"));
  });
});

describe("the README's block example really works", () => {
  let root;
  let srv;

  before(async () => {
    root = makeProject({
      "components/notice.js": readmeCode("// components/notice.js"),
      "components/notice.server.js": readmeCode("// components/notice.server.js"),
      "pages/index.json": {
        title: "Home",
        blocks: [
          { id: "b_1", type: "notice", props: {} },
          { id: "b_2", type: "notice", props: { text: "<script>alert(1)</script> *today*", tone: 'bright" onclick="alert(1)' } },
        ],
      },
      "site.json": { name: "Example", lang: "en" },
    });
    srv = await startServer({ root, mode: "start", host: "127.0.0.1", port: 0, quiet: true });
  });
  after(async () => {
    await srv?.close();
    removeProject(root);
  });

  test("Notice loads with no warnings and displays safely", async () => {
    const components = await createProject(root, { warn: assert.fail, error: assert.fail }).loadComponents();
    const notice = components.notice;
    assert.equal(notice.name, "Notice");
    assert.equal(notice.category, "My blocks");
    const page = JSON.parse(readFileSync(join(root, "pages", "index.json"), "utf8"));
    const { body, css } = renderParts({ page, components, mode: "site" });
    assert.ok(body.includes('<div class="b-block notice notice--calm">'));
    assert.ok(body.includes("Open this <strong>Sunday</strong>, 9 to 5."));
    // What someone typed stays text, and a choice is always one of its options.
    assert.ok(body.includes("&lt;script&gt;alert(1)&lt;/script&gt; <em>today</em>"));
    assert.ok(!body.includes("onclick"));
    assert.ok(css.includes(".notice--bright { background: var(--primary); color: #fff; }"));
  });

  test("its server part answers, counts and stops after 5 tries", async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await sendJson(srv.port, "/api/c/notice/like", { page: "/" });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json(), { likes: i });
    }
    const sixth = await sendJson(srv.port, "/api/c/notice/like", { page: "/" });
    assert.equal(sixth.status, 429);
    // The server part never reaches the browser.
    assert.equal((await send(srv.port, "/components/notice.server.js")).status, 404);
  });
});
