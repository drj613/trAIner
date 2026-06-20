import { sanitizeJson, parseLooseJson } from "./sanitizeJson";

describe("sanitizeJson — individual transforms", () => {
  it("strips ```json fences", () => {
    expect(sanitizeJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("strips bare ``` fences", () => {
    expect(sanitizeJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("slices leading preamble and trailing prose (the index-0 bug)", () => {
    expect(sanitizeJson('Here you go:\n{"a":1}')).toBe('{"a":1}');
    expect(sanitizeJson('{"a":1}\n\nLet me know if you want changes!')).toBe('{"a":1}');
  });
  it("normalizes typographic quotes", () => {
    expect(sanitizeJson('{"a":"b"}')).toBe('{"a":"b"}');
  });
  it("removes line and block comments", () => {
    // assert via JSON.parse: comment removal leaves incidental whitespace/newlines
    expect(JSON.parse(sanitizeJson('{"a":1, // note\n"b":2}'))).toEqual({ a: 1, b: 2 });
    expect(JSON.parse(sanitizeJson('{"a":1, /* x */ "b":2}'))).toEqual({ a: 1, b: 2 });
  });
  it("removes trailing commas in objects and arrays", () => {
    expect(sanitizeJson('{"a":[1,2,],}')).toBe('{"a":[1,2]}');
  });
});

describe("sanitizeJson — string safety", () => {
  it("preserves // inside string values", () => {
    const out = sanitizeJson('{"url":"https://x.io"}');
    expect(JSON.parse(out).url).toBe("https://x.io");
  });
  it("preserves comment-like and comma-brace sequences inside strings", () => {
    const out = sanitizeJson('{"note":"do /* not */ strip, ] this"}');
    expect(JSON.parse(out).note).toBe("do /* not */ strip, ] this");
  });
  it("handles escaped quotes inside strings", () => {
    const out = sanitizeJson('{"note":"she said \\"hi\\"","x":1,}');
    expect(JSON.parse(out)).toEqual({ note: 'she said "hi"', x: 1 });
  });
});

describe("sanitizeJson — combinations & passthrough", () => {
  it("repairs fences + smart quotes + trailing comma together", () => {
    const raw = '```json\n{"name":"A", "days":[1,2,],}\n```';
    expect(JSON.parse(sanitizeJson(raw))).toEqual({ name: "A", days: [1, 2] });
  });
  it("leaves already-valid JSON byte-stable", () => {
    const valid = '{"a":1,"b":[2,3]}';
    expect(sanitizeJson(valid)).toBe(valid);
  });
});

describe("parseLooseJson", () => {
  it("parses repaired input", () => {
    const r = parseLooseJson('```json\n{"a":1,}\n```');
    expect(r).toEqual({ ok: true, value: { a: 1 } });
  });
  it("classifies empty input", () => {
    expect(parseLooseJson("   ")).toEqual({ ok: false, reason: "empty" });
  });
  it("classifies truncated input (unbalanced braces)", () => {
    const r = parseLooseJson('{"days":[{"title":"A"');
    expect(r).toEqual({ ok: false, reason: "truncated" });
  });
  it("classifies other syntax errors", () => {
    const r = parseLooseJson('{"a": that}');
    expect(r).toEqual({ ok: false, reason: "syntax" });
  });
});
