export type SectionKind = { cls: string; glyph: string };

export function sectionKind(type: string): SectionKind {
  const t = type.toLowerCase();
  if (t.includes("warm")) return { cls: "sec-warmup", glyph: "◐" };
  if (t.includes("explos")) return { cls: "sec-explosive", glyph: "◆" };
  if (t.includes("strength") || t.includes("power")) return { cls: "sec-strength", glyph: "■" };
  if (t.includes("metcon") || t.includes("cardio") || t.includes("cond")) return { cls: "sec-metcon", glyph: "◇" };
  if (t.includes("hypert") || t.includes("accessory") || t.includes("isolation")) return { cls: "sec-hypertrophy", glyph: "●" };
  if (t.includes("rehab") || t.includes("cool") || t.includes("mobil")) return { cls: "sec-rehab", glyph: "+" };
  return { cls: "sec-default", glyph: "·" };
}
