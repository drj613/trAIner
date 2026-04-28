import { matchExercise } from "@/lib/catalog/match";
import { normalizeSectionType } from "@/lib/programs/domain";
import type { AliasDocument, ImportWarning, ProfileDocument, ProgramDay, ProgramDocument, ProgramExercise, ProgramGroup, ProgramSection } from "@/lib/programs/types";
import { emptyTags } from "@/lib/programs/types";

type ImportPayload = Record<string, unknown>;

export type ImportReview = {
  program: ProgramDocument;
  warnings: ImportWarning[];
};

export function parseProgramJson(input: string, profileSnapshot?: ProfileDocument, aliases: AliasDocument[] = []): ImportReview {
  let payload: unknown;
  try {
    payload = JSON.parse(input);
  } catch {
    throw new Error("The pasted content is not valid JSON.");
  }

  if (!isRecord(payload)) {
    throw new Error("The pasted JSON must be an object.");
  }

  return normalizePayload(payload, profileSnapshot, aliases);
}

export function normalizePayload(payload: ImportPayload, profileSnapshot?: ProfileDocument, aliases: AliasDocument[] = []): ImportReview {
  const warnings: ImportWarning[] = [];
  const now = new Date().toISOString();
  const days = detectDays(payload).map((day, index) => normalizeDay(day, index + 1, warnings, aliases));

  if (days.length === 0) {
    throw new Error("No day or sections were found in the pasted JSON.");
  }

  const program: ProgramDocument = {
    id: newId("program"),
    title: stringFrom(payload.program_name ?? payload.programName ?? payload.title, "Imported Program"),
    description: optionalString(payload.description),
    source: "import",
    active: true,
    days,
    overrides: [],
    import: {
      rawJson: payload,
      warnings
    },
    profileSnapshot,
    createdAt: now,
    updatedAt: now
  };

  return { program, warnings };
}

function detectDays(payload: ImportPayload): ImportPayload[] {
  if (Array.isArray(payload.days)) return payload.days.filter(isRecord);
  if (Array.isArray(payload.weeks)) {
    return payload.weeks.flatMap((week) => (isRecord(week) && Array.isArray(week.days) ? week.days.filter(isRecord) : []));
  }
  if (Array.isArray(payload.sections)) return [payload];
  return [];
}

function normalizeDay(day: ImportPayload, fallbackDayNumber: number, warnings: ImportWarning[], aliases: AliasDocument[]): ProgramDay {
  const sections = arrayOfRecords(day.sections).map((section, index) =>
    normalizeSection(section, `days.${fallbackDayNumber}.sections.${index}`, warnings, aliases)
  );

  return {
    id: newId("day"),
    dayNumber: numberFrom(day.day ?? day.dayNumber, fallbackDayNumber),
    weekNumber: optionalNumber(day.week ?? day.weekNumber),
    title: stringFrom(day.title ?? day.name, `Day ${fallbackDayNumber}`),
    sections
  };
}

function normalizeSection(section: ImportPayload, path: string, warnings: ImportWarning[], aliases: AliasDocument[]): ProgramSection {
  const groups = arrayOfRecords(section.exercise_groups ?? section.groups).map((group, index) =>
    normalizeGroup(group, `${path}.groups.${index}`, warnings, aliases)
  );

  return {
    id: newId("section"),
    type: normalizeSectionType(stringFrom(section.type, "training")),
    name: stringFrom(section.name ?? section.type, "Training"),
    groups
  };
}

function normalizeGroup(group: ImportPayload, path: string, warnings: ImportWarning[], aliases: AliasDocument[]): ProgramGroup {
  const exercises = arrayOfRecords(group.exercises).map((exercise, index) =>
    normalizeExercise(exercise, `${path}.exercises.${index}`, warnings, aliases)
  );

  return {
    id: newId("group"),
    type: normalizeGroupType(optionalString(group.type)),
    notes: optionalString(group.notes),
    exercises
  };
}

function normalizeExercise(exercise: ImportPayload, path: string, warnings: ImportWarning[], aliases: AliasDocument[]): ProgramExercise {
  const name = stringFrom(exercise.name, "Unnamed Exercise");
  const match = matchExercise(name, aliases);
  const tags = isRecord(exercise.tags)
    ? {
        primary: stringArray(exercise.tags.primary),
        secondary: stringArray(exercise.tags.secondary),
        incidental: stringArray(exercise.tags.incidental),
        modifiers: stringArray(exercise.tags.modifiers)
      }
    : emptyTags();

  if (match.kind === "unmatched") {
    warnings.push({
      path,
      message: `${name} was imported without a catalog match.`,
      suggestions: match.suggestions
    });
  }

  return {
    id: newId("exercise"),
    name,
    canonicalExerciseId: match.kind === "matched" ? match.item.id : undefined,
    sets: optionalNumber(exercise.sets),
    reps: optionalString(exercise.reps),
    load: optionalString(exercise.load ?? exercise.weight),
    rest: optionalString(exercise.rest),
    tempo: normalizeTempo(exercise),
    notes: optionalString(exercise.notes),
    tags
  };
}

function normalizeTempo(exercise: ImportPayload) {
  if (typeof exercise.tempo === "string") return exercise.tempo;
  const parts = [
    exercise.tempo_eccentric,
    exercise.tempo_pause_bottom,
    exercise.tempo_concentric,
    exercise.tempo_pause_top
  ].filter((value) => value !== null && value !== undefined);
  return parts.length > 0 ? parts.join("-") : undefined;
}

function normalizeGroupType(value?: string): ProgramGroup["type"] {
  if (value === "superset" || value === "circuit" || value === "giant-set") return value;
  return "single";
}

function arrayOfRecords(value: unknown): ImportPayload[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberFrom(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is ImportPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
