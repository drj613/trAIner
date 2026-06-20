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
  CUSTOM_ID,
  type ResolutionItem,
} from "@/lib/import/resolution";
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
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [userExercises, setUserExercises] = useState<UserExerciseDocument[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const unresolvedItems = useMemo<ResolutionItem[]>(
    () => (review ? extractUnresolvedExercises(review.warnings) : []),
    [review],
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

  function handleResolutionChange(path: string, canonicalId: string) {
    setResolutions((prev) => {
      if (!canonicalId) {
        const next = { ...prev };
        delete next[path];
        return next;
      }
      return { ...prev, [path]: canonicalId };
    });
  }

  async function handleAddToUserCatalog(path: string, name: string) {
    const ex = await userExerciseRepo.save(name);
    setUserExercises((prev) => [...prev, ex]);
    setResolutions((prev) => ({ ...prev, [path]: ex.id }));
  }

  async function handleSave() {
    if (!review || isSaving) return;
    setSaveError(null);
    setIsSaving(true);

    try {
      const catalogResolutions = unresolvedItems
        .filter((item) => resolutions[item.path] && resolutions[item.path] !== CUSTOM_ID)
        .map((item) => ({ path: item.path, canonicalId: resolutions[item.path] }));

      const resolvedProgram =
        catalogResolutions.length > 0
          ? applyResolutions(review.program, catalogResolutions)
          : review.program;

      await Promise.all(
        unresolvedItems
          .filter((item) => resolutions[item.path] && resolutions[item.path] !== CUSTOM_ID)
          .map((item) =>
            aliasRepo.save({
              alias: item.rawName,
              canonicalExerciseId: resolutions[item.path],
            }),
          ),
      );

      await saveProgram(resolvedProgram);
      navigate(`/programs/${resolvedProgram.id}`);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save program.",
      );
    } finally {
      setIsSaving(false);
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
          resolutions={resolutions}
          userExercises={userExercises}
          onChange={handleResolutionChange}
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
          <button
            type="button"
            className="button flex-1"
            disabled={isSaving}
            onClick={() => void handleSave()}
          >
            <Save size={14} /> {isSaving ? "Saving…" : "Save program"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
