import type { ProgramDay, ProgramExercise } from "./types";

export type EditingElementKind = "section" | "group" | "exercise";

export type EditingElementBinding = {
  occurrenceDayId: string;
  occurrenceElementId: string;
  templateElementId: string;
  kind: EditingElementKind;
};

export type EditingDayBinding = {
  occurrenceDayId: string;
  templateDayId: string;
};

export type EditingFieldException = {
  kind: "field";
  dayId: string;
  templateElementId: string;
  field: keyof ProgramExercise | "title" | "sectionType" | "sectionName" | "groupType" | "groupNotes";
  reason: string;
  weekNumber?: number;
};

export type EditingStructuralException = {
  kind: "structural";
  dayId: string;
  templateElementId?: string;
  reason: string;
  weekNumber?: number;
};

export type EditingException = EditingFieldException | EditingStructuralException;

export type ProgramEditingMetadata = {
  version: 1;
  templateDays: ProgramDay[];
  dayBindings: EditingDayBinding[];
  elementBindings: EditingElementBinding[];
  exceptions: EditingException[];
  /** Legacy occurrences that could not be mapped without guessing. */
  unmappedDayIds?: string[];
};
