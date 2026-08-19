"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import {
  resolveExerciseIdentity,
  type ExerciseIdentityContext,
  type ExerciseIdentityResolver,
} from "@/lib/catalog/identity";
import { EXERCISE_IDENTITY_CHANGED_EVENT } from "@/lib/catalog/identityEvents";
import {
  disambiguationsByNormalizedName,
  legacyExerciseIdRedirects,
  modifiersById,
  movementsById,
} from "@/lib/catalog/registries";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { isReadableText } from "@/lib/storage/migrations/v10Identity";
import { normalizationOverrideRepo } from "@/lib/storage/normalizationOverrideRepo";
import { userExerciseRepo } from "@/lib/storage/userExerciseRepo";

export type ExerciseNormalizationValue = {
  /**
   * Generation counter for the identity snapshot on screen. It starts at 1 —
   * the generated registries are available synchronously, so generation 1 is a
   * usable snapshot before IndexedDB answers — and advances by exactly one each
   * time a committed identity change replaces it. Consumers use it as a
   * recompute key; it is deliberately NOT a reload counter, because a reload
   * that is superseded before it lands must not advance what consumers see.
   */
  version: number;
  context: ExerciseIdentityContext;
  resolve: ExerciseIdentityResolver;
  /** False until the first stored snapshot has been applied. */
  loaded: boolean;
};

const catalogById: ReadonlyMap<string, (typeof exerciseCatalog)[number]> = new Map(
  exerciseCatalog.map((exercise) => [exercise.id, exercise]),
);

// The generated half of the context never changes at runtime, so it is built
// once at module scope and shared by every snapshot. Only the three stored
// collections below are reloaded.
const generatedContext = {
  catalogById,
  movementsById,
  modifiersById,
  redirects: legacyExerciseIdRedirects,
  disambiguations: disambiguationsByNormalizedName,
} as const;

const emptyContext: ExerciseIdentityContext = {
  ...generatedContext,
  aliases: [],
  userExercises: [],
  normalizationOverrides: [],
};

type Snapshot = { context: ExerciseIdentityContext; version: number; loaded: boolean };

const initialSnapshot: Snapshot = { context: emptyContext, version: 1, loaded: false };

const ExerciseNormalizationContext = createContext<ExerciseNormalizationValue | undefined>(undefined);

/**
 * Loads the three stored identity collections and republishes the whole
 * resolution context as one value.
 *
 * Two properties this exists to guarantee:
 *
 * 1. **The reload is atomic.** All three collections are read together and
 *    applied in a single state update, so no consumer can ever observe a
 *    context whose aliases are fresh while its overrides are stale. Splitting
 *    this into per-store state would publish that torn pair on every change.
 * 2. **Resolution stays pure.** The provider only supplies data;
 *    `resolveExerciseIdentity` is the same pure function the importer,
 *    migration, and history projection call. Nothing about how identity is
 *    decided lives in React.
 */
export function ExerciseNormalizationProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  // Monotonic request id. Reloads are triggered by an event, so two can be in
  // flight at once; only the newest may land. Without this, a slow earlier read
  // can overwrite a newer snapshot with data that predates the committed write
  // that triggered it — the same torn state, arriving late.
  const requestCounter = useRef(0);
  const appliedRequest = useRef(0);

  const reload = useCallback(() => {
    requestCounter.current += 1;
    const requestId = requestCounter.current;

    void (async () => {
      const [aliases, userExercises, normalizationOverrides] = await Promise.all([
        aliasRepo.list(),
        userExerciseRepo.list(),
        normalizationOverrideRepo.list(),
      ]);

      if (requestId <= appliedRequest.current) return;
      appliedRequest.current = requestId;

      const nextContext: ExerciseIdentityContext = {
        ...generatedContext,
        // A row we cannot read is left out of the resolution context rather
        // than rewritten or deleted: the resolver lowercases these fields on
        // every name resolution, so one unreadable row would otherwise break
        // resolution app-wide. Same rule, same reason, as
        // `createMigrationContext`.
        aliases: aliases.filter((alias) => isReadableText(alias.normalizedAlias) || isReadableText(alias.alias)),
        userExercises: userExercises.filter((exercise) => isReadableText(exercise.name)),
        normalizationOverrides,
      };

      setSnapshot((previous) => ({
        context: nextContext,
        version: previous.loaded ? previous.version + 1 : previous.version,
        loaded: true,
      }));
    })();
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(EXERCISE_IDENTITY_CHANGED_EVENT, reload);
    return () => window.removeEventListener(EXERCISE_IDENTITY_CHANGED_EVENT, reload);
  }, [reload]);

  const value = useMemo<ExerciseNormalizationValue>(
    () => ({
      version: snapshot.version,
      context: snapshot.context,
      resolve: (input) => resolveExerciseIdentity(input, snapshot.context),
      loaded: snapshot.loaded,
    }),
    [snapshot],
  );

  return (
    <ExerciseNormalizationContext.Provider value={value}>{children}</ExerciseNormalizationContext.Provider>
  );
}

export function useExerciseNormalization(): ExerciseNormalizationValue {
  const value = useContext(ExerciseNormalizationContext);

  if (!value) {
    throw new Error("useExerciseNormalization must be used within ExerciseNormalizationProvider.");
  }

  return value;
}
