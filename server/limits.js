// Anti-abuse limits: how many attempts a key (usually the visitor's address) has made within a time
// window. One for the whole server: logging in, signing up and the component routes (ctx.limit).
//
//   const fails = createLimiter(15 * 60 * 1000);
//   if (fails.count(addressKey(ip)) >= 10) ...;  fails.add(addressKey(ip));

import { isIPv4, isIPv6 } from "node:net";

// The address as a counting key. IPv4 stays as it is (including when written as IPv6, "::ffff:1.2.3.4");
// IPv6 counts by network (the first 64 bits): anyone gets a whole /64 network from their provider, with
// billions of addresses, so otherwise they would get around any limit by changing the address.
export function addressKey(ip) {
  let s = String(ip ?? "").trim().toLowerCase();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped && isIPv4(mapped[1])) return mapped[1];
  if (!isIPv6(s)) return s || "unknown";
  return `${ipv6Groups(s).slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

// The 8 groups of a valid IPv6 address ("::" filled with zeros, a trailing IPv4 split into two groups).
function ipv6Groups(s) {
  const parts = (text) => {
    const out = [];
    for (const g of text ? text.split(":") : []) {
      if (!g.includes(".")) out.push(g);
      else {
        const [a, b, c, d] = g.split(".").map(Number);
        out.push(((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
      }
    }
    return out;
  };
  const i = s.indexOf("::");
  if (i === -1) return parts(s);
  const head = parts(s.slice(0, i));
  const tail = parts(s.slice(i + 2));
  return [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
}

// A fixed window: { count, until } for each key; whatever has expired is forgotten. Memory has a cap:
// when there are too many fresh keys at once, the oldest ones go (it never grows without end).
export function createLimiter(windowMs, maxKeys = 50_000) {
  const map = new Map();
  return {
    count(key) {
      const entry = map.get(key);
      return entry && entry.until > Date.now() ? entry.count : 0;
    },
    // Returns the entry, so a successful attempt can be taken back (entry.count--).
    add(key) {
      const now = Date.now();
      if (map.size >= maxKeys) {
        for (const [k, e] of map) if (e.until <= now) map.delete(k);
        if (map.size >= maxKeys) {
          let toDelete = Math.ceil(maxKeys / 10);
          for (const k of map.keys()) {
            if (toDelete-- <= 0) break;
            map.delete(k);
          }
        }
      }
      let entry = map.get(key);
      if (!entry || entry.until <= now) map.set(key, (entry = { count: 0, until: now + windowMs }));
      entry.count++;
      return entry;
    },
  };
}
