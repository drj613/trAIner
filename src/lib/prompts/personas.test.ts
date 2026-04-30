import { DEFAULT_PERSONAS } from "./personas";

describe("DEFAULT_PERSONAS", () => {
  it("contains exactly 9 personas", () => {
    expect(DEFAULT_PERSONAS).toHaveLength(9);
  });

  it("every persona has required fields", () => {
    for (const p of DEFAULT_PERSONAS) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(typeof p.style).toBe("string");
      expect(Array.isArray(p.tags)).toBe(true);
      expect(typeof p.block).toBe("string");
      expect(p.block.length).toBeGreaterThan(0);
    }
  });

  it("persona IDs are unique", () => {
    const ids = DEFAULT_PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
