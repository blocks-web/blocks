// server/limits.js: the counting key of an address and the time-window limiter.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { addressKey, createLimiter } from "../server/limits.js";

describe("addressKey", () => {
  test("IPv4 stays as it is, including when written as IPv6", () => {
    assert.equal(addressKey("203.0.113.7"), "203.0.113.7");
    assert.equal(addressKey("::ffff:203.0.113.7"), "203.0.113.7");
    assert.equal(addressKey(" ::FFFF:203.0.113.7 "), "203.0.113.7");
  });

  test("IPv6 counts by its /64 network, however it is written", () => {
    const key = "2001:db8:1:2::/64";
    for (const ip of ["2001:db8:1:2::1", "2001:0db8:0001:0002:ffff:ffff:ffff:ffff", "2001:DB8:1:2:0:0:0:9", "2001:db8:1:2::1%en0", "2001:db8:1:2::1.2.3.4"]) {
      assert.equal(addressKey(ip), key, ip);
    }
    assert.notEqual(addressKey("2001:db8:1:3::1"), key);
    assert.equal(addressKey("::1"), "0:0:0:0::/64");
  });

  test("an empty or odd address still gives a key", () => {
    assert.equal(addressKey(""), "unknown");
    assert.equal(addressKey(null), "unknown");
    assert.equal(addressKey(undefined), "unknown");
    assert.equal(addressKey("not-an-ip"), "not-an-ip");
  });
});

describe("createLimiter", () => {
  test("counts per key within the window, then forgets", (t) => {
    const limiter = createLimiter(1000);
    assert.equal(limiter.count("a"), 0);
    limiter.add("a");
    const entry = limiter.add("a");
    limiter.add("b");
    assert.equal(limiter.count("a"), 2);
    assert.equal(limiter.count("b"), 1);
    entry.count--; // a successful attempt is taken back
    assert.equal(limiter.count("a"), 1);
    const now = Date.now();
    t.mock.method(Date, "now", () => now + 1001);
    assert.equal(limiter.count("a"), 0);
    limiter.add("a");
    assert.equal(limiter.count("a"), 1);
  });

  test("memory has a cap: with too many fresh keys, the oldest go", () => {
    const limiter = createLimiter(60_000, 100);
    for (let i = 0; i < 100; i++) limiter.add(`k${i}`);
    limiter.add("new");
    assert.equal(limiter.count("new"), 1);
    assert.equal(limiter.count("k0"), 0);
    assert.equal(limiter.count("k99"), 1);
  });
});
