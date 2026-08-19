import { exerciseCatalog } from "@/lib/catalog/exercises";
import {
  prepareImportName,
  resolveExerciseIdentity,
  type ExerciseIdentityContext,
  type NormalizationOverrideDocument,
} from "@/lib/catalog/identity";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import {
  disambiguationsByNormalizedName,
  legacyExerciseIdRedirects,
  modifiersById,
  movementsById,
} from "@/lib/catalog/registries";
import type {
  AliasDocument,
  ProgramDay,
  ProgramDocument,
  ProgramExercise,
  UserExerciseDocument,
  WorkoutLogDocument,
  WorkoutLogEntry,
} from "@/lib/programs/types";

// The pure half of the v10 exercise-identity migration: given a resolution
// context, rewrite one stored record. Every function here is a
// database-independent transform, which is what lets the v10 upgrade block and
// restoreBackup share one implementation instead of drifting apart (the spec's
// "Backup and database migration use the same canonical redirect function so
// their results cannot diverge").
//
// These transforms are for *migration*, not for reads. The spec replaced
// per-read normalization with a persisted migration, so calling migrateProgram
// or migrateLog on a read path would quietly reintroduce what it removed.
//
// Adding a field to this traversal? Three rules, in order:
//   1. Read nothing without a type guard. Containers go through mapArray (an
//      array we can walk, or the value untouched); records through isRecord
//      (which excludes arrays, because spreading one rewrites it into an
//      index-keyed object); leaf strings through isReadableText before they
//      reach normalizeExerciseName, prepareImportName, or the resolver.
//   2. Never rewrite what you could not read. A malformed record is passed
//      through exactly as stored — including its key set, so prefer a
//      conditional spread over assigning a possibly-undefined mapped value.
//   3. Check whether your write can be *rejected* as well as throw. Guards
//      catch bad reads; a unique index (today only by-normalized-alias) or an
//      invalid key rejects the request instead, and the upgrade's abort turns
//      that into a deterministic failed migration on every load. If the field
//      feeds an index, make the write set legal before issuing it.
// Anything you add here needs a malformed-shape test AND a mutation showing
// the guard is load-bearing — four toothless guards shipped without one.
//
// One genuine exception to rule 2: an unreadable record is passed through
// untouched *except* for aliases, which classifyAliases drops once nothing
// usable is left of them. Do not justify that with "aliases are
// machine-created" — that is false. Pre-v10 aliases came from the import flow,
// where the resolution map is filled both by automatic scoring and by the
// user's explicit manual pick, with no stored field distinguishing the two. The
// honest justification is narrower: an alias with no usable token and no usable
// target can never be matched, displayed, or redirected again, so keeping it
// only lets it short-circuit the new disambiguation flow forever.

const catalogById = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise]));

export function createMigrationContext(
  aliases: readonly AliasDocument[],
  userExercises: readonly UserExerciseDocument[],
  // Explicit rather than defaulted: both callers pass an empty list, but for
  // different reasons that are worth stating at the call site. Overrides are a
  // read-time input; baking override-derived identity into stored records would
  // survive the override being deleted.
  normalizationOverrides: readonly NormalizationOverrideDocument[],
): ExerciseIdentityContext {
  return {
    catalogById,
    movementsById,
    modifiersById,
    redirects: legacyExerciseIdRedirects,
    disambiguations: disambiguationsByNormalizedName,
    aliases,
    // The resolver name-matches custom exercises (the unique-custom-name
    // fallback in identity.ts), so a record whose name is not a string would
    // throw there. Such a record cannot be matched by name under any input,
    // so it is left out of the resolution context. The stored user-exercise
    // record itself is never read again and never rewritten.
    userExercises: userExercises.filter((exercise) => isReadableText(exercise.name)),
    normalizationOverrides,
  };
}

// Leaf string fields are as untrustworthy as the containers around them.
// normalizeExerciseName does `value.toLowerCase()`, so a missing or
// non-string id/name throws. The v10 block now catches and aborts, so such a
// throw rolls the upgrade back and the next load retries it — but that leaves
// the user stuck at version 9 with a broken record they cannot see or fix, so
// these guards remain the layer that lets the migration actually succeed.
// restoreBackup checks aliases with hasIds only and defers deep validation,
// so a truncated or hand-edited backup can plant these shapes on a pre-v10
// client. Every read that reaches normalizeExerciseName, prepareImportName,
// or the resolver is typeof-checked first.
export function isReadableText(value: unknown): value is string {
  return typeof value === "string";
}

function canonicalizeExplicitExerciseId(
  canonicalExerciseId: string,
  context: ExerciseIdentityContext,
): string {
  if (!isReadableText(canonicalExerciseId)) return canonicalExerciseId;
  return resolveExerciseIdentity(
    { kind: "catalog-reference", canonicalExerciseId },
    context,
  ).concreteExerciseId ?? canonicalExerciseId;
}

// Legacy documents are not guaranteed to have every array this traversal
// walks: the v7/v8 blocks in the upgrade read `(log.entries ?? [])` because
// logs predating that field exist, and backup.ts validates null override
// replacements because those exist too. An unguarded `.map` on one of those
// shapes throws, and the upgrade's catch then aborts — so the user's data is
// safe, but their database never reaches the current version and every load
// pays a failed migration. Tolerate the malformed shape and pass the record
// through untouched instead; a record we cannot read is one we must not
// rewrite. The name says the policy the signature hides: array in, mapped
// array out; anything else in, that same thing back out.
export function mapArrayOrKeep<T>(value: T[], mapper: (item: T) => T): T[] {
  return Array.isArray(value) ? value.map(mapper) : value;
}

// Rule 2 taken all the way: an unreadable (or absent) array field is left off
// the rewritten record entirely, so its key set matches what was stored.
// `{ ...record, field: mapArrayOrKeep(...) }` would instead add an own
// `field: undefined` key when the field was absent — invisible under
// fake-indexeddb, which drops undefined-valued keys on write, and a real
// change under a browser's structuredClone, which keeps them.
function mappedArrayField<K extends string, T>(
  key: K,
  value: T[] | undefined,
  mapper: (item: T) => T,
): { [P in K]?: T[] } {
  if (!Array.isArray(value)) return {} as { [P in K]?: T[] };
  return { [key]: value.map(mapper) } as { [P in K]?: T[] };
}

// Arrays are excluded deliberately: `{ ...[1, 2] }` is `{ 0: 1, 1: 2 }`, so
// treating an array-shaped day/section/group/entry as a record would silently
// rewrite it into an index-keyed object instead of passing it through.
export function isRecord<T>(value: T): value is T & object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// The line here is *absent* versus *present-but-unreadable*, not null versus
// non-null. `undefined`/`null` read as absent — the legitimate shape of logs
// predating `entries`, and exactly what the v7 phantom rule was written to
// delete — so they stay deletable. Anything else that is present but is not
// the array we expected is unreadable, and unreadable content is never
// grounds for deletion.
export function unreadableValue(value: unknown): boolean {
  return value !== undefined && value !== null && !Array.isArray(value);
}

function migrateProgramExercise(
  exercise: ProgramExercise,
  context: ExerciseIdentityContext,
): ProgramExercise {
  if (!isRecord(exercise)) return exercise;
  if (exercise.canonicalExerciseId) {
    return {
      ...exercise,
      canonicalExerciseId: canonicalizeExplicitExerciseId(exercise.canonicalExerciseId, context),
    };
  }
  // `id` reaches the resolver as `slotId`. It only lands in a template string
  // today, so a non-string survives by luck; guard it at the boundary rather
  // than depend on that.
  if (!isReadableText(exercise.name) || !isReadableText(exercise.id)) return exercise;
  const resolved = resolveExerciseIdentity({
    kind: "stored-exercise",
    slotId: exercise.id,
    performedName: exercise.name,
  }, context);
  return resolved.specificity === "exact" && resolved.concreteExerciseId
    ? { ...exercise, canonicalExerciseId: resolved.concreteExerciseId }
    : exercise;
}

function migrateProgramDay(day: ProgramDay, context: ExerciseIdentityContext): ProgramDay {
  if (!isRecord(day)) return day;
  return {
    ...day,
    ...mappedArrayField("sections", day.sections, (section) => (isRecord(section) ? {
      ...section,
      ...mappedArrayField("groups", section.groups, (group) => (isRecord(group) ? {
        ...group,
        ...mappedArrayField("exercises", group.exercises, (exercise) =>
          migrateProgramExercise(exercise, context)),
      } : group)),
    } : section)),
  };
}

function migrateProgramReplacement(
  replacement: ProgramDocument["overrides"][number]["replacement"],
  context: ExerciseIdentityContext,
): ProgramDocument["overrides"][number]["replacement"] {
  if (Array.isArray(replacement)) {
    return replacement.map((day) => migrateProgramDay(day, context));
  }
  return migrateProgramDay(replacement, context);
}

export function migrateProgram(
  program: ProgramDocument,
  context: ExerciseIdentityContext,
): ProgramDocument {
  return {
    ...program,
    ...mappedArrayField("days", program.days, (day) => migrateProgramDay(day, context)),
    ...mappedArrayField("overrides", program.overrides, (override) => (isRecord(override) ? {
      ...override,
      replacement: migrateProgramReplacement(override.replacement, context),
    } : override)),
    ...(isRecord(program.import) ? {
      import: {
        ...program.import,
        ...mappedArrayField("warnings", program.import.warnings, (warning) => (isRecord(warning) ? {
          ...warning,
          ...mappedArrayField("suggestions", warning.suggestions, (suggestion) =>
            (isRecord(suggestion) ? {
              ...suggestion,
              exerciseId: canonicalizeExplicitExerciseId(suggestion.exerciseId, context),
            } : suggestion)),
        } : warning)),
      },
    } : {}),
  };
}

function migrateLogEntry(
  entry: WorkoutLogEntry,
  context: ExerciseIdentityContext,
): WorkoutLogEntry {
  if (!isRecord(entry)) return entry;
  if (entry.canonicalExerciseId) {
    return {
      ...entry,
      canonicalExerciseId: canonicalizeExplicitExerciseId(entry.canonicalExerciseId, context),
    };
  }
  if (!isReadableText(entry.exerciseName) || !isReadableText(entry.exerciseId)) return entry;
  const resolved = resolveExerciseIdentity({
    kind: "stored-exercise",
    slotId: entry.exerciseId,
    performedName: entry.exerciseName,
  }, context);
  return resolved.specificity === "exact" && resolved.concreteExerciseId
    ? { ...entry, canonicalExerciseId: resolved.concreteExerciseId }
    : entry;
}

export function migrateLog(
  log: WorkoutLogDocument,
  context: ExerciseIdentityContext,
): WorkoutLogDocument {
  return {
    ...log,
    ...mappedArrayField("entries", log.entries, (entry) => migrateLogEntry(entry, context)),
  };
}

function concreteOutcomesForToken(
  normalizedAlias: string,
  userExercises: readonly UserExerciseDocument[],
): Set<string> {
  const outcomes = new Set<string>();
  for (const exercise of exerciseCatalog) {
    if (
      normalizeExerciseName(exercise.name) === normalizedAlias ||
      exercise.aliases.some((alias) => normalizeExerciseName(alias) === normalizedAlias)
    ) {
      outcomes.add(exercise.id);
    }
  }
  for (const exercise of userExercises) {
    if (!isReadableText(exercise.name)) continue;
    if (normalizeExerciseName(exercise.name) === normalizedAlias) outcomes.add(exercise.id);
  }
  return outcomes;
}

export function classifyAliases(
  aliases: readonly AliasDocument[],
  userExercises: readonly UserExerciseDocument[],
): AliasDocument[] {
  const context = createMigrationContext([], userExercises, []);
  // Keyed by recomputed token, not by row: `by-normalized-alias` is
  // `{ unique: true }`, and recomputing tokens can collapse two rows that v9
  // stored happily onto one key. A colliding re-put is *rejected* by the
  // index rather than throwing on a read, so none of the read guards above
  // catch it — and the retry would be deterministic, bricking the database
  // with no way for the user to see or fix the offending alias. Deduping here
  // is what keeps the write set legal.
  const byToken = new Map<string, AliasDocument>();
  const claim = (token: string, document: AliasDocument) => {
    const existing = byToken.get(token);
    if (existing && !winsCollision(document, existing)) return;
    byToken.set(token, document);
  };
  for (const alias of aliases) {
    // An alias we cannot read cannot be classified, and an unclassifiable
    // alias left in the store would keep short-circuiting the new
    // disambiguation flow forever. Drop it rather than retain it.
    if (!isReadableText(alias.alias) || !isReadableText(alias.canonicalExerciseId)) continue;
    const canonicalExerciseId = canonicalizeExplicitExerciseId(alias.canonicalExerciseId, context);
    const normalizedAlias = normalizeExerciseName(alias.alias);
    // Classification — and therefore the purge — is only for rows that arrive
    // *without* a provenance: a pre-v10 database row, or a version-1 backup.
    // A row that already carries one was classified by whoever wrote it, and
    // re-running the rules against a catalogue that has since grown would
    // delete aliases a live database of the same data keeps working with
    // indefinitely (nothing re-classifies on read). Spec line 373 scopes the
    // purge to version-1 backups; line 560 says to preserve remembered
    // provenance. Recomputing the token and deduping still applies to every
    // row — that is index integrity, not classification.
    if (alias.provenance === "remembered" || alias.provenance === "legacy-auto") {
      claim(normalizedAlias, {
        ...alias,
        normalizedAlias,
        canonicalExerciseId,
        provenance: alias.provenance,
      });
      continue;
    }

    const prepared = prepareImportName(alias.alias, disambiguationsByNormalizedName);
    const disambiguation = disambiguationsByNormalizedName.get(prepared.normalizedName);
    if (
      !normalizedAlias ||
      prepared.hasAlternative ||
      disambiguation?.kind === "underspecified-name"
    ) {
      continue;
    }

    // Spec: retain and redirect only legacy aliases whose token still has one
    // unique concrete outcome. That single check is what deletes collisions
    // and removed noise (a prescription like "3x8 @ RPE 7" has zero
    // outcomes); no separate noise heuristic is needed. Measured against the
    // 3,175 shipped catalogue entries, the digit/word predicate that used to
    // live here matched 71 canonical names — 70 containing a digit or degree
    // sign ("90/90 Hamstring", "45° Side Bend", ...) plus "front lever reps"
    // — and 6 further entries through their aliases ("Farmer Carry with
    // 2-Second March Pauses", ...), so 77 entries in all it would have
    // wrongly unlinked.
    const outcomes = concreteOutcomesForToken(normalizedAlias, userExercises);
    if (outcomes.size !== 1 || !outcomes.has(canonicalExerciseId)) continue;
    claim(normalizedAlias, { ...alias, normalizedAlias, canonicalExerciseId, provenance: "legacy-auto" });
  }
  return [...byToken.values()];
}

// Which of two rows claiming the same recomputed token survives.
//
// A user's own correction outranks anything else, whichever order the rows
// arrive in — losing a legacy duplicate costs a re-teach, losing the remembered
// one discards explicit intent. Within one class the newer `createdAt` wins.
// Rows freshly classified from a pre-v10 database provably agree on their target
// anyway (the `outcomes.size === 1 && outcomes.has(canonicalExerciseId)` gate
// only admits rows whose shared token has exactly one outcome, and both must
// equal it), so there the choice only changes stored display text; rows arriving
// already classified from a hand-editable backup file can genuinely disagree,
// which is why the tiebreak is not left to `getAll`'s key order. Equal or
// unreadable timestamps fall back to first-writer-wins, stable for a given
// order.
function winsCollision(candidate: AliasDocument, incumbent: AliasDocument): boolean {
  const candidateRemembered = candidate.provenance === "remembered";
  const incumbentRemembered = incumbent.provenance === "remembered";
  if (candidateRemembered !== incumbentRemembered) return candidateRemembered;
  if (!isReadableText(candidate.createdAt) || !isReadableText(incumbent.createdAt)) return false;
  return candidate.createdAt > incumbent.createdAt;
}
