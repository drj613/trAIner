export type ParsedLoad = {
  pct1rm?: number;
  rpe?: number;
  rir?: number;
  repMax?: number;
};

/**
 * Fuzzy-parse a free-text load string (LLM output) into intensity signals.
 * Tolerant by design: unrecognized formats yield {} rather than throwing.
 */
export function parseLoad(raw: string | undefined): ParsedLoad {
  if (!raw) return {};
  const s = raw.toLowerCase();
  const out: ParsedLoad = {};

  const pct = s.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (pct) {
    const n = Math.floor(parseFloat(pct[1]));
    if (n > 0 && n <= 100) out.pct1rm = n;
  }

  const rpe = s.match(/rpe\s*(\d{1,2}(?:\.5)?)/);
  if (rpe) {
    const n = parseFloat(rpe[1]);
    if (n >= 1 && n <= 10) out.rpe = n;
  }

  const rir = s.match(/(\d{1,2})\s*rir|rir\s*(\d{1,2})/);
  if (rir) {
    const n = parseInt(rir[1] ?? rir[2], 10);
    if (n >= 0 && n <= 10) out.rir = n;
  }

  const rm = s.match(/(\d{1,2})\s*rm\b/);
  if (rm) {
    const n = parseInt(rm[1], 10);
    // "N% 1RM" uses "1RM" as a unit label, not a rep-max prescription — ignore that "1".
    const isPercentUnitLabel = n === 1 && s.includes("%");
    if (!isPercentUnitLabel && n >= 1 && n <= 20) out.repMax = n;
  }

  return out;
}
