#!/usr/bin/env node
// Blocks: build websites from blocks.
//
//   node blocks.js dev                the editor + the site, on your computer
//   node blocks.js start              only the site (no editor), for publishing
//   node blocks.js build              exports a static site to dist/
//   node blocks.js component <id>     creates a new component from the template
//   node blocks.js messages           shows the messages sent through the site's forms
//   node blocks.js account ...        the visitors' accounts (list, logout, delete)

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server/server.js";
import { buildSite } from "./server/build.js";
import { componentTemplate } from "./server/project.js";
import { createStore } from "./server/store.js";
import { createAuth } from "./server/auth.js";
import { plural as count } from "./core/html.js"; // "1 message", "2 messages"

const root = dirname(fileURLToPath(import.meta.url));
const [command, ...args] = process.argv.slice(2);

// --name value or --name=value
function option(name, fallback) {
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

// Stops the command with a message for a person (no "stack trace").
function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
};

const HELP = (port) => `
  Blocks – build websites from blocks

    node blocks.js dev                     the editor + the site (http://localhost:${port}/_editor/)
    node blocks.js start                   only the site, for publishing (HOST, PORT from the environment)
    node blocks.js build                   exports a static site to dist/
    node blocks.js component <id>          creates a new component from the template
    node blocks.js messages                shows the messages sent through the site's forms
    node blocks.js account list            lists the visitors' accounts
    node blocks.js account logout <email>  closes every session of an account
    node blocks.js account delete <email>  deletes an account (the address can be used again)
    node blocks.js help                    this help

  Options:
    --port 3001         another port for dev and start (or PORT=3001)
    --out export        for build: another folder, inside the project (dist by default)
    --base /project/    for build: the site will live in a subfolder (e.g. GitHub Pages)
`;

async function newComponent(id) {
  if (!id) fail("Give the component a name, for example: node blocks.js component product-price");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    fail(`“${id}” can't be a component's name: use lowercase letters, digits and hyphens, for example: node blocks.js component product-price`);
  }
  const file = join(root, "components", `${id}.js`);
  if (existsSync(file)) fail(`components/${id}.js already exists. Choose another name (e.g. ${id}-2).`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, componentTemplate(id));
  console.log(`Created components/${id}.js. Open it and change it; the editor sees it right away.`);
}

// What a visitor wrote reaches the terminal only as text: no control sequences and no invisible
// characters that reverse or hide the line (also for old messages or ones written by hand in data/).
const clean = (text) =>
  String(text ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "");

function showMessages() {
  const messages = createStore(join(root, "data")).collection("messages").all().reverse();
  if (!messages.length) return console.log("\n  No messages yet. The messages sent through the site's forms show up here.\n");
  console.log(`\n  ${count(messages.length, "message received", "messages received")} (newest first):\n`);
  for (const m of messages) {
    console.log(`  ${[when(m.created), m.name, m.email, m.phone].map(clean).filter(Boolean).join(" · ")}`);
    console.log(`    ${clean(m.message).replace(/\n/g, "\n    ")}\n`);
  }
}

// Accounts change directly in data/; a running server sees the change at the next request.
function accounts([action, email]) {
  const auth = createAuth(createStore(join(root, "data")));
  if (action === "list") {
    const list = auth.listAccounts();
    if (!list.length) return console.log("\n  No accounts yet.\n");
    console.log(`\n  ${count(list.length, "account", "accounts")}:\n`);
    for (const u of list) {
      console.log(`  ${clean(u.name)} <${clean(u.email)}> · created ${when(u.created)} · ${count(u.sessions, "active session", "active sessions")}`);
    }
    return console.log("");
  }
  if ((action === "logout" || action === "delete") && email) {
    const closed = action === "logout" ? auth.endSessions(email) : auth.deleteAccount(email);
    if (closed === null) fail(`There is no account with the address “${email}”.`);
    const sessions = count(closed, "session", "sessions");
    return console.log(action === "logout" ? `Closed ${sessions} for ${email}.` : `Deleted the account ${email} and closed ${sessions}.`);
  }
  fail("Usage: node blocks.js account list | account logout <email> | account delete <email>");
}

// Node.js 20 no longer gets security updates (since April 2026). Blocks still runs on it,
// but whoever publishes a site with it should know.
function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 22) return;
  console.warn(
    `\n  Warning: you have Node.js ${process.versions.node}. Blocks is made for Node.js 22 or newer: ` +
      "Node.js 20 and older versions no longer get security updates.\n" +
      "  Install Node.js 22 from https://nodejs.org or, if you use nvm, with “nvm install 22”.\n",
  );
}

function readPort() {
  const text = String(option("port", process.env.PORT || "3000")).trim();
  const port = Number(text);
  if (!/^\d+$/.test(text) || port > 65535) fail(`The port “${text}” isn't valid. Use a number between 1 and 65535, e.g. --port 3001.`);
  return port;
}

try {
  switch (command) {
    case "dev":
    case "start": {
      checkNode();
      const port = readPort();
      try {
        await startServer({ root, mode: command, port, host: command === "start" ? process.env.HOST : undefined });
      } catch (err) {
        if (err.code === "EADDRINUSE") {
          fail(`Port ${port} is busy (maybe Blocks is already running in another window). Stop it or start with --port ${port + 1}.`);
        }
        if (err.code === "EACCES") fail(`Blocks isn't allowed to use port ${port}. Choose 1024 or above, e.g. --port 3000.`);
        if (err.code === "EADDRNOTAVAIL" || err.code === "ENOTFOUND") fail(`The HOST address “${process.env.HOST}” doesn't exist on this computer.`);
        throw err;
      }
      break;
    }
    case "build": {
      checkNode();
      const { errors } = await buildSite({ root, out: resolve(root, option("out", "dist")), base: option("base", "/") });
      if (errors.length) process.exitCode = 1; // a publishing script sees that the export is incomplete
      break;
    }
    case "component":
      await newComponent(args[0]);
      break;
    case "messages":
      showMessages();
      break;
    case "account":
      accounts(args);
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP(process.env.PORT || 3000));
      break;
    default:
      console.error(`\n  Unknown command: “${command}”.`);
      console.error(HELP(process.env.PORT || 3000));
      process.exitCode = 1;
  }
} catch (err) {
  // Our own mistakes (e.g. a wrong export folder) and the system's already have a clear message;
  // for the rest (an error in the code) we also show where it happened.
  if (err.code || err.constructor === Error) fail(err.message);
  throw err;
}
