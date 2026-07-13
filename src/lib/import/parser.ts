import { matchExercise } from "@/lib/catalog/match";
import { normalizeSectionType } from "@/lib/programs/domain";
import type { AliasDocument, ID, ImportWarning, ProfileDocument, ProgramDay, ProgramDocument, ProgramExercise, ProgramGroup, ProgramOverride, ProgramSection, UserExerciseDocument } from "@/lib/programs/types";
import { emptyTags } from "@/lib/programs/types";
import { parseLooseJson, type RecoveryReason } from "@/lib/import/sanitizeJson";
import { baseExercisePath } from "@/lib/import/paths";

export class ImportError extends Error {
  reason: RecoveryReason;
  constructor(reason: RecoveryReason, message: string) {
    super(message);
    this.name = "ImportError";
    this.reason = reason;
  }
}

type ImportPayload = Record<string, unknown>;

export type ImportReview = {
  program: ProgramDocument;
  warnings: ImportWarning[];
};

export function parseProgramJson(input: string, profileSnapshot?: ProfileDocument, aliases: AliasDocument[] = [], userExercises: UserExerciseDocument[] = []): ImportReview {
  const result = parseLooseJson(input);
  if (!result.ok) {
    const message =
      result.reason === "empty"
        ? "Paste the AI's JSON response first."
        : result.reason === "truncated"
          ? "The pasted JSON looks cut off — paste the full response."
          : "The pasted content is not valid JSON.";
    throw new ImportError(result.reason, message);
  }
  if (!isRecord(result.value)) {
    throw new ImportError("not-object", "The pasted JSON must be an object.");
  }
  return normalizePayload(result.value, profileSnapshot, aliases, userExercises);
}

export function normalizePayload(payload: ImportPayload, profileSnapshot?: ProfileDocument, aliases: AliasDocument[] = [], userExercises: UserExerciseDocument[] = []): ImportReview {
  const warnings: ImportWarning[] = [];
  const now = new Date().toISOString();
  const programId = newId("program");

  const baseDays = parseBaseDays(payload, warnings, aliases, userExercises);

  if (baseDays.length === 0) {
    throw new ImportError(
      "no-days",
      'No workout days found. Make sure you\'re pasting the complete AI response — it should contain a "days" array.'
    );
  }

  // Duplicate-day diagnostics run on the normalized BASE-TEMPLATE days,
  // before expansion — expanded weekly copies legitimately share the same
  // declared day number, so checking post-expansion would misfire.
  diagnoseDuplicateBaseDayNumbers(baseDays, warnings);

  const lengthWeeks = optionalNumber(payload.weeks);
  const days = expandDays(baseDays, lengthWeeks);
  const overrides = parseOverrides(payload, programId, warnings, aliases, userExercises);

  const program: ProgramDocument = {
    id: programId,
    title: stringFrom(payload.program_name ?? payload.programName ?? payload.title, "Imported Program"),
    description: optionalString(payload.description),
    source: "import",
    active: true,
    ...(lengthWeeks !== undefined ? { lengthWeeks } : {}),
    ...(profileSnapshot?.primaryGoal ? { goal: profileSnapshot.primaryGoal } : {}),
    days,
    overrides,
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

function parseBaseDays(
  payload: ImportPayload,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[]
): ProgramDay[] {
  return detectDays(payload).map((day, index) => normalizeDay(day, index + 1, warnings, aliases, userExercises));
}

// Structural warning only (no rawName), so extractUnresolvedExercises never
// treats this as an exercise-resolution item. Must run on BASE days
// (pre-expandDays) — see call site in normalizePayload.
function diagnoseDuplicateBaseDayNumbers(baseDays: ProgramDay[], warnings: ImportWarning[]): void {
  const counts = new Map<number, number>();
  for (const day of baseDays) {
    counts.set(day.dayNumber, (counts.get(day.dayNumber) ?? 0) + 1);
  }
  for (const [dayNumber, count] of counts) {
    if (count > 1) {
      warnings.push({
        path: `days.${dayNumber}`,
        message: `Day ${dayNumber} is declared ${count} times. Duplicate base day numbers make exercise resolutions for this day ambiguous.`,
      });
    }
  }
}

function expandDays(baseDays: ProgramDay[], lengthWeeks: number | undefined): ProgramDay[] {
  if (!lengthWeeks || lengthWeeks <= 1) return baseDays;
  const expanded: ProgramDay[] = [];
  for (let week = 1; week <= lengthWeeks; week++) {
    for (const base of baseDays) {
      expanded.push({ ...base, id: newId("day"), weekNumber: week });
    }
  }
  return expanded;
}

function parseOverrides(
  payload: ImportPayload,
  programId: ID,
  _warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[]
): ProgramOverride[] {
  if (!Array.isArray(payload.overrides)) return [];
  const now = new Date().toISOString();
  return payload.overrides.filter(isRecord).map((raw) => {
    const localWarnings: ImportWarning[] = [];
    const days = arrayOfRecords(raw.days).map((day, index) =>
      normalizeDay(day, index + 1, localWarnings, aliases, userExercises)
    );
    const scope: "week" | "day" = stringFrom(raw.scope, "week") === "day" ? "day" : "week";
    return {
      id: newId("override"),
      scope,
      programId,
      weekNumber: optionalNumber(raw.weekNumber),
      replacement: days,
      reason: optionalString(raw.reason),
      createdAt: now,
    };
  });
}

function detectDays(payload: ImportPayload): ImportPayload[] {
  if (Array.isArray(payload.days)) return payload.days.filter(isRecord);
  if (Array.isArray(payload.weeks)) {
    return payload.weeks.flatMap((week) => (isRecord(week) && Array.isArray(week.days) ? week.days.filter(isRecord) : []));
  }
  if (Array.isArray(payload.sections)) return [payload];
  return [];
}

function normalizeDay(day: ImportPayload, fallbackDayNumber: number, warnings: ImportWarning[], aliases: AliasDocument[], userExercises: UserExerciseDocument[]): ProgramDay {
  const dayNumber = numberFrom(day.day ?? day.dayNumber, fallbackDayNumber);
  const sections = arrayOfRecords(day.sections).map((section, index) =>
    normalizeSection(section, dayNumber, index, warnings, aliases, userExercises)
  );

  return {
    id: newId("day"),
    dayNumber,
    weekNumber: optionalNumber(day.week ?? day.weekNumber),
    title: stringFrom(day.title ?? day.name, `Day ${fallbackDayNumber}`),
    sections
  };
}

function normalizeSection(section: ImportPayload, dayNumber: number, sectionIndex: number, warnings: ImportWarning[], aliases: AliasDocument[], userExercises: UserExerciseDocument[]): ProgramSection {
  const sectionType = normalizeSectionType(stringFrom(section.type, "training"));
  const groups = arrayOfRecords(section.exercise_groups ?? section.groups).map((group, index) =>
    normalizeGroup(group, dayNumber, sectionIndex, index, warnings, aliases, userExercises, sectionType)
  );

  return {
    id: newId("section"),
    type: sectionType,
    name: stringFrom(section.name ?? section.type, "Training"),
    groups
  };
}

function normalizeGroup(group: ImportPayload, dayNumber: number, sectionIndex: number, groupIndex: number, warnings: ImportWarning[], aliases: AliasDocument[], userExercises: UserExerciseDocument[], sectionType: string): ProgramGroup {
  const exercises = arrayOfRecords(group.exercises).map((exercise, index) =>
    normalizeExercise(exercise, baseExercisePath(dayNumber, sectionIndex, groupIndex, index), warnings, aliases, userExercises, sectionType)
  );

  return {
    id: newId("group"),
    type: normalizeGroupType(optionalString(group.type)),
    notes: optionalString(group.notes),
    exercises
  };
}

function normalizeExercise(exercise: ImportPayload, path: string, warnings: ImportWarning[], aliases: AliasDocument[], userExercises: UserExerciseDocument[], sectionType: string): ProgramExercise {
  const name = stringFrom(exercise.name, "Unnamed Exercise").replace(/^[a-z]\.\s+/i, "");
  const match = matchExercise(name, aliases, userExercises);
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
      rawName: name,
      suggestions: match.suggestions,
      sectionType,
    });
  }

  const countsTowardVolume = optionalBoolean(exercise.countsTowardVolume) ?? optionalBoolean(exercise.counts_toward_volume);

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
    countsTowardVolume,
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
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  return fallback;
}

function optionalString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function numberFrom(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is ImportPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
