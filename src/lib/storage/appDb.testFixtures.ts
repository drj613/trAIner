import { deleteDB, openDB, type DBSchema } from "idb";
import { getOverrideReplacementDays } from "@/lib/programs/overrides";
import type {
  AliasDocument,
  ProgramDay,
  ProgramDocument,
  ProgramExercise,
  WorkoutLogDocument,
  WorkoutSetLog,
} from "@/lib/programs/types";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";
import { logRepo } from "./logRepo";
import { programRepo } from "./programRepo";

type V9Alias = Omit<AliasDocument, "provenance"> & { provenance?: "remembered" };

interface Version9Db extends DBSchema {
  profile: { key: string; value: Record<string, unknown> };
  programs: { key: string; value: ProgramDocument };
  logs: {
    key: string;
    value: WorkoutLogDocument;
    indexes: { "by-program": string; "by-day": string };
  };
  aliases: {
    key: string;
    value: V9Alias;
    indexes: { "by-normalized-alias": string; "by-exercise": string };
  };
  backups: { key: string; value: Record<string, unknown> };
  metrics: { key: string; value: { exerciseId: string; stale: boolean } };
  userExercises: { key: string; value: { id: string; name: string; createdAt: string } };
  bodyweight: { key: string; value: Record<string, unknown> };
  promptPresets: { key: string; value: Record<string, unknown> };
}

export type V9Fixture = {
  programCanonicalId: string;
  logCanonicalId: string;
  weekVariantCanonicalId: string;
  overrideReplacementCanonicalId: string;
  warningSuggestionIds: string[];
  unknownCanonicalId: string;
  uniqueNameOnly: string;
  ambiguousNameOnly: string;
  unknownNameOnly: string;
  aliases: Array<{
    alias: string;
    canonicalExerciseId: string;
    provenance?: "remembered";
  }>;
};

export type SeededV9 = { slotId: string; sets: WorkoutSetLog[] };

export function makeV9Fixture(fixture: V9Fixture): V9Fixture {
  return structuredClone(fixture);
}

export const v9Fixture: V9Fixture = makeV9Fixture({
  programCanonicalId: "removed-squat-id",
  logCanonicalId: "removed-squat-id",
  weekVariantCanonicalId: "removed-squat-id",
  overrideReplacementCanonicalId: "removed-squat-id",
  warningSuggestionIds: ["removed-squat-id", "unknown-catalog-id"],
  unknownCanonicalId: "unknown-catalog-id",
  uniqueNameOnly: "High Bar Back Squat",
  ambiguousNameOnly: "Back Squat",
  unknownNameOnly: "Mystery lift",
  aliases: [
    { alias: "RDL", canonicalExerciseId: "romanian-deadlift" },
    { alias: "Back Squat", canonicalExerciseId: "barbell-back-squat" },
    { alias: "3x8 @ RPE 7", canonicalExerciseId: "barbell-back-squat" },
    {
      alias: "My high bar",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    },
  ],
});

const NOW = "2026-08-18T12:34:56.000Z";

function exercise(
  id: string,
  name: string,
  canonicalExerciseId?: string,
): ProgramExercise {
  return {
    id,
    name,
    ...(canonicalExerciseId ? { canonicalExerciseId } : {}),
    sets: 4,
    reps: "6-8",
    load: "RPE 8",
    rest: "3 minutes",
    tempo: "31X0",
    notes: `notes:${id}`,
    countsTowardVolume: true,
    tags: {
      primary: ["quads"],
      secondary: ["glutes"],
      incidental: ["core"],
      modifiers: ["strength"],
    },
  };
}

function day(id: string, weekNumber: number, exercises: ProgramExercise[]): ProgramDay {
  return {
    id,
    dayNumber: 1,
    weekNumber,
    templateWeek: weekNumber,
    title: `Week ${weekNumber}`,
    sections: [{
      id: `section-${id}`,
      type: "strength",
      name: "Main work",
      groups: [{
        id: `group-${id}`,
        type: "single",
        notes: `group-notes:${id}`,
        exercises,
      }],
    }],
  };
}

function makeProgram(fixture: V9Fixture): ProgramDocument {
  const baseDay = day("day-base", 1, [
    exercise("slot-base", "Former squat", fixture.programCanonicalId),
    exercise("slot-unique", fixture.uniqueNameOnly),
    exercise("slot-ambiguous", fixture.ambiguousNameOnly),
    exercise("slot-unknown-name", fixture.unknownNameOnly),
    exercise("slot-unknown-id", "Unknown catalogued lift", fixture.unknownCanonicalId),
  ]);
  const weekVariant = day("day-week-variant", 2, [
    exercise("slot-week-variant", "Former squat week variant", fixture.weekVariantCanonicalId),
  ]);
  const overrideDay = day("day-override", 3, [
    exercise("slot-override", "Former squat override", fixture.overrideReplacementCanonicalId),
  ]);

  return {
    id: "p1",
    title: "Migration preservation fixture",
    description: "Keep every non-catalogue field byte-for-byte stable",
    progression: [{ applies: "squat", rule: "Add five pounds" }],
    source: "import",
    active: true,
    status: "active",
    goal: "strength",
    daysPerWeek: 1,
    lengthWeeks: 3,
    days: [baseDay, weekVariant],
    overrides: [{
      id: "override-1",
      scope: "week",
      programId: "p1",
      weekNumber: 3,
      replacement: [overrideDay],
      reason: "Deload",
      createdAt: NOW,
    }],
    import: {
      rawJson: { preserved: [1, 2, 3] },
      warnings: [{
        path: "days.1.sections.0.groups.0.exercises.0",
        rawName: "Former squat",
        message: "Fixture warning",
        sectionType: "strength",
        suggestions: fixture.warningSuggestionIds.map((exerciseId, index) => ({
          exerciseId,
          name: `Suggestion ${index + 1}`,
          score: 0.9 - index / 10,
        })),
      }],
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeLog(fixture: V9Fixture, sets: WorkoutSetLog[]): WorkoutLogDocument {
  return {
    id: "l1",
    programId: "p1",
    dayId: "day-base",
    performedAt: "2026-08-17T23:30:00.000Z",
    performedDate: "2026-08-17",
    completedAt: "2026-08-18T00:45:00.000Z",
    dayNote: "Day note survives",
    entries: [
      {
        exerciseId: "slot-base",
        exerciseName: "Former squat performed",
        canonicalExerciseId: fixture.logCanonicalId,
        sets,
        notes: "Entry notes survive",
      },
      { exerciseId: "log-slot-unique", exerciseName: fixture.uniqueNameOnly, sets: [], notes: "unique" },
      { exerciseId: "log-slot-ambiguous", exerciseName: fixture.ambiguousNameOnly, sets: [], notes: "ambiguous" },
      { exerciseId: "log-slot-unknown", exerciseName: fixture.unknownNameOnly, sets: [], notes: "unknown" },
    ],
    notes: "Log notes survive",
  };
}

export async function seedVersion9Database(fixture: V9Fixture): Promise<SeededV9> {
  resetDbConnection();
  await deleteDB(DB_NAME);
  const v9 = await openDB<Version9Db>(DB_NAME, 9, {
    upgrade(db) {
      db.createObjectStore("profile", { keyPath: "id" });
      db.createObjectStore("programs", { keyPath: "id" });
      const logs = db.createObjectStore("logs", { keyPath: "id" });
      logs.createIndex("by-program", "programId");
      logs.createIndex("by-day", "dayId");
      const aliases = db.createObjectStore("aliases", { keyPath: "id" });
      aliases.createIndex("by-normalized-alias", "normalizedAlias", { unique: true });
      aliases.createIndex("by-exercise", "canonicalExerciseId");
      db.createObjectStore("backups", { keyPath: "id" });
      db.createObjectStore("metrics", { keyPath: "exerciseId" });
      db.createObjectStore("userExercises", { keyPath: "id" });
      db.createObjectStore("bodyweight", { keyPath: "id" });
      db.createObjectStore("promptPresets", { keyPath: "id" });
    },
  });

  const sets: WorkoutSetLog[] = [
    { setNumber: 1, weight: 225, unit: "lb", reps: 6, rpe: 8, notes: "clean" },
    { setNumber: 2, rawCell: "AMRAP", notes: "raw cell survives" },
  ];
  const tx = v9.transaction(["programs", "logs", "aliases", "metrics"], "readwrite");
  tx.objectStore("programs").put(makeProgram(fixture));
  tx.objectStore("logs").put(makeLog(fixture, sets));
  fixture.aliases.forEach((alias, index) => tx.objectStore("aliases").put({
    id: `alias-${index + 1}`,
    alias: alias.alias,
    normalizedAlias: alias.alias.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    canonicalExerciseId: alias.canonicalExerciseId,
    ...(alias.provenance ? { provenance: alias.provenance } : {}),
    createdAt: NOW,
  }));
  tx.objectStore("metrics").put({ exerciseId: "slot-base", stale: true });
  await tx.done;
  v9.close();
  resetDbConnection();
  return { slotId: "slot-base", sets: structuredClone(sets) };
}

export async function openCurrentDatabase(): Promise<void> {
  await getDb();
}

function exercisesInDays(days: ProgramDay[]): ProgramExercise[] {
  return days.flatMap((candidateDay) =>
    candidateDay.sections.flatMap((section) =>
      section.groups.flatMap((group) => group.exercises),
    ),
  );
}

export async function readCanonicalReferences(programId: string) {
  const program = (await programRepo.get(programId))!;
  const log = (await logRepo.get("l1"))!;
  const replacementDays = program.overrides.flatMap(getOverrideReplacementDays);
  return {
    base: program.days[0].sections[0].groups[0].exercises[0].canonicalExerciseId,
    weekVariant: program.days[1].sections[0].groups[0].exercises[0].canonicalExerciseId,
    overrideReplacement: replacementDays[0].sections[0].groups[0].exercises[0].canonicalExerciseId,
    log: log.entries[0].canonicalExerciseId,
    warningSuggestionIds: program.import?.warnings[0].suggestions?.map((suggestion) => suggestion.exerciseId),
    unknown: program.days[0].sections[0].groups[0].exercises[4].canonicalExerciseId,
  };
}

export async function readCanonicalIdForName(name: string): Promise<string | undefined> {
  const programs = await programRepo.list();
  const exercises = programs.flatMap((program) => [
    ...exercisesInDays(program.days),
    ...exercisesInDays(program.overrides.flatMap(getOverrideReplacementDays)),
  ]);
  return exercises.find((candidate) => candidate.name === name)?.canonicalExerciseId;
}

export async function readLogCanonicalIdForName(name: string): Promise<string | undefined> {
  const logs = await logRepo.list();
  return logs.flatMap((log) => log.entries)
    .find((entry) => entry.exerciseName === name)?.canonicalExerciseId;
}

export async function snapshotNormalizedStores(): Promise<string> {
  const db = await getDb();
  const tx = db.transaction(["programs", "logs", "aliases", "normalizationOverrides"], "readonly");
  const [programs, logs, aliases, overrides] = await Promise.all([
    tx.objectStore("programs").getAll(),
    tx.objectStore("logs").getAll(),
    tx.objectStore("aliases").getAll(),
    tx.objectStore("normalizationOverrides").getAll(),
    tx.done,
  ]);
  const byId = <T extends { id: string }>(values: T[]) =>
    [...values].sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({
    programs: byId(programs),
    logs: byId(logs),
    aliases: byId(aliases),
    overrides: byId(overrides),
  });
}
