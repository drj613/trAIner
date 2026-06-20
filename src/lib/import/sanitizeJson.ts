export type JsonFailureReason = "empty" | "truncated" | "syntax";
export type RecoveryReason = JsonFailureReason | "not-object" | "no-days";

export type LooseParseResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: JsonFailureReason };

export function sanitizeJson(raw: string): string {
  let s = raw.trim();
  s = stripFences(s);
  s = sliceBraces(s);
  s = normalizeQuotes(s);
  s = stripComments(s);
  s = removeTrailingCommas(s);
  return s.trim();
}

export function parseLooseJson(raw: string): LooseParseResult {
  if (!raw || !raw.trim()) return { ok: false, reason: "empty" };
  const cleaned = sanitizeJson(raw);
  if (!cleaned) return { ok: false, reason: "empty" };
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    return { ok: false, reason: isTruncated(cleaned) ? "truncated" : "syntax" };
  }
}

function stripFences(s: string): string {
  const fenced = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  return fenced ? fenced[1].trim() : s;
}

function sliceBraces(s: string): string {
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return s;
}

function normalizeQuotes(s: string): string {
  return s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
}

function stripComments(s: string): string {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\" && i + 1 < s.length) {
        out += ch + s[i + 1];
        i += 2;
        continue;
      }
      out += ch;
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && s[i + 1] === "/") {
      i += 2;
      while (i < s.length && s[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function removeTrailingCommas(s: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\" && i + 1 < s.length) {
        out += ch + s[i + 1];
        i += 1;
        continue;
      }
      out += ch;
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      if (j < s.length && (s[j] === "}" || s[j] === "]")) continue; // drop trailing comma
    }
    out += ch;
  }
  return out;
}

function isTruncated(s: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
  }
  return depth > 0 || inString;
}
