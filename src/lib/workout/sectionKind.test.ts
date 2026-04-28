import { sectionKind } from "./sectionKind";

describe("sectionKind", () => {
  it("warmup → sec-warmup / ◐", () => { expect(sectionKind("warmup")).toEqual({ cls: "sec-warmup", glyph: "◐" }); });
  it("strength → sec-strength / ■", () => { expect(sectionKind("strength")).toEqual({ cls: "sec-strength", glyph: "■" }); });
  it("power → sec-strength / ■", () => { expect(sectionKind("power")).toEqual({ cls: "sec-strength", glyph: "■" }); });
  it("metcon → sec-metcon / ◇", () => { expect(sectionKind("metcon")).toEqual({ cls: "sec-metcon", glyph: "◇" }); });
  it("cardio → sec-metcon / ◇", () => { expect(sectionKind("cardio")).toEqual({ cls: "sec-metcon", glyph: "◇" }); });
  it("hypertrophy → sec-hypertrophy / ●", () => { expect(sectionKind("hypertrophy")).toEqual({ cls: "sec-hypertrophy", glyph: "●" }); });
  it("accessory → sec-hypertrophy / ●", () => { expect(sectionKind("accessory")).toEqual({ cls: "sec-hypertrophy", glyph: "●" }); });
  it("rehab → sec-rehab / +", () => { expect(sectionKind("rehab")).toEqual({ cls: "sec-rehab", glyph: "+" }); });
  it("unknown → sec-default / ·", () => { expect(sectionKind("training")).toEqual({ cls: "sec-default", glyph: "·" }); });
  it("is case-insensitive", () => {
    expect(sectionKind("WARMUP")).toEqual({ cls: "sec-warmup", glyph: "◐" });
    expect(sectionKind("Strength")).toEqual({ cls: "sec-strength", glyph: "■" });
  });
});
