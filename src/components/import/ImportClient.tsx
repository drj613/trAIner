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
  const [saveError, setSaveError] = useState<string | null>(null);
  // keyed by path → canonicalId
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  // rawNames of no-suggestion exercises the user chose to skip
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const unresolvedItems = useMemo<ResolutionItem[]>(
    () => (review ? extractUnresolvedExercises(review.warnings) : []),
    [review],
  );

  const itemsWithSuggestions = useMemo(
    () => unresolvedItems.filter((i) => i.suggestions.length > 0),
    [unresolvedItems],
  );

  const itemsWithoutSuggestions = useMemo(
    () => unresolvedItems.filter((i) => i.suggestions.length === 0),
    [unresolvedItems],
  );

  const allNoSuggestionHandled = useMemo(
    () => itemsWithoutSuggestions.every((i) => skipped.has(i.rawName)),
    [itemsWithoutSuggestions, skipped],
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
      const aliases = await aliasRepo.list();
      const result = parseProgramJson(json, undefined, aliases);
      setReview(result);
      setResolutions({});
      setSkipped(new Set());
      if (extractUnresolvedExercises(result.warnings).length > 0) {
        setStep("resolve");
      } else {
        setStep("confirm");
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse error");
    }
  }

  function handleResolutionChange(path: string, canonicalId: string) {
    setResolutions((prev) => ({ ...prev, [path]: canonicalId }));
  }

  function handleSkip(rawName: string) {
    setSkipped((prev) => new Set([...prev, rawName]));
  }

  function handleUnskip(rawName: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      next.delete(rawName);
      return next;
    });
  }

  async function handleSave() {
    if (!review) return;
    setSaveError(null);

    try {
      // Build path-keyed resolutions for applyResolutions
      const resolutionList = unresolvedItems
        .filter((item) => resolutions[item.path])
        .map((item) => ({
          path: item.path,
          canonicalId: resolutions[item.path],
        }));

      const resolvedProgram =
        resolutionList.length > 0
          ? applyResolutions(review.program, resolutionList)
          : review.program;

      // Save aliases for resolved exercises (not skipped ones)
      await Promise.all(
        unresolvedItems
          .filter((item) => resolutions[item.path])
          .map((item) =>
            aliasRepo.save({
              alias: item.rawName,
              canonicalExerciseId: resolutions[item.path],
            }),
          ),
      );

      await programRepo.save(resolvedProgram);
      setSavedMessage(`"${resolvedProgram.title}" saved.`);
      setStep("paste");
      setJson("");
      setReview(undefined);
      setResolutions({});
      setSkipped(new Set());
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save program.",
      );
    }
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

        {itemsWithoutSuggestions.length > 0 && (
          <div className="stack">
            <p className="tx-up text-xs">No matches found</p>
            {itemsWithoutSuggestions.map((item) => (
              <div key={item.path} className="panel flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs muted tx-mono">imported</p>
                  <p className="text-sm font-semibold">{item.rawName}</p>
                  <p className="text-xs muted">No catalog matches found.</p>
                </div>
                {skipped.has(item.rawName) ? (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ fontSize: "0.75rem" }}
                    onClick={() => handleUnskip(item.rawName)}
                  >
                    Undo skip
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ fontSize: "0.75rem" }}
                    onClick={() => handleSkip(item.rawName)}
                  >
                    Skip
                  </button>
                )}
              </div>
            ))}
            {!allNoSuggestionHandled && (
              <p className="text-xs" style={{ color: "var(--warn, #e6b664)" }}>
                Skip all unmatched exercises to continue.
              </p>
            )}
          </div>
        )}

        <ResolutionStep
          items={itemsWithSuggestions}
          resolutions={resolutions}
          onChange={handleResolutionChange}
          onBack={() => setStep("paste")}
          onNext={() => setStep("confirm")}
          disabledExtra={!allNoSuggestionHandled}
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
          {skipped.size > 0 && (
            <p className="text-sm muted">
              {skipped.size} exercise(s) skipped (no catalog match)
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
          <button type="button" className="button flex-1" onClick={() => void handleSave()}>
            <Save size={14} /> Save program
          </button>
        </div>
      </div>
    );
  }

  return null;
}
