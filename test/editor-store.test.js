// editor/store.js: the Undo / Redo history when the document changes on disk.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as store from "../editor/store.js";

describe("the editor's history (editor/store.js)", () => {
  test("a reload from disk keeps the history and can be undone; another document has its own history", () => {
    store.setDocument("page", "a", { title: "A", blocks: [] });
    store.commit((d) => {
      d.title = "A2";
    });
    store.setDocument("page", "a", { title: "From disk", blocks: [] }, { reload: true });
    assert.equal(store.state.doc.title, "From disk");
    assert.equal(store.state.dirty, false);
    assert.ok(store.canUndo());
    store.undo();
    assert.equal(store.state.doc.title, "A2", "Undo brings back the version from before the reload");
    store.undo();
    assert.equal(store.state.doc.title, "A");
    assert.ok(!store.canUndo());
    store.setDocument("page", "b", { title: "B", blocks: [] });
    assert.ok(!store.canUndo(), "without `reload`, another document starts with its own history");
    store.setDocument("page", "b", { title: "B2", blocks: [] });
    assert.ok(!store.canUndo(), "an ordinary open adds no steps");
  });

  test("the file of a page and of a shared zone", () => {
    assert.equal(store.fileOf("page", "about"), "about.json");
    assert.equal(store.fileOf("zone", "header"), "_header.json");
    assert.equal(store.fileOf("zone", "footer"), "_footer.json");
  });

  test("a document written by hand is repaired: blocks without an id, repeated ids, props and slots that aren't objects", () => {
    store.setDocument("page", "c", {
      title: "C",
      blocks: [{ type: "text", props: [] }, { id: "x", type: "text" }, { id: "x", type: 5, slots: { content: "no" } }, null, "text"],
    });
    const blocks = store.state.doc.blocks;
    assert.equal(blocks.length, 3);
    assert.equal(new Set(blocks.map((b) => b.id)).size, 3);
    assert.ok(blocks.every((b) => typeof b.id === "string" && b.id && b.props && typeof b.props === "object" && !Array.isArray(b.props)));
    assert.equal(blocks[2].type, "5");
    assert.deepEqual(blocks[2].slots, { content: [] });
  });
});
