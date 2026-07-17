import { matchExercise } from "@/lib/catalog/match";
import { normalizeSectionType } from "@/lib/programs/domain";
import type { AliasDocument, ID, ImportWarning, ProfileDocument, ProgramDay, ProgramDocument, ProgramExercise, ProgramGroup, ProgramOverride, ProgramSection, ProgressionRule, UserExerciseDocument } from "@/lib/programs/types";
import { emptyTags } from "@/lib/programs/types";
import { parseLooseJson, type RecoveryReason } from "@/lib/import/sanitizeJson";
import { baseExercisePath, overrideExercisePath } from "@/lib/import/paths";
import { diagnoseImportOverrides } from "@/lib/programs/overrideDiagnostics";

// Builds the ImportWarning path for an exercise at a given position. Base
// days use `baseExercisePath`; override replacement days use
// `overrideExercisePath` bound to their override index. Threaded through
// normalizeDay -> normalizeSection -> normalizeGroup so every exercise
// warning path (base or override) is built through the shared path
// builders in @/lib/import/paths — never hand-assembled.
type ExercisePathBuilder = (
  dayNumber: number,
  templateWeek: number | undefined,
  sectionIndex: number,
  groupIndex: number,
  exerciseIndex: number,
) => string;

export class ImportError extends Error {
  reason: RecoveryReason;
  constructor(reason: RecoveryReason, message: string) {
    super(message);
    this.name = "ImportError";
    this.reason = reason;
  }
}

type ImportPayload = Record<string, unknown>;

// Parser-local carrier for exercise variants. `__variants` is attached to the
// normalized base exercise pre-expansion and is ALWAYS stripped before any
// exercise is stored — it must never appear on the exported ProgramExercise
// type or in program.days. See expandDays / the strip* helpers.
type NormalizedVariant = {
  weeks: number[];
  fields: Partial<
    Pick<
      ProgramExercise,
      "name" | "sets" | "reps" | "load" | "rest" | "tempo" | "notes" | "countsTowardVolume" | "tags"
    >
  >;
  // Resolved match for the variant name, when the variant supplied a name.
  canonicalExerciseId?: ID;
  hasName: boolean;
};
type WithVariants = ProgramExercise & { __variants?: NormalizedVariant[] };

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

  const lengthWeeks = coercePositiveInt(payload.weeks);
  // Variant diagnostics run on the BASE-TEMPLATE days (reading __variants)
  // before expansion strips the carrier. They only ADD warnings; expansion
  // itself already drops over-length weeks and applies "later wins".
  diagnoseVariants(baseDays, lengthWeeks, warnings);
  // Effective weeks are computed from the EXPANDED day set, not the raw
  // base template or the scalar `weeks` field — expansion is what actually
  // determines which weeks exist to be overridden. See diagnoseImportOverrides.
  const days = expandDays(baseDays, lengthWeeks);
  const overrides = parseOverrides(payload, programId, warnings, aliases, userExercises);
  diagnoseImportOverrides(overrides, days, warnings);
  const progression = normalizeProgression(payload.progression);

  const program: ProgramDocument = {
    id: programId,
    title: stringFrom(payload.program_name ?? payload.programName ?? payload.title, "Imported Program"),
    description: optionalString(payload.description),
    source: "import",
    active: true,
    ...(lengthWeeks !== undefined ? { lengthWeeks } : {}),
    ...(profileSnapshot?.primaryGoal ? { goal: profileSnapshot.primaryGoal } : {}),
    ...(progression ? { progression } : {}),
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

// Variant diagnostics — all WARNINGS, never errors. Walks base days reading
// __variants and emits three warning classes: variants on a single-week
// program (ignored), variant weeks beyond program length (dropped), and
// duplicate weeks across variants (later wins). Structural warnings (no
// rawName) so extractUnresolvedExercises never treats them as resolution
// items. Expansion enforces the actual behavior; this only surfaces it.
function diagnoseVariants(baseDays: ProgramDay[], lengthWeeks: number | undefined, warnings: ImportWarning[]): void {
  const singleWeek = !lengthWeeks || lengthWeeks <= 1;
  for (const day of baseDays) {
    day.sections.forEach((section, si) => {
      section.groups.forEach((group, gi) => {
        group.exercises.forEach((exercise, ei) => {
          const variants = (exercise as WithVariants).__variants;
          if (!variants || variants.length === 0) return;
          const path = baseExercisePath(day.dayNumber, day.templateWeek, si, gi, ei);
          if (singleWeek) {
            warnings.push({
              path,
              message: `Variants on "${exercise.name}" were ignored because the program is a single week.`,
            });
            return;
          }
          // Over-length weeks
          const over = new Set<number>();
          for (const v of variants) for (const w of v.weeks) if (w > lengthWeeks!) over.add(w);
          for (const w of [...over].sort((a, b) => a - b)) {
            warnings.push({
              path,
              message: `Variant week ${w} for "${exercise.name}" exceeds the program length (${lengthWeeks} weeks) and was ignored.`,
            });
          }
          // Duplicate week across variants (later wins)
          const claimant = new Map<number, string>();
          for (const v of variants) {
            const vName = v.fields.name ?? exercise.name;
            for (const w of v.weeks) {
              if (w > lengthWeeks!) continue; // already warned + dropped
              if (claimant.has(w)) {
                warnings.push({
                  path,
                  message: `Multiple variants of "${exercise.name}" claim week ${w}; the last one ("${vName}") was used.`,
                });
              }
              claimant.set(w, vName);
            }
          }
        });
      });
    });
  }
}

function expandDays(baseDays: ProgramDay[], lengthWeeks: number | undefined): ProgramDay[] {
  // Single-week (or no weeks): return base days but STRIP any __variants
  // carrier so it never leaks into program.days. Diagnostics for
  // variants-on-single-week are emitted in diagnoseVariants (call site in
  // normalizePayload), not here.
  if (!lengthWeeks || lengthWeeks <= 1) {
    return baseDays.map(stripDayVariants);
  }
  const expanded: ProgramDay[] = [];
  for (let week = 1; week <= lengthWeeks; week++) {
    for (const base of baseDays) {
      // `...base` propagates `templateWeek` unchanged onto every clone —
      // only `weekNumber` (the week this clone was expanded INTO) is
      // reassigned. That keeps every clone's resolution-path identity tied
      // to the TEMPLATE it came from, not the week it landed in, which is
      // what lets one resolution patch every week-clone. See paths.ts.
      expanded.push(expandOneDay(base, week));
    }
  }
  return expanded;
}

// Produces the week-clone of `base`. If no variant is active this week, it is
// today's shallow clone with __variants stripped (structural sharing with
// other empty-swap weeks preserved). If variants ARE active, only the
// section/group/exercise objects on each swap path are freshly cloned; every
// other object keeps its reference.
function expandOneDay(base: ProgramDay, week: number): ProgramDay {
  const activeSwaps = collectActiveSwaps(base, week);
  const day: ProgramDay = { ...base, id: newId("day"), weekNumber: week };
  if (activeSwaps.size === 0) {
    day.sections = base.sections.map(stripSectionVariants);
    return day;
  }
  day.sections = base.sections.map((section, si) => {
    const anyInSection = [...activeSwaps.keys()].some((k) => k.startsWith(`${si}:`));
    if (!anyInSection) return stripSectionVariants(section);
    return {
      ...section,
      groups: section.groups.map((group, gi) => {
        const anyInGroup = [...activeSwaps.keys()].some((k) => k.startsWith(`${si}:${gi}:`));
        if (!anyInGroup) return stripGroupVariants(group);
        return {
          ...group,
          exercises: group.exercises.map((exercise, ei) => {
            const swap = activeSwaps.get(`${si}:${gi}:${ei}`);
            return swap ? mergeVariant(exercise as WithVariants, swap) : stripExerciseVariants(exercise);
          }),
        };
      }),
    };
  });
  return day;
}

// active swaps for THIS week, keyed "s:g:e". Built in variant-array order so a
// later variant claiming the same week overwrites an earlier one ("later
// wins", Diagnostics rule 3). Weeks outside 1..lengthWeeks never occur here
// (the caller loop bounds `week`), so over-length weeks are naturally dropped.
function collectActiveSwaps(base: ProgramDay, week: number): Map<string, NormalizedVariant> {
  const active = new Map<string, NormalizedVariant>();
  base.sections.forEach((section, si) => {
    section.groups.forEach((group, gi) => {
      group.exercises.forEach((exercise, ei) => {
        const variants = (exercise as WithVariants).__variants;
        if (!variants) return;
        for (const v of variants) {
          if (v.weeks.includes(week)) active.set(`${si}:${gi}:${ei}`, v);
        }
      });
    });
  });
  return active;
}

// Base exercise merged with the variant's sparse fields, carrying a FRESH
// exercise id (log-history isolation — variant logs must not pollute the base
// exercise's history). Nameless variants inherit the base canonicalExerciseId;
// named variants carry their own match. Tags override only when the variant
// supplied them (no auto-retag).
function mergeVariant(base: WithVariants, variant: NormalizedVariant): ProgramExercise {
  const { __variants, ...baseFields } = base;
  void __variants;
  return {
    ...baseFields,
    ...variant.fields,
    id: newId("exercise"),
    canonicalExerciseId: variant.hasName ? variant.canonicalExerciseId : baseFields.canonicalExerciseId,
  };
}

// Strip helpers: drop the __variants carrier without regenerating ids and
// WITHOUT allocating new objects when no carrier is present, so structural
// sharing is preserved everywhere off the swap path.
function stripExerciseVariants(exercise: ProgramExercise): ProgramExercise {
  if (!(exercise as WithVariants).__variants) return exercise;
  const { __variants, ...rest } = exercise as WithVariants;
  void __variants;
  return rest;
}
function stripGroupVariants(group: ProgramGroup): ProgramGroup {
  if (!group.exercises.some((e) => (e as WithVariants).__variants)) return group;
  return { ...group, exercises: group.exercises.map(stripExerciseVariants) };
}
function stripSectionVariants(section: ProgramSection): ProgramSection {
  if (!section.groups.some((g) => g.exercises.some((e) => (e as WithVariants).__variants))) return section;
  return { ...section, groups: section.groups.map(stripGroupVariants) };
}
function stripDayVariants(day: ProgramDay): ProgramDay {
  if (!day.sections.some((s) => s.groups.some((g) => g.exercises.some((e) => (e as WithVariants).__variants)))) {
    return day;
  }
  return { ...day, sections: day.sections.map(stripSectionVariants) };
}

function parseOverrides(
  payload: ImportPayload,
  programId: ID,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[]
): ProgramOverride[] {
  if (!Array.isArray(payload.overrides)) return [];
  const now = new Date().toISOString();
  return payload.overrides.filter(isRecord).map((raw, overrideIndex) => {
    // Override warnings MERGE into the shared collection (never a local,
    // discarded array) so they surface through program.import.warnings.
    const pathBuilder: ExercisePathBuilder = (dayNumber, templateWeek, sectionIndex, groupIndex, exerciseIndex) =>
      overrideExercisePath(overrideIndex, dayNumber, templateWeek, sectionIndex, groupIndex, exerciseIndex);
    const days = arrayOfRecords(raw.days).map((day, index) =>
      // allowVariants:false — override days never pass through expandDays, so
      // variants there would leak the __variants carrier and orphan a warning.
      normalizeDay(day, index + 1, warnings, aliases, userExercises, pathBuilder, false)
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

// Program-level scoped progression list: one entry per movement class, each
// requiring both a non-empty `applies` and `rule`. Malformed entries are
// dropped rather than the whole field rejected; an empty result (or a
// non-array/absent field) normalizes to `undefined` so imports without a
// progression list behave exactly as before this field existed.
function normalizeProgression(value: unknown): ProgressionRule[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rules = value
    .filter(isRecord)
    .map((entry) => ({ applies: optionalString(entry.applies), rule: optionalString(entry.rule) }))
    .filter((entry): entry is ProgressionRule => Boolean(entry.applies && entry.rule));
  return rules.length > 0 ? rules : undefined;
}

function detectDays(payload: ImportPayload): ImportPayload[] {
  if (Array.isArray(payload.days)) return payload.days.filter(isRecord);
  if (Array.isArray(payload.weeks)) {
    return payload.weeks.flatMap((week) => (isRecord(week) && Array.isArray(week.days) ? week.days.filter(isRecord) : []));
  }
  if (Array.isArray(payload.sections)) return [payload];
  return [];
}

function normalizeDay(
  day: ImportPayload,
  fallbackDayNumber: number,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
  pathBuilder: ExercisePathBuilder = baseExercisePath,
  // Variants are import-schema sugar desugared by expandDays, which ONLY runs
  // on base days. Override replacement days never pass through expandDays, so
  // parsing variants there would persist the internal __variants carrier into
  // the stored document (leak) and orphan an unresolvable warning. Variants
  // inside an override are out of scope (see spec) — disable parsing for them.
  allowVariants: boolean = true
): ProgramDay {
  const dayNumber = numberFrom(day.day ?? day.dayNumber, fallbackDayNumber);
  // The EXPLICIT week this day declared, if any — captured once here (pre-
  // expansion) so it can be propagated unchanged through expandDays and
  // used as the day's template identity for path building. See ProgramDay
  // and paths.ts.
  const templateWeek = optionalNumber(day.week ?? day.weekNumber);
  const sections = arrayOfRecords(day.sections).map((section, index) =>
    normalizeSection(section, dayNumber, templateWeek, index, warnings, aliases, userExercises, pathBuilder, allowVariants)
  );

  return {
    id: newId("day"),
    dayNumber,
    weekNumber: templateWeek,
    templateWeek,
    title: stringFrom(day.title ?? day.name, `Day ${fallbackDayNumber}`),
    sections
  };
}

function normalizeSection(
  section: ImportPayload,
  dayNumber: number,
  templateWeek: number | undefined,
  sectionIndex: number,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
  pathBuilder: ExercisePathBuilder,
  allowVariants: boolean
): ProgramSection {
  const sectionType = normalizeSectionType(stringFrom(section.type, "training"));
  const groups = arrayOfRecords(section.exercise_groups ?? section.groups).map((group, index) =>
    normalizeGroup(group, dayNumber, templateWeek, sectionIndex, index, warnings, aliases, userExercises, sectionType, pathBuilder, allowVariants)
  );

  return {
    id: newId("section"),
    type: sectionType,
    name: stringFrom(section.name ?? section.type, "Training"),
    groups
  };
}

function normalizeGroup(
  group: ImportPayload,
  dayNumber: number,
  templateWeek: number | undefined,
  sectionIndex: number,
  groupIndex: number,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
  sectionType: string,
  pathBuilder: ExercisePathBuilder,
  allowVariants: boolean
): ProgramGroup {
  const exercises = arrayOfRecords(group.exercises).map((exercise, index) =>
    normalizeExercise(exercise, pathBuilder(dayNumber, templateWeek, sectionIndex, groupIndex, index), warnings, aliases, userExercises, sectionType, allowVariants)
  );

  return {
    id: newId("group"),
    type: normalizeGroupType(optionalString(group.type)),
    notes: optionalString(group.notes),
    exercises
  };
}

function normalizeExercise(exercise: ImportPayload, path: string, warnings: ImportWarning[], aliases: AliasDocument[], userExercises: UserExerciseDocument[], sectionType: string, allowVariants: boolean = true): ProgramExercise {
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

  const result: WithVariants = {
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

  if (allowVariants) {
    const variants = parseVariants(exercise.variants, path, warnings, aliases, userExercises, sectionType);
    if (variants.length > 0) result.__variants = variants;
  } else if (Array.isArray(exercise.variants) && exercise.variants.length > 0) {
    // Variants inside an override replacement day are out of scope: they are
    // ignored (never parsed/persisted). Structural warning (no rawName) so
    // extractUnresolvedExercises never treats it as a resolution item.
    warnings.push({
      path,
      message: `Variants on "${name}" inside an override day are not supported and were ignored.`,
    });
  }
  return result;
}

// Parses the raw `variants` array on an exercise into internal
// NormalizedVariant carriers. Only keys actually present on a raw variant are
// populated in `fields` (sparse inheritance — an absent key means "inherit
// from base," never "set to undefined"). A variant `name` runs through the
// same matchExercise path as base names, emitting an ImportWarning on the
// `.variants.{v}` path when unmatched. `variantIndex` is the index into the
// RAW array so the warning path matches a resolution UI addressing the raw
// JSON. Never persisted — stripped at expansion.
function parseVariants(
  raw: unknown,
  basePath: string,
  warnings: ImportWarning[],
  aliases: AliasDocument[],
  userExercises: UserExerciseDocument[],
  sectionType: string,
): NormalizedVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedVariant[] = [];
  raw.forEach((entry, variantIndex) => {
    if (!isRecord(entry)) return;
    const weeks = normalizeVariantWeeks(entry.weeks);
    const fields: NormalizedVariant["fields"] = {};
    const name = optionalString(entry.name);
    if (name !== undefined) fields.name = name.replace(/^[a-z]\.\s+/i, "");
    const sets = optionalNumber(entry.sets);
    if (sets !== undefined) fields.sets = sets;
    const reps = optionalString(entry.reps);
    if (reps !== undefined) fields.reps = reps;
    const load = optionalString(entry.load ?? entry.weight);
    if (load !== undefined) fields.load = load;
    const rest = optionalString(entry.rest);
    if (rest !== undefined) fields.rest = rest;
    const tempo = normalizeTempo(entry);
    if (tempo !== undefined) fields.tempo = tempo;
    const notes = optionalString(entry.notes);
    if (notes !== undefined) fields.notes = notes;
    const ctv = optionalBoolean(entry.countsTowardVolume) ?? optionalBoolean(entry.counts_toward_volume);
    if (ctv !== undefined) fields.countsTowardVolume = ctv;
    if (isRecord(entry.tags)) {
      fields.tags = {
        primary: stringArray(entry.tags.primary),
        secondary: stringArray(entry.tags.secondary),
        incidental: stringArray(entry.tags.incidental),
        modifiers: stringArray(entry.tags.modifiers),
      };
    }
    let canonicalExerciseId: ID | undefined;
    const hasName = fields.name !== undefined;
    if (hasName) {
      const match = matchExercise(fields.name!, aliases, userExercises);
      if (match.kind === "matched") {
        canonicalExerciseId = match.item.id;
      } else {
        warnings.push({
          path: `${basePath}.variants.${variantIndex}`,
          message: `${fields.name} was imported without a catalog match.`,
          rawName: fields.name,
          suggestions: match.suggestions,
          sectionType,
        });
      }
    }
    out.push({ weeks, fields, canonicalExerciseId, hasName });
  });
  return out;
}

// De-duplicated positive integers, preserving first-seen order.
function normalizeVariantWeeks(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const weeks: number[] = [];
  for (const v of value) {
    if (typeof v === "number" && Number.isInteger(v) && v > 0 && !seen.has(v)) {
      seen.add(v);
      weeks.push(v);
    }
  }
  return weeks;
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

// Targeted coercion for fields where a model may emit a stringified integer
// (e.g. `"weeks": "4"`) instead of a JSON number. Only used for `weeks` —
// other optionalNumber callers (weekNumber, sets) keep the strict
// number-only check so this does not change their behavior.
function coercePositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
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
