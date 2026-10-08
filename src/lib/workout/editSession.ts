import type { ProgramDay, WorkoutLogEntry } from '@/lib/programs/types';
import { buildInitialCells, type CellMap } from './cellMap';

export function preserveEditedSession(
  _before: ProgramDay,
  after: ProgramDay,
  cells: CellMap,
  entries: WorkoutLogEntry[]
) {
  return { cells: { ...buildInitialCells(after), ...cells }, entries };
}
