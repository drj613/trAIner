export function toTitleCase(value: string): string {
  return value.replace(/(?<![a-zA-Z])[a-z]/g, (c) => c.toUpperCase());
}

export function normalizeExerciseName(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function similarity(left: string, right: string) {
  const a = normalizeExerciseName(left);
  const b = normalizeExerciseName(right);
  if (a === b) return 1;

  const leftTokens = new Set(a.split(" "));
  const rightTokens = new Set(b.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}
