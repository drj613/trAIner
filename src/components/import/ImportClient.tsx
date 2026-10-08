"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Save } from "lucide-react";
import { parseProgramJson, ImportError, type ImportReview } from "@/lib/import/parser";
import type { RecoveryReason } from "@/lib/import/sanitizeJson";
import { buildRecoveryPrompt } from "@/lib/prompts/builder";
import {
  extractUnresolvedExercises,
  applyResolutions,
  buildInitialResolutions,
  groupResolutionOccurrences,
  storedOccurrenceCounts,
  storedExerciseCount,
  rememberableTarget,
  rememberedAliasInputs,
  rememberedAliasConflicts,
  CUSTOM_ID,
  type AliasSaveInput,
  type ResolutionGroup,
  type ResolutionItem,
  type RememberedAliasConflict,
} from "@/lib/import/resolution";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import { toTitleCase } from "@/lib/catalog/normalize";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { userExerciseRepo } from "@/lib/storage/userExerciseRepo";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { ResolutionStep } from "./ResolutionStep";
import type { UserExerciseDocument } from "@/lib/programs/types";
import { createImportDraft, replaceDraftProgram, type ImportDraft } from "@/lib/import/draft";
import { ImportReviewEditor } from "./ImportReviewEditor";
import { baseExercisePath, overrideExercisePath } from "@/lib/import/paths";
import { getOverrideReplacementDays, getRenderableDays } from "@/lib/programs/overrides";

type Step = "paste" | "resolve" | "confirm";

export function ImportClient() {
  const { saveProgram } = useLocalData();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("paste");
  const [json, setJson] = useState("");
  const [review, setReview] = useState<ImportReview | undefined>();
  const [draft, setDraft] = useState<ImportDraft | undefined>();
  const [parseError, setParseError] = useState<string | null>(null);
  const [recoveryReason, setRecoveryReason] = useState<RecoveryReason>("syntax");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rememberNotice, setRememberNotice] = useState<string | null>(null);
  // The document already written for the CURRENT paste, and the paste it was
  // written for. Kept across edits on purpose: re-validating the same text must
  // update that document, not create a second one for the same routine.
  const [savedProgramId, setSavedProgramId] = useState<string | null>(null);
  const [savedJson, setSavedJson] = useState<string | null>(null);
  // Whether the last save finished with nothing changed since — the only thing
  // that swaps Save for "Open program".
  const [settled, setSettled] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  // groupKey -> the user explicitly asked to remember this interpretation.
  // Absent means local to this import, which is the default for every group.
  const [remembered, setRemembered] = useState<Record<string, boolean>>({});
  const [userExercises, setUserExercises] = useState<UserExerciseDocument[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const unresolvedItems = useMemo<ResolutionItem[]>(
    () => (review ? extractUnresolvedExercises(review.warnings) : []),
    [review],
  );

  const groups = useMemo<ResolutionGroup[]>(
    () => (review ? groupResolutionOccurrences(review.warnings) : []),
    [review],
  );

  // What the user is told: how many STORED exercises each decision changes.
  // A base-day path expands into one exercise per week-clone, so this is not
  // the occurrence-path count.
  const storedCounts = useMemo(
    () => (review ? storedOccurrenceCounts(review.program, groups) : {}),
    [review, groups],
  );

  // `remember` lives on the group shape, so the ticked state is folded back in
  // before anything decides what to persist.
  const groupsWithRemember = useMemo(
    () => groups.map((g) => ({ ...g, remember: remembered[g.groupKey] ?? false })),
    [groups, remembered],
  );

  // A tick only ever means "remember THIS answer". Once the group stops having
  // one answer, drop the tick rather than letting it re-arm itself against
  // whatever the occurrences settle on next.
  useEffect(() => {
    setRemembered((ticks) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [groupKey, ticked] of Object.entries(ticks)) {
        const group = groups.find((g) => g.groupKey === groupKey);
        const stillAnswerable = group !== undefined
          && rememberableTarget(group, resolutions) !== undefined;
        if (ticked && !stillAnswerable) {
          changed = true;
          continue;
        }
        next[groupKey] = ticked;
      }
      return changed ? next : ticks;
    });
  }, [groups, resolutions]);

  const exerciseCount = useMemo(
    () =>
      review?.program.days.reduce(
        (total, day) =>
          total +
          day.sections.reduce(
            (st, sec) =>
              st + sec.groups.reduce((gt, grp) => gt + grp.exercises.length, 0),
            0,
          ),
        0,
      ) ?? 0,
    [review],
  );

  async function handleValidate() {
    setParseError(null);
    try {
      const [aliases, userExs] = await Promise.all([
        aliasRepo.list(),
        userExerciseRepo.list(),
      ]);
      setUserExercises(userExs);
      const result = parseProgramJson(json, undefined, aliases, userExs);
      const nextDraft = createImportDraft(result, json);
      setDraft(nextDraft);
      const reviewResult = { ...result, warnings: [...nextDraft.currentWarnings, ...nextDraft.correctionHistory] };
      setReview(reviewResult);
      const items = extractUnresolvedExercises(reviewResult.warnings);
      const initial = buildInitialResolutions(items);
      setResolutions(initial);
      setRemembered({});
      setRememberNotice(null);
      setSettled(false);
      if (json !== savedJson) {
        setSavedProgramId(null);
        setSavedJson(null);
      }
      if (items.length > 0) {
        setStep("resolve");
      } else {
        setStep("confirm");
      }
    } catch (err) {
      if (err instanceof ImportError) {
        setRecoveryReason(err.reason);
        setParseError(err.message);
      } else {
        setRecoveryReason("syntax");
        setParseError(err instanceof Error ? err.message : "Parse error");
      }
    }
  }

  // Any change after a save means there is something new to save: bring the
  // Save button back rather than stranding the user on a stale "Open program".
  // The saved document's id deliberately survives, so saving again updates it.
  function clearSavedState() {
    setSettled(false);
    setRememberNotice(null);
  }

  function handleResolutionChange(path: string, canonicalId: string) {
    clearSavedState();
    setResolutions((prev) => {
      if (!canonicalId) {
        const next = { ...prev };
        delete next[path];
        return next;
      }
      return { ...prev, [path]: canonicalId };
    });
  }

  function handleDraftChange(program: ImportReview["program"]) {
    if (!draft) return;
    clearSavedState();
    const changedIdentities = findEditedExerciseIdentities(draft.program, program, review?.warnings ?? []);
    const changedToCustom = changedIdentities.filter((item) => item.custom);
    const nextDraft = replaceDraftProgram(draft, program);
    setDraft(nextDraft);
    setReview((previous) => previous ? {
      ...previous,
      program,
      warnings: [...nextDraft.currentWarnings, ...nextDraft.correctionHistory, ...changedToCustom.map(({ warning, name }) => ({
        ...warning,
        rawName: name,
        resolutionKind: "unmatched" as const,
        message: `${name} was imported without a catalog match.`,
      }))],
    } : previous);
    if (changedToCustom.length) {
      const changedPaths = new Set(changedToCustom.map(({ warning }) => warning.path));
      setResolutions((previous) => Object.fromEntries(Object.entries(previous).filter(([path]) => !changedPaths.has(path))));
      setStep("resolve");
    }
    const stalePaths = new Set(changedIdentities.map(({ warning }) => warning.path));
    if (stalePaths.size) setResolutions((previous) => Object.fromEntries(Object.entries(previous).filter(([path]) => !stalePaths.has(path))));
  }

  function handleRememberChange(groupKey: string, remember: boolean) {
    clearSavedState();
    setRemembered((prev) => ({ ...prev, [groupKey]: remember }));
  }

  async function handleAddToUserCatalog(paths: string[], name: string) {
    const ex = await userExerciseRepo.save(name);
    setUserExercises((prev) => [...prev, ex]);
    setResolutions((prev) => {
      const next = { ...prev };
      for (const path of paths) next[path] = ex.id;
      return next;
    });
  }

  function exerciseName(canonicalExerciseId: string): string | undefined {
    const catalogItem = exerciseCatalog.find((e) => e.id === canonicalExerciseId); // Exact concrete metadata lookup; grouping is intentionally not performed here.
    if (catalogItem) return toTitleCase(catalogItem.name);
    const userItem = userExercises.find((e) => e.id === canonicalExerciseId);
    return userItem ? toTitleCase(userItem.name) : undefined;
  }

  function describeRememberConflicts(conflicts: RememberedAliasConflict[]): string {
    const clauses = conflicts.map(({ input, existingCanonicalExerciseId }) => {
      const current = exerciseName(existingCanonicalExerciseId);
      return current
        ? `"${input.alias}" is already remembered as ${current}`
        : `"${input.alias}" is already remembered as another exercise`;
    });
    return `${clauses.join("; ")}. This import used your choice for itself only — remove or replace that mapping from the exercise catalog to remember a new one.`;
  }

  async function handleSave() {
    if (!review || isSaving) return;
    setSaveError(null);
    setRememberNotice(null);
    setIsSaving(true);

    try {
      const catalogResolutions = unresolvedItems
        .filter((item) => resolutions[item.path] && resolutions[item.path] !== CUSTOM_ID)
        .map((item) => ({ path: resolutionPathForTarget(draft?.program ?? review.program, review.warnings.find((warning) => warning.path === item.path)?.targetId, item.path), canonicalId: resolutions[item.path] }));

      const applied =
        catalogResolutions.length > 0
          ? syncResolvedEditingMetadata(applyResolutions(draft?.program ?? review.program, catalogResolutions))
          : draft?.program ?? review.program;
      // Same paste, already saved once (the conflict path stays on this step,
      // so the user can walk back and validate again): update that document
      // instead of leaving two for one routine.
      const resolvedProgram =
        savedProgramId && savedJson === json
          ? { ...applied, id: savedProgramId }
          : applied;

      // The routine goes in FIRST. Aliases are only a shortcut for future
      // imports, and alias save legitimately rejects a token that already
      // means something else — so saving them first would let a shortcut
      // conflict cost the user the whole import.
      await saveProgram(resolvedProgram);
      setSavedProgramId(resolvedProgram.id);
      setSavedJson(json);

      // Only groups the user explicitly marked. Everything else stays local to
      // this import, which is why an ordinary import performs no alias write
      // and dispatches no identity event.
      const aliasesToSave = rememberedAliasInputs(groupsWithRemember, resolutions);
      const notice = aliasesToSave.length > 0 ? await rememberAliases(aliasesToSave) : null;
      if (notice) {
        setSettled(true);
        setRememberNotice(notice);
        return;
      }

      navigate(`/programs/${resolvedProgram.id}`);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save program.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * One bulk alias write, not one per name: `saveMany` is a single transaction
   * that publishes a single identity event.
   *
   * `saveMany` rejects the WHOLE batch if any token already points somewhere
   * else, so the occupied tokens are found first and left out — the routine
   * keeps every choice either way, and the returned message names the taken
   * names. Returns `null` when there is nothing to report.
   */
  async function rememberAliases(
    aliasesToSave: AliasSaveInput[],
  ): Promise<string | null> {
    try {
      const conflicts = rememberedAliasConflicts(aliasesToSave, await aliasRepo.list());
      const savable = aliasesToSave.filter(
        (input) => !conflicts.some((conflict) => conflict.input === input),
      );
      if (savable.length > 0) await aliasRepo.saveMany(savable);
      return conflicts.length > 0 ? describeRememberConflicts(conflicts) : null;
    } catch {
      // A rejected write, or a token claimed by another tab between the check
      // and the write. The routine is already saved; only the shortcut is lost.
      return "The routine is saved, but your Remember choices could not be stored.";
    }
  }

  if (step === "paste") {
    return (
      <div className="stack">
        <div>
          <h1 className="text-2xl font-bold">Import</h1>
          <p className="muted">Paste JSON from an AI coach or external source.</p>
        </div>
        <textarea
          className="input min-h-72 font-mono text-xs"
          value={json}
          placeholder='{ "program_name": "...", "days": [...] }'
          onChange={(e) => setJson(e.target.value)}
        />
        {parseError && (
          <div className="stack" style={{ gap: 6 }}>
            <p className="text-sm" style={{ color: "var(--bad, red)" }}>
              {parseError}
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                const prompt = buildRecoveryPrompt(recoveryReason, parseError ?? undefined);
                void navigator.clipboard.writeText(prompt).catch(() => {});
              }}
            >
              <Copy size={14} /> Copy recovery prompt for your AI chat
            </button>
            <p className="text-xs muted">
              Paste this back into the same ChatGPT/Claude conversation to ask for a clean JSON re-emit.
            </p>
          </div>
        )}
        <button
          type="button"
          className="button"
          disabled={!json.trim()}
          onClick={() => void handleValidate()}
        >
          Validate →
        </button>
      </div>
    );
  }

  if (step === "resolve" && review) {
    return (
      <div className="stack">
        <h1 className="text-2xl font-bold">Resolve exercises</h1>
        <ResolutionStep
          items={unresolvedItems}
          groups={groups}
          storedCounts={storedCounts}
          resolutions={resolutions}
          remembered={remembered}
          userExercises={userExercises}
          onChange={handleResolutionChange}
          onRememberChange={handleRememberChange}
          onAddToUserCatalog={handleAddToUserCatalog}
          onBack={() => setStep("paste")}
          onNext={() => setStep("confirm")}
        />
      </div>
    );
  }

  if (step === "confirm" && review) {
    // Stored exercises, not occurrence paths: one base-day path can be four
    // week-clones, and a path in a structurally ambiguous day is none at all.
    const resolvedCount = storedExerciseCount(
      review.program,
      unresolvedItems
        .filter((i) => resolutions[i.path] && resolutions[i.path] !== CUSTOM_ID)
        .map((i) => i.path),
    );
    const customCount = storedExerciseCount(
      review.program,
      unresolvedItems.filter((i) => resolutions[i.path] === CUSTOM_ID).map((i) => i.path),
    );

    const weekCount = new Set(getRenderableDays(review.program).map((day) => day.weekNumber ?? 1)).size;
    const templateCount = review.program.editing?.templateDays.length ?? review.program.days.length;

    return (
      <div className="stack min-w-0" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <h1 className="text-2xl font-bold">Confirm import</h1>
        <section className="panel stack">
          <h2 className="font-bold">{review.program.title}</h2>
          <p className="muted text-sm">
            {weekCount > 1 ? `${weekCount} weeks · ${templateCount} template ${templateCount === 1 ? "workout" : "workouts"}` : `${review.program.days.length} ${review.program.days.length === 1 ? "day" : "days"} · ${exerciseCount} ${exerciseCount === 1 ? "exercise" : "exercises"}`}
          </p>
          {resolvedCount > 0 && (
            <p className="text-sm" style={{ color: "var(--good, green)" }}>
              {resolvedCount} {resolvedCount === 1 ? "exercise" : "exercises"} mapped to catalog
            </p>
          )}
          {customCount > 0 && (
            <p className="text-sm muted">
              {customCount} {customCount === 1 ? "exercise" : "exercises"} imported as custom (no history tracking)
            </p>
          )}
        </section>
        {draft && (
          <ImportReviewEditor
            program={draft.program}
            warnings={draft.currentWarnings}
            corrections={draft.correctionHistory}
            onChange={handleDraftChange}
          />
        )}
        <details className="panel">
          <summary className="font-semibold">Original JSON</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{draft?.originalJson ?? json}</pre>
          <button type="button" className="button secondary mt-2" onClick={() => {
            setReview(undefined);
            setDraft(undefined);
            setResolutions({});
            setStep("paste");
          }}>Revise source JSON</button>
        </details>
        {saveError && (
          <p className="text-sm" style={{ color: "var(--bad, red)" }}>
            {saveError}
          </p>
        )}
        {rememberNotice && (
          <p className="text-xs" style={{ color: "var(--warn, #e6b664)" }}>
            {rememberNotice}
          </p>
        )}
        <div className="flex gap-2 sticky bottom-0 z-10 py-3" style={{ background: "var(--bg)", borderTop: "1px solid var(--line)" }}>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              unresolvedItems.length > 0 ? setStep("resolve") : setStep("paste")
            }
          >
            ← Back
          </button>
          {settled && savedProgramId ? (
            <button
              type="button"
              className="button flex-1"
              onClick={() => navigate(`/programs/${savedProgramId}`)}
            >
              Open program →
            </button>
          ) : (
            <button
              type="button"
              className="button flex-1"
              disabled={isSaving}
              onClick={() => void handleSave()}
            >
              <Save size={14} /> {isSaving ? "Saving…" : "Save program"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function resolutionPathForTarget(program: ImportReview["program"], targetId: string | undefined, originalPath: string): string {
  if (!targetId) return originalPath;
  if (originalPath.startsWith("overrides.")) return originalPath;
  const variantSuffix = originalPath.match(/(\.variants\.\d+)$/)?.[1] ?? "";
  for (const [overrideIndex, override] of program.overrides.entries()) {
    for (const day of getOverrideReplacementDays(override)) {
      for (const [sectionIndex, section] of day.sections.entries()) {
        for (const [groupIndex, group] of section.groups.entries()) {
          const exerciseIndex = group.exercises.findIndex((exercise) => exercise.id === targetId);
          if (exerciseIndex >= 0) return overrideExercisePath(overrideIndex, day.dayNumber, day.templateWeek, sectionIndex, groupIndex, exerciseIndex);
        }
      }
    }
  }
  for (const day of getRenderableDays(program)) {
    for (const [sectionIndex, section] of day.sections.entries()) {
      for (const [groupIndex, group] of section.groups.entries()) {
        for (const [exerciseIndex, exercise] of group.exercises.entries()) {
          if (exercise.id === targetId) {
            return `${baseExercisePath(day.dayNumber, day.templateWeek, sectionIndex, groupIndex, exerciseIndex)}${variantSuffix}`;
          }
        }
      }
    }
  }
  return originalPath;
}

function syncResolvedEditingMetadata(program: ImportReview["program"]): ImportReview["program"] {
  if (!program.editing) return program;
  const resolved = structuredClone(program);
  const templateExercises = resolved.editing!.templateDays.flatMap((day) => day.sections.flatMap((section) => section.groups.flatMap((group) => group.exercises)));
  const effectiveDays = getRenderableDays(resolved);
  const exercisesByOccurrence = new Map(effectiveDays.map((day) => [day.id, day.sections.flatMap((section) => section.groups.flatMap((group) => group.exercises))]));
  for (const binding of resolved.editing!.elementBindings) {
    if (binding.kind !== "exercise") continue;
    const occurrenceDay = effectiveDays.find((day) => day.id === binding.occurrenceDayId);
    if (occurrenceDay?.weekNumber !== undefined && occurrenceDay.weekNumber !== 1) continue;
    const occurrenceExercise = exercisesByOccurrence.get(binding.occurrenceDayId)?.find((exercise) => exercise.id === binding.occurrenceElementId);
    const templateExercise = templateExercises.find((exercise) => exercise.id === binding.templateElementId);
    if (occurrenceExercise?.canonicalExerciseId && templateExercise) {
      templateExercise.canonicalExerciseId = occurrenceExercise.canonicalExerciseId;
    }
  }
  return resolved;
}

function findEditedExerciseIdentities(previous: ImportReview["program"], next: ImportReview["program"], warnings: ImportReview["warnings"]): { warning: ImportReview["warnings"][number]; name: string; custom: boolean }[] {
  const targets = new Map<string, { name: string; canonicalExerciseId?: string }>();
  const nextDays = getRenderableDays(next);
  for (const day of nextDays) for (const section of day.sections) for (const group of section.groups) for (const exercise of group.exercises) {
    targets.set(exercise.id, { name: exercise.name, canonicalExerciseId: exercise.canonicalExerciseId });
  }
  const prior = new Map<string, { name: string; canonicalExerciseId?: string }>();
  for (const day of getRenderableDays(previous)) for (const section of day.sections) for (const group of section.groups) for (const exercise of group.exercises) prior.set(exercise.id, { name: exercise.name, canonicalExerciseId: exercise.canonicalExerciseId });
  const changed = new Map<string, { name: string; custom: boolean }>();
  for (const [id, item] of targets) {
    const old = prior.get(id);
    if ((!old && !item.canonicalExerciseId) || (old && (old.name !== item.name || old.canonicalExerciseId !== item.canonicalExerciseId))) {
      changed.set(id, { name: item.name, custom: !item.canonicalExerciseId });
    }
  }
  const result: { warning: ImportReview["warnings"][number]; name: string; custom: boolean }[] = [];
  for (const [targetId, { name, custom }] of changed) {
    const old = warnings.find((warning) => warning.targetId === targetId);
    if (old) {
      result.push({ warning: { ...old, path: resolutionPathForTarget(next, targetId, old.path) }, name, custom });
      continue;
    }
    if (!custom) continue;
    for (const [dayIndex, day] of nextDays.entries()) {
      let found = false;
      for (const [sectionIndex, section] of day.sections.entries()) for (const [groupIndex, group] of section.groups.entries()) {
        const exerciseIndex = group.exercises.findIndex((exercise) => exercise.id === targetId);
        if (exerciseIndex < 0) continue;
        result.push({ warning: {
          path: resolutionPathForTarget(next, targetId, baseExercisePath(day.dayNumber, day.templateWeek, sectionIndex, groupIndex, exerciseIndex)),
          message: `${name} was imported without a catalog match.`, rawName: name,
          sectionType: section.type, targetId,
        }, name, custom });
        found = true;
      }
      if (found) break;
      void dayIndex;
    }
  }
  return result;
}
