// server/store.js: the JSON collections in data/.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, VALID_NAME } from "../server/store.js";

describe("store", () => {
  let dir;
  before(() => {
    dir = join(mkdtempSync(join(tmpdir(), "blocks-store-")), "data");
  });
  after(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

  test("a new collection is empty and creates no files until the first write", () => {
    const c = createStore(dir).collection("empty");
    assert.deepEqual(c.all(), []);
    assert.equal(c.count(), 0);
    assert.equal(c.byId("x"), null);
    assert.equal(c.find(() => true), null);
    assert.deepEqual(c.filter(() => true), []);
    assert.equal(existsSync(join(dir, "empty.json")), false);
  });

  test("add sets id and created", () => {
    const c = createStore(dir).collection("messages");
    const a = c.add({ name: "Ana" });
    assert.equal(typeof a.id, "string");
    assert.ok(a.id.length >= 16);
    assert.ok(!Number.isNaN(Date.parse(a.created)));
    assert.equal(a.name, "Ana");
    const b = c.add({ name: "Bogdan" });
    assert.notEqual(a.id, b.id);
    assert.equal(c.count(), 2);
  });

  test("the collection chooses id and created, even when the object has them", () => {
    const c = createStore(dir).collection("chosen");
    const a = c.add({ id: "mine", created: "yesterday", name: "Ana" });
    assert.notEqual(a.id, "mine");
    assert.notEqual(a.created, "yesterday");
    const internal = createStore(dir).collection("_x/chosen", { internal: true }).add({ id: "mine", created: "yesterday" });
    assert.deepEqual([internal.id, internal.created], ["mine", "yesterday"]);
  });

  test("all, find, filter, byId", () => {
    const c = createStore(dir).collection("search");
    const a = c.add({ name: "Ana", age: 30 });
    const b = c.add({ name: "Bogdan", age: 20 });
    c.add({ name: "Cristi", age: 40 });
    assert.equal(c.all().length, 3);
    assert.deepEqual(c.byId(b.id), b);
    assert.equal(c.find((x) => x.name === "Ana").id, a.id);
    assert.equal(c.find((x) => x.name === "Nobody"), null);
    assert.deepEqual(
      c.filter((x) => x.age >= 30).map((x) => x.name),
      ["Ana", "Cristi"],
    );
  });

  test("update: changes fields, keeps the id; null if it doesn't exist", () => {
    const c = createStore(dir).collection("updates");
    const a = c.add({ name: "Ana", city: "Iași" });
    const updated = c.update(a.id, { city: "Cluj", id: "other-id" });
    assert.equal(updated.id, a.id);
    assert.equal(updated.city, "Cluj");
    assert.equal(updated.name, "Ana");
    assert.equal(c.byId(a.id).city, "Cluj");
    assert.equal(c.byId("other-id"), null);
    assert.equal(c.update("does-not-exist", { a: 1 }), null);
  });

  test("remove and removeWhere", () => {
    const c = createStore(dir).collection("removals");
    const a = c.add({ n: 1 });
    c.add({ n: 2 });
    c.add({ n: 3 });
    c.add({ n: 4 });
    assert.equal(c.remove(a.id), true);
    assert.equal(c.remove(a.id), false);
    assert.equal(c.removeWhere((x) => x.n % 2 === 0), 2);
    assert.equal(c.removeWhere((x) => x.n > 100), 0);
    assert.deepEqual(
      c.all().map((x) => x.n),
      [3],
    );
  });

  test("removeWhere on a very large collection doesn't lose data (no argument limit from push)", () => {
    mkdirSync(dir, { recursive: true });
    const many = Array.from({ length: 150_000 }, (_, i) => ({ id: `m${i}`, created: "x", n: i }));
    writeFileSync(join(dir, "many.json"), JSON.stringify(many));
    const c = createStore(dir).collection("many");
    assert.equal(c.removeWhere((m) => m.id === "m5"), 1);
    assert.equal(c.all().length, 149_999);
    assert.equal(JSON.parse(readFileSync(join(dir, "many.json"), "utf8")).length, 149_999);
    c.add({ n: -1 });
    assert.equal(JSON.parse(readFileSync(join(dir, "many.json"), "utf8")).length, 150_000);
  });

  test("removeWhere: a function that throws doesn't break the collection", () => {
    const c = createStore(dir).collection("throws");
    for (const n of [1, 2, 3]) c.add({ n });
    assert.throws(() => c.removeWhere((x) => {
      if (x.n === 3) throw new Error("broken");
      return x.n === 1;
    }), /broken/);
    assert.deepEqual(c.all().map((x) => x.n), [1, 2, 3]);
  });

  test("a file changed on disk (by hand) is read again, not overwritten with what was in memory", async () => {
    const c = createStore(dir).collection("by-hand");
    const a = c.add({ name: "Ana" });
    c.add({ name: "Bogdan" });
    const file = join(dir, "by-hand.json");
    // Someone takes "Ana" out of the file while the server is running (the same size doesn't matter: the time changes too).
    await new Promise((ok) => setTimeout(ok, 5));
    writeFileSync(file, JSON.stringify(JSON.parse(readFileSync(file, "utf8")).filter((x) => x.id !== a.id), null, 2));
    assert.deepEqual(c.all().map((x) => x.name), ["Bogdan"]);
    assert.equal(c.byId(a.id), null);
    c.add({ name: "Cristi" });
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).map((x) => x.name), ["Bogdan", "Cristi"]);
    // The file deleted altogether → an empty collection.
    rmSync(file);
    assert.deepEqual(c.all(), []);
  });

  test("the objects returned are copies: changing them doesn't change the collection", () => {
    const c = createStore(dir).collection("copies");
    const input = { name: "Ana", list: [1] };
    const a = c.add(input);
    input.name = "changed";
    input.list.push(2);
    a.name = "changed";
    a.list.push(3);
    c.all()[0].name = "changed";
    c.byId(a.id).list.push(4);
    c.find(() => true).name = "changed";
    c.filter(() => true)[0].list.push(5);
    const u = c.update(a.id, { city: "Cluj" });
    u.city = "changed";
    const changes = { tag: ["x"] };
    c.update(a.id, changes);
    changes.tag.push("y");
    assert.deepEqual(c.byId(a.id), { id: a.id, created: a.created, name: "Ana", list: [1], city: "Cluj", tag: ["x"] });
  });

  test("the data stays after a new createStore on the same folder", () => {
    const c = createStore(dir).collection("lasting");
    const a = c.add({ text: "Bună ziua, ăâîșț" });
    const b = c.add({ text: "two" });
    c.update(b.id, { text: "two again" });
    c.add({ text: "three" });
    c.removeWhere((x) => x.text === "three");
    const file = join(dir, "lasting.json");
    assert.ok(Array.isArray(JSON.parse(readFileSync(file, "utf8"))));
    const again = createStore(dir).collection("lasting");
    assert.deepEqual(
      again.all().map((x) => x.text),
      ["Bună ziua, ăâîșț", "two again"],
    );
    assert.deepEqual(again.byId(a.id), a);
  });

  test("a file that doesn't hold a list is treated as an empty collection", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "object.json"), '{"a":1}');
    assert.deepEqual(createStore(dir).collection("object").all(), []);
  });

  test("invalid collection names are refused", () => {
    const store = createStore(dir);
    for (const name of ["", "Messages", "../x", "a/b", "a\\b", "_auth/users", "_x", "-a", "a.b", "a b", " a", "a".repeat(65), "ă"]) {
      assert.throws(() => store.collection(name), /Invalid collection name/, name);
    }
    for (const name of ["a", "a-1", "0x", "contact-messages", "a".repeat(64)]) {
      assert.doesNotThrow(() => store.collection(name), name);
      assert.ok(VALID_NAME.test(name));
    }
  });

  test("internal names are allowed with { internal: true }", () => {
    const store = createStore(dir);
    const users = store.collection("_auth/users", { internal: true });
    assert.deepEqual(users.all(), []);
    assert.ok(!existsSync(join(dir, "_auth")), "reading creates nothing on disk");
    users.add({ email: "a@b.com" });
    assert.ok(existsSync(join(dir, "_auth", "users.json")));
    assert.equal(createStore(dir).collection("_auth/users", { internal: true }).all().length, 1);
  });

  test("the collections are separate", () => {
    const store = createStore(dir);
    store.collection("one").add({ x: 1 });
    assert.deepEqual(store.collection("two").all(), []);
    assert.equal(store.collection("one").all().length, 1);
  });
});
