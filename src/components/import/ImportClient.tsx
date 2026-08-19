"use client";

import { useMemo, useState } from "react";
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

type Step = "paste" | "resolve" | "confirm";

export function ImportClient() {
  const { saveProgram } = useLocalData();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("paste");
  const [json, setJson] = useState("");
  const [review, setReview] = useState<ImportReview | undefined>();
  const [parseError, setParseError] = useState<string | null>(null);
  const [recoveryReason, setRecoveryReason] = useState<RecoveryReason>("syntax");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rememberNotice, setRememberNotice] = useState<string | null>(null);
  const [savedProgramId, setSavedProgramId] = useState<string | null>(null);
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
      setReview(result);
      const items = extractUnresolvedExercises(result.warnings);
      const initial = buildInitialResolutions(items);
      setResolutions(initial);
      setRemembered({});
      setRememberNotice(null);
      setSavedProgramId(null);
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

  // Any change after a save invalidates what was saved: drop the "already
  // saved" state so the Save button comes back rather than stranding the user
  // on a stale "Open program".
  function clearSavedState() {
    setSavedProgramId(null);
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
    const catalogItem = exerciseCatalog.find((e) => e.id === canonicalExerciseId);
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
        .map((item) => ({ path: item.path, canonicalId: resolutions[item.path] }));

      const resolvedProgram =
        catalogResolutions.length > 0
          ? applyResolutions(review.program, catalogResolutions)
          : review.program;

      // The routine goes in FIRST. Aliases are only a shortcut for future
      // imports, and alias save legitimately rejects a token that already
      // means something else — so saving them first would let a shortcut
      // conflict cost the user the whole import.
      await saveProgram(resolvedProgram);

      // Only groups the user explicitly marked. Everything else stays local to
      // this import, which is why an ordinary import performs no alias write
      // and dispatches no identity event.
      const aliasesToSave = rememberedAliasInputs(groupsWithRemember, resolutions);
      const notice = aliasesToSave.length > 0 ? await rememberAliases(aliasesToSave) : null;
      if (notice) {
        setSavedProgramId(resolvedProgram.id);
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
    const resolvedCount = unresolvedItems.filter(
      (i) => resolutions[i.path] && resolutions[i.path] !== CUSTOM_ID,
    ).length;
    const customCount = unresolvedItems.filter(
      (i) => resolutions[i.path] === CUSTOM_ID,
    ).length;

    return (
      <div className="stack">
        <h1 className="text-2xl font-bold">Confirm import</h1>
        <section className="panel stack">
          <h2 className="font-bold">{review.program.title}</h2>
          <p className="muted text-sm">
            {review.program.days.length} {review.program.days.length === 1 ? "day" : "days"} · {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}
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
        <div className="flex gap-2">
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              unresolvedItems.length > 0 ? setStep("resolve") : setStep("paste")
            }
          >
            ← Back
          </button>
          {savedProgramId ? (
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
