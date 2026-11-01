// Data collections saved as JSON files in data/.
//
//   const messages = store.collection("messages");   // data/messages.json
//   messages.add({ name: "Ana" });
//   messages.all();
//
// Simple and easy to read by hand. For lots of data, it can later be replaced with SQLite
// without changing the components.
//
// A file changed on disk while the server is running (by hand or with `node blocks.js
// account ...`) is read again the next time it is used, not overwritten with what was in memory.

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

export const VALID_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function createStore(dir) {
  const cache = new Map(); // file → { items, signature }

  // The size and the time of the last change; null if the file doesn't exist.
  function signature(file) {
    try {
      const { size, mtimeMs } = statSync(file);
      return `${size}:${mtimeMs}`;
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  function load(file) {
    const sign = signature(file);
    const cached = cache.get(file);
    if (cached && cached.signature === sign) return cached.items;
    let items = [];
    try {
      if (sign !== null) items = JSON.parse(readFileSync(file, "utf8"));
      if (!Array.isArray(items)) items = [];
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    cache.set(file, { items, signature: sign });
    return items;
  }

  function save(file, items) {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(items, null, 2));
    renameSync(tmp, file);
    cache.set(file, { items, signature: signature(file) });
  }

  // `name` is the collection's name; `internal` allows reserved names (e.g. "_auth/...").
  function collection(name, { internal = false } = {}) {
    if (!internal && !VALID_NAME.test(String(name))) {
      throw new Error(`Invalid collection name: “${name}”. Use lowercase letters, digits and hyphens.`);
    }
    // The folder is made at the first write (save), so reading never creates anything on disk.
    const file = join(dir, `${name}.json`);
    const items = () => load(file);
    const copy = (v) => structuredClone(v);

    return {
      all: () => copy(items()),
      count: () => items().length,
      find: (fn) => copy(items().find(fn) ?? null),
      filter: (fn) => copy(items().filter(fn)),
      byId: (id) => copy(items().find((it) => it.id === id) ?? null),
      add(obj) {
        // The collection sets `id` and `created`; only internal code (e.g. the sessions) can choose them.
        const fields = copy(obj);
        const item = internal
          ? { id: randomUUID(), created: new Date().toISOString(), ...fields }
          : { ...fields, id: randomUUID(), created: new Date().toISOString() };
        const list = items();
        list.push(item);
        save(file, list);
        return copy(item);
      },
      update(id, changes) {
        const list = items();
        const item = list.find((it) => it.id === id);
        if (!item) return null;
        Object.assign(item, copy(changes), { id });
        save(file, list);
        return copy(item);
      },
      remove(id) {
        const list = items();
        const index = list.findIndex((it) => it.id === id);
        if (index === -1) return false;
        list.splice(index, 1);
        save(file, list);
        return true;
      },
      // Removes every item for which fn(item) is true. Returns how many it removed.
      removeWhere(fn) {
        const list = items();
        const keep = list.filter((it) => !fn(it));
        const removed = list.length - keep.length;
        // The new list replaces the old one only once we know the result (no `list.push(...keep)`,
        // which throws above ~100,000 items after it had already emptied the list).
        if (removed) save(file, keep);
        return removed;
      },
    };
  }

  return { collection };
}
