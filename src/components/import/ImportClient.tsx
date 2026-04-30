"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { parseProgramJson, type ImportReview } from "@/lib/import/parser";
import {
  extractUnresolvedExercises,
  applyResolutions,
  type ResolutionItem,
} from "@/lib/import/resolution";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { ResolutionStep } from "./ResolutionStep";

type Step = "paste" | "resolve" | "confirm";

export function ImportClient() {
  const [step, setStep] = useState<Step>("paste");
  const [json, setJson] = useState("");
  const [review, setReview] = useState<ImportReview | undefined>();
  const [parseError, setParseError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

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

  function handleValidate() {
    setParseError(null);
    try {
      const result = parseProgramJson(json);
      setReview(result);
      setResolutions({});
      if (extractUnresolvedExercises(result.warnings).length > 0) {
        setStep("resolve");
      } else {
        setStep("confirm");
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse error");
    }
  }

  function handleResolutionChange(rawName: string, canonicalId: string) {
    setResolutions((prev) => ({ ...prev, [rawName]: canonicalId }));
  }

  async function handleSave() {
    if (!review) return;

    const resolvedProgram =
      Object.keys(resolutions).length > 0
        ? applyResolutions(
            review.program,
            Object.entries(resolutions).map(([rawName, canonicalId]) => ({
              rawName,
              canonicalId,
            })),
          )
        : review.program;

    await Promise.all(
      Object.entries(resolutions).map(([rawName, canonicalId]) =>
        aliasRepo.save({
          alias: rawName,
          canonicalExerciseId: canonicalId,
        }),
      ),
    );

    await programRepo.save(resolvedProgram);
    setSavedMessage(`"${resolvedProgram.title}" saved.`);
    setStep("paste");
    setJson("");
    setReview(undefined);
    setResolutions({});
  }

  if (step === "paste") {
    return (
      <div className="stack">
        <div>
          <h1 className="text-2xl font-bold">Import</h1>
          <p className="muted">Paste JSON from an AI coach or external source.</p>
        </div>
        {savedMessage && (
          <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>
            {savedMessage}
          </p>
        )}
        <textarea
          className="input min-h-72 font-mono text-xs"
          value={json}
          placeholder='{ "program_name": "...", "days": [...] }'
          onChange={(e) => setJson(e.target.value)}
        />
        {parseError && (
          <p className="text-sm" style={{ color: "var(--bad, red)" }}>
            {parseError}
          </p>
        )}
        <button
          type="button"
          className="button"
          disabled={!json.trim()}
          onClick={handleValidate}
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
          onChange={handleResolutionChange}
          onBack={() => setStep("paste")}
          onNext={() => setStep("confirm")}
        />
      </div>
    );
  }

  if (step === "confirm" && review) {
    const remainingWarnings = review.warnings.filter(
      (w) => !w.suggestions || w.suggestions.length === 0,
    );
    return (
      <div className="stack">
        <h1 className="text-2xl font-bold">Confirm import</h1>
        <section className="panel stack">
          <h2 className="font-bold">{review.program.title}</h2>
          <p className="muted text-sm">
            {review.program.days.length} day(s) · {exerciseCount} exercise(s)
          </p>
          {Object.keys(resolutions).length > 0 && (
            <p className="text-sm" style={{ color: "var(--good, green)" }}>
              {Object.keys(resolutions).length} exercise(s) resolved
            </p>
          )}
          {remainingWarnings.length > 0 && (
            <div>
              <p className="tx-up text-xs mb-1">Warnings</p>
              {remainingWarnings.map((w) => (
                <p key={w.path} className="muted text-xs">
                  {w.message}
                </p>
              ))}
            </div>
          )}
        </section>
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
          <button type="button" className="button flex-1" onClick={handleSave}>
            <Save size={14} /> Save program
          </button>
        </div>
      </div>
    );
  }

  return null;
}
