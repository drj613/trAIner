// src/lib/analytics/trainingHeatmap.ts
import type { WorkoutLogDocument } from "@/lib/programs/types";

export type HeatmapCell = {
  intensity: 0 | 1 | 2 | 3 | 4;
  future: boolean;
};

export type HeatmapStats = {
  streak: number;
  weeklyAvg: number;
  completionRate: number;
};

const WEEKS = 26;
const DAYS_PER_WEEK = 7;

function mondayOf(today: Date): Date {
  const d = new Date(today);
  const dow = d.getUTCDay(); // 0=Sun
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offsetToMon);
  return d;
}

export function buildHeatmapCells(
  logs: WorkoutLogDocument[],
  todayStr: string,
): HeatmapCell[][] {
  const today = new Date(todayStr + "T00:00:00Z");
  const thisWeekMonday = mondayOf(today);
  const gridStart = new Date(thisWeekMonday);
  gridStart.setUTCDate(gridStart.getUTCDate() - (WEEKS - 1) * 7);

  // volume per date
  const volumeByDate = new Map<string, number>();
  for (const log of logs) {
    const date = log.performedAt.slice(0, 10);
    let vol = 0;
    for (const entry of log.entries) {
      for (const s of entry.sets) {
        vol += (s.weight ?? 0) * (s.reps ?? 1);
      }
    }
    volumeByDate.set(date, (volumeByDate.get(date) ?? 0) + vol);
  }

  // percentile thresholds for intensity bands
  const allVols = [...volumeByDate.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const p33 = allVols[Math.floor(allVols.length * 0.33)] ?? 1;
  const p66 = allVols[Math.floor(allVols.length * 0.66)] ?? 2;
  const p90 = allVols[Math.floor(allVols.length * 0.9)] ?? 3;

  function intensityFor(vol: number): 0 | 1 | 2 | 3 | 4 {
    if (vol === 0) return 0;
    if (vol < p33) return 1;
    if (vol < p66) return 2;
    if (vol < p90) return 3;
    return 4;
  }

  const todayTime = today.getTime();
  const cells: HeatmapCell[][] = [];

  for (let w = 0; w < WEEKS; w++) {
    const week: HeatmapCell[] = [];
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const cellDate = new Date(gridStart);
      cellDate.setUTCDate(cellDate.getUTCDate() + w * 7 + d);
      const future = cellDate.getTime() > todayTime;
      const dateKey = cellDate.toISOString().slice(0, 10);
      const vol = volumeByDate.get(dateKey) ?? 0;
      week.push({ intensity: future ? 0 : intensityFor(vol), future });
    }
    cells.push(week);
  }

  return cells;
}

export function computeHeatmapStats(cells: HeatmapCell[][]): HeatmapStats {
  const flat = cells.flat();
  const pastCells = flat.filter((c) => !c.future);
  const loggedCount = pastCells.filter((c) => c.intensity > 0).length;

  let streak = 0;
  let broken = false;
  outer: for (let w = cells.length - 1; w >= 0; w--) {
    for (let d = DAYS_PER_WEEK - 1; d >= 0; d--) {
      const cell = cells[w][d];
      if (cell.future) continue;
      if (cell.intensity > 0) streak++;
      else { broken = true; break outer; }
    }
    if (broken) break;
  }

  const nonFutureWeeks = cells.filter((wk) => wk.some((c) => !c.future)).length;
  const weeklyAvg =
    nonFutureWeeks > 0
      ? Math.round((loggedCount / nonFutureWeeks) * 10) / 10
      : 0;
  const completionRate =
    pastCells.length > 0
      ? Math.round((loggedCount / pastCells.length) * 100)
      : 0;

  return { streak, weeklyAvg, completionRate };
}
