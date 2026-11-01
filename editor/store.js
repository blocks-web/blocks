// The editor's state: the open document (a page or a shared zone), the selection, the history for
// Undo / Redo, and saving on its own.
//
// The document's JSON is the only source of truth. Every change goes through
// commit(mutator, options): it copies the document, changes it, keeps the step for Undo, tells the
// canvas and the panels, and schedules the save.

import { api } from "./api.js";
import { canon, pref, SLUG } from "./util.js";
import { locate, normalize } from "./tree.js";

const HISTORY_LIMIT = 100;
const SAVE_PAUSE = 800;

// ---- Events between modules ----
//   "document"   another document was opened
//   "doc"        the content changed ({ source })
//   "selection"  the selected block changed
//   "history"    Undo / Redo changed
//   "status"     the save status
//   "pages"      the list of pages;  "components"  the components;  "site"  the site settings

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, data) {
  for (const fn of [...(listeners.get(event) || [])]) {
    try {
      fn(data);
    } catch (err) {
      console.error(`[editor] Error in “${event}”:`, err);
    }
  }
}

export const state = {
  kind: null, // "page" | "zone"
  name: null, // the page's slug, or "header" / "footer"
  doc: null,
  selected: null,
  zones: { header: { blocks: [] }, footer: { blocks: [] } },
  site: {},
  previewSite: null, // the settings in the dialog, not saved yet
  pages: [],
  // The page you go back to from the header / footer (remembered after a reload too).
  lastPage: SLUG.test(pref("lastPage") || "") ? pref("lastPage") : "index",
  dirty: false,
  status: "saved", // "saved" | "saving" | "unsaved" | "error"
  statusMessage: "",
};

let undoStack = [];
let redoStack = [];
// The history of the documents left in this session ("page:index", "zone:header"): you go through
// the header and come back, and Undo goes on from where it was.
const histories = new Map();
let coalesceKey = null;
let docToken = 0;
let serverCanon = null; // the last version on disk we know of (read or saved by us)

let saveTimer = null;
let retryTimer = null;
let retryDelay = 0;
let saving = null;
let errorShown = false;

export function fileOf(kind = state.kind, name = state.name) {
  return kind === "page" ? `${name}.json` : `_${name}.json`;
}

// What the server keeps after it gets the document (it fills in a few keys).
function serverShape(kind, doc) {
  if (kind === "page") return { title: "", access: "public", ...doc, blocks: doc?.blocks || [] };
  return { ...doc, blocks: doc?.blocks || [] };
}

function setStatus(status, message = "") {
  if (state.status === status && state.statusMessage === message) return;
  state.status = status;
  state.statusMessage = message;
  emit("status");
}

// ---- The document ----

const historyKey = (kind, name) => `${kind}:${name}`;

// `reload`: the same document, read again from disk (it changed there). The history stays, and the
// version from before becomes an undo step: "Undo" brings it back.
export function setDocument(kind, name, raw, { reload = false } = {}) {
  const same = reload && state.doc && state.kind === kind && state.name === name;
  const before = same ? { json: JSON.stringify(state.doc), selected: state.selected } : null;
  const kept = same ? undoStack : null;
  // The history of the document we leave, with the version it was at.
  if (state.doc && state.kind && !same) {
    histories.set(historyKey(state.kind, state.name), {
      undo: undoStack,
      redo: redoStack,
      canon: canon(serverShape(state.kind, state.doc)),
    });
  }
  docToken++;
  clearTimeout(saveTimer);
  clearTimeout(retryTimer);
  retryDelay = 0;
  errorShown = false;
  serverCanon = canon(raw ?? {});
  state.kind = kind;
  state.name = name;
  state.doc = normalize(JSON.parse(JSON.stringify(raw ?? {})));
  state.selected = null;
  state.dirty = false;
  // We reuse it only if the document is exactly as we left it (nobody changed it on disk in between).
  const saved = histories.get(historyKey(kind, name));
  histories.delete(historyKey(kind, name));
  const unchanged = saved && saved.canon === canon(serverShape(kind, state.doc));
  undoStack = unchanged ? saved.undo : [];
  redoStack = unchanged ? saved.redo : [];
  if (same) {
    undoStack = [...kept, before].slice(-HISTORY_LIMIT);
    redoStack = [];
  }
  coalesceKey = null;
  if (kind === "page") {
    state.lastPage = name;
    pref("lastPage", name);
  }
  state.status = "saved";
  state.statusMessage = "";
  emit("status");
  emit("document");
  emit("doc", { source: "load" });
  emit("selection");
  emit("history");
}

// The version on disk is one we already know (saved by us or the same as what we have).
export function isKnownRemote(remote) {
  const c = canon(remote ?? {});
  if (c === serverCanon) return true;
  if (state.doc && c === canon(serverShape(state.kind, state.doc))) {
    serverCanon = c;
    return true;
  }
  return false;
}

// The central change. `mutator(doc)` changes a copy; if it returns false, nothing changes.
//   key     – consecutive changes with the same key (typing in a field) become a single step
//   source  – who made the change ("props" = the settings panel, which doesn't rebuild itself)
//   select  – the id to select after the change
export function commit(mutator, { key = null, source = null, select } = {}) {
  if (!state.doc) return false;
  const before = JSON.stringify(state.doc);
  const draft = JSON.parse(before);
  if (mutator(draft) === false) return false;
  const after = JSON.stringify(draft);
  const prevSelected = state.selected;
  if (after === before) {
    if (select !== undefined) setSelected(select);
    return false;
  }
  if (!(key && key === coalesceKey)) {
    undoStack.push({ json: before, selected: prevSelected });
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  }
  coalesceKey = key;
  redoStack = [];
  state.doc = JSON.parse(after);
  if (select !== undefined) state.selected = select && locate(state.doc, select) ? select : null;
  else if (state.selected && !locate(state.doc, state.selected)) state.selected = null;
  markDirty();
  emit("doc", { source });
  emit("history");
  if (state.selected !== prevSelected) emit("selection");
  return true;
}

// The document no longer exists (e.g. the page was deleted): its history has nothing left to redo.
export function forgetHistory(kind, name) {
  histories.delete(historyKey(kind, name));
}

// The next change starts a new step in the history (e.g. after you leave a field).
export function breakCoalesce() {
  coalesceKey = null;
}

export function setSelected(id) {
  const next = id && state.doc && locate(state.doc, id) ? id : null;
  coalesceKey = null;
  if (next === state.selected) return;
  state.selected = next;
  emit("selection");
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

export function undo() {
  const entry = undoStack.pop();
  if (!entry) return false;
  redoStack.push({ json: JSON.stringify(state.doc), selected: state.selected });
  restore(entry);
  return true;
}

export function redo() {
  const entry = redoStack.pop();
  if (!entry) return false;
  undoStack.push({ json: JSON.stringify(state.doc), selected: state.selected });
  restore(entry);
  return true;
}

function restore(entry) {
  coalesceKey = null;
  const prevSelected = state.selected;
  state.doc = JSON.parse(entry.json);
  state.selected = entry.selected && locate(state.doc, entry.selected) ? entry.selected : null;
  markDirty();
  emit("doc", { source: "history" });
  emit("history");
  if (state.selected !== prevSelected) emit("selection");
}

// ---- Saving on its own ----

function markDirty() {
  state.dirty = true;
  if (state.status !== "saving") setStatus(state.status === "error" ? "error" : "unsaved", state.statusMessage);
  scheduleSave();
}

export function scheduleSave(ms = SAVE_PAUSE) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), ms);
}

export const isSaving = () => saving !== null;

// Saves now. Returns true if the document reached the disk.
export async function save() {
  clearTimeout(saveTimer);
  if (saving) {
    await saving;
    return state.dirty ? save() : true;
  }
  if (!state.dirty || !state.doc) return true;
  clearTimeout(retryTimer);
  const { kind, name } = state;
  const token = docToken;
  const json = JSON.stringify(state.doc);
  setStatus("saving");
  saving = (async () => {
    try {
      const body = JSON.parse(json);
      if (kind === "page") await api.savePage(name, body);
      else await api.saveZone(name, body);
      if (token !== docToken) return true;
      serverCanon = canon(serverShape(kind, body));
      retryDelay = 0;
      errorShown = false;
      if (JSON.stringify(state.doc) === json) {
        state.dirty = false;
        setStatus("saved");
      } else {
        setStatus("unsaved");
        scheduleSave(300);
      }
      emit("saved", { kind, name });
      return true;
    } catch (err) {
      if (token !== docToken) return false;
      // We try again on our own, less and less often (2s, 4s, 8s ... at most 30s).
      retryDelay = Math.min(retryDelay ? retryDelay * 2 : 2000, 30_000);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => save(), retryDelay);
      setStatus("error", err.message);
      if (!errorShown) {
        errorShown = true;
        emit("save-error", err);
      }
      return false;
    }
  })();
  try {
    return await saving;
  } finally {
    saving = null;
  }
}

// Waits until everything is saved. Returns false if the server refuses or doesn't answer.
export async function flush() {
  for (let i = 0; i < 4; i++) {
    if (saving) await saving;
    if (!state.dirty) return true;
    if (!(await save())) return false;
  }
  return !state.dirty;
}

// The document has to be written to disk, though the person didn't change it (e.g. we go back to
// the version from the file).
export function markChanged() {
  if (state.doc) markDirty();
}

// Drops the unsaved changes (e.g. the page was just deleted).
export async function discardPending() {
  clearTimeout(saveTimer);
  clearTimeout(retryTimer);
  if (saving) await saving;
  state.dirty = false;
  setStatus("saved");
}
