// Shared tools for the tests: temporary projects and "raw" HTTP requests.
// (node --test also runs this file as a test, because it sits in test/; it holds no tests, so it passes.)
//
// The tests never touch the real project's data/, pages/, components/ or site.json:
// each one works in a temporary folder with a copy of core/.

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Writes files into a folder: { "pages/index.json": object | text | Buffer }
export function writeFiles(root, files = {}) {
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    const text = typeof content === "string" || Buffer.isBuffer(content) ? content : `${JSON.stringify(content, null, 2)}\n`;
    writeFileSync(file, text);
  }
}

// A new project in a temporary folder, with a copy of the real project's core/.
export function makeProject(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "blocks-test-"));
  cpSync(join(PROJECT_ROOT, "core"), join(root, "core"), { recursive: true });
  writeFiles(root, files);
  return root;
}

export function removeProject(root) {
  if (root) rmSync(root, { recursive: true, force: true });
}

// An HTTP request with node:http: the path goes out exactly as written (fetch would normalize "..").
//   → { status, headers, text, json() }
export function send(port, path, { method = "GET", headers = {}, body, timeout = 5000 } = {}) {
  return new Promise((ok, fail) => {
    // A header with the value undefined means "don't send it".
    const all = Object.fromEntries(Object.entries({ host: `127.0.0.1:${port}`, ...headers }).filter(([, v]) => v !== undefined));
    const req = request(
      { host: "127.0.0.1", port, path, method, agent: false, headers: all },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", fail);
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString("utf8");
          ok({ status: res.statusCode, headers: res.headers, buffer, text, json: () => JSON.parse(text) });
        });
      },
    );
    req.on("error", fail);
    // A stuck server must not block the tests.
    req.setTimeout(timeout, () => req.destroy(new Error(`No answer within ${timeout} ms: ${method} ${path}`)));
    if (body === undefined) req.end();
    else req.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  });
}

// A JSON POST/PUT "from the same site", the way the browser sends it.
export function sendJson(port, path, body, { method = "POST", headers = {} } = {}) {
  return send(port, path, {
    method,
    body,
    headers: { "content-type": "application/json", origin: `http://127.0.0.1:${port}`, ...headers },
  });
}

// Only the name=value pair from the set-cookie header (for the next requests).
export function cookieFrom(res) {
  const header = [].concat(res.headers["set-cookie"] || [])[0] || "";
  return header.split(";")[0];
}

// The source of a test component (a components/<id>.js file).
export function componentSource(body) {
  return `import { html, url, raw } from "../core/html.js";\n\nexport default ${body};\n`;
}
