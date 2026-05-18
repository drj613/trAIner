const MMSS = /(\d+):(\d{1,2})/;
const RANGE_S = /(\d+)\s*(?:-|to)\s*(\d+)\s*(?:s\b|sec|seconds)/i;
const RANGE_M = /(\d+)\s*(?:-|to)\s*(\d+)\s*(?:m\b|min|minutes)/i;
const SINGLE_S = /(\d+)\s*(?:s\b|sec|seconds)/i;
const SINGLE_M = /(\d+)\s*(?:m\b|min|minutes)/i;
const BARE_INT = /^\s*(\d+)\s*$/;

export function parseDuration(input: string): number | undefined {
  if (!input) return undefined;
  const s = input.trim();

  const bare = BARE_INT.exec(s);
  if (bare) return Number(bare[1]);

  const rs = RANGE_S.exec(s);
  if (rs) return Math.round((Number(rs[1]) + Number(rs[2])) / 2);

  const rm = RANGE_M.exec(s);
  if (rm) return Math.round(((Number(rm[1]) + Number(rm[2])) / 2) * 60);

  const mmss = MMSS.exec(s);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);

  const ss = SINGLE_S.exec(s);
  if (ss) return Number(ss[1]);

  const mm = SINGLE_M.exec(s);
  if (mm) return Number(mm[1]) * 60;

  return undefined;
}
