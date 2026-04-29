import type { ProgramDay } from "@/lib/programs/types";

export type CellMap = Record<string, string[]>;

export function buildInitialCells(day: ProgramDay): CellMap {
  const map: CellMap = {};
  for (const section of day.sections ?? []) {
    for (const group of section.groups ?? []) {
      for (const ex of group.exercises ?? []) {
        map[ex.id] = Array(ex.sets ?? 3).fill("");
      }
    }
  }
  return map;
}

export function updateCell(map: CellMap, exId: string, index: number, value: string): CellMap {
  const cells = [...(map[exId] ?? [])];
  cells[index] = value;
  return { ...map, [exId]: cells };
}

export function addSet(map: CellMap, exId: string): CellMap {
  return { ...map, [exId]: [...(map[exId] ?? []), ""] };
}
