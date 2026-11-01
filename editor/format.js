// The formatting marks in a text (docs/ARCHITECTURE.md): **bold**, *italic*, [text](address).
// Only the text logic, without the DOM, so it also works in the tests.

const MARKS = { b: "**", i: "*" };

// Puts the mark around the selection [start, end) in `text`.
//   kind: "b" | "i" | "link"
// Returns { text, start, end }: the new text and the selection after it.
//   - with a selection: wraps it in the marks; for a link, selects the address (so you type over it)
//   - without a selection: puts the marks in and leaves the cursor between them
export function applyMark(text, start, end, kind) {
  const s = String(text ?? "");
  let a = Math.max(0, Math.min(Number(start) || 0, s.length));
  let b = Math.max(0, Math.min(Number(end) || 0, s.length));
  if (b < a) [a, b] = [b, a];
  const before = s.slice(0, a);
  const sel = s.slice(a, b);
  const after = s.slice(b);
  if (kind === "link") {
    const address = "https://";
    const next = `${before}[${sel}](${address})${after}`;
    if (!sel) return { text: next, start: a + 1, end: a + 1 };
    const at = a + 1 + sel.length + 2;
    return { text: next, start: at, end: at + address.length };
  }
  const m = MARKS[kind];
  if (!m) return { text: s, start: a, end: b };
  const next = `${before}${m}${sel}${m}${after}`;
  return { text: next, start: a + m.length, end: a + m.length + sel.length };
}

// The text without marks ("**Hello**" → "Hello", "[home](/)" → "home"), for summaries.
export function stripMarks(text) {
  return String(text ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}
