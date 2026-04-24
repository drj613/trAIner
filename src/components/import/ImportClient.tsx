"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { parseProgramJson } from "@/lib/import/parser";
import type { ImportReview } from "@/lib/import/parser";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { programRepo } from "@/lib/storage/programRepo";

export function ImportClient() {
  const [json, setJson] = useState("");
  const [review, setReview] = useState<ImportReview | undefined>();
  const [message, setMessage] = useState("");

  const warningCount = review?.warnings.length ?? 0;
  const exerciseCount = useMemo(
    () =>
      review?.program.days.reduce(
        (total, day) => total + day.sections.reduce((sectionTotal, section) => sectionTotal + section.groups.reduce((groupTotal, group) => groupTotal + group.exercises.length, 0), 0),
        0
      ) ?? 0,
    [review]
  );

  async function reviewJson() {
    const aliases = await aliasRepo.list();
    setReview(parseProgramJson(json, undefined, aliases));
    setMessage("");
  }

  async function saveProgram() {
    if (!review) return;
    await programRepo.save(review.program);
    setMessage("Program saved locally.");
  }

  return (
    <div className="stack">
      <div>
        <h1 className="text-2xl font-bold">Import</h1>
        <p className="muted">Paste JSON from a trainer or external LLM.</p>
      </div>
      <textarea className="input min-h-72 font-mono text-sm" value={json} onChange={(event) => setJson(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button className="button secondary" onClick={reviewJson}>
          Review
        </button>
        <button className="button" disabled={!review} onClick={saveProgram}>
          <Save size={18} /> Save
        </button>
      </div>
      {review ? (
        <section className="panel stack">
          <h2 className="font-bold">{review.program.title}</h2>
          <p className="muted">
            {review.program.days.length} day(s), {exerciseCount} exercise(s), {warningCount} warning(s)
          </p>
          {review.warnings.map((warning) => (
            <div key={`${warning.path}-${warning.message}`} className="border-t border-[var(--line)] pt-2">
              <p className="text-sm font-bold">{warning.message}</p>
              {warning.suggestions?.length ? <p className="text-sm muted">Suggestions: {warning.suggestions.map((suggestion) => suggestion.name).join(", ")}</p> : null}
            </div>
          ))}
        </section>
      ) : null}
      {message ? <p className="font-bold text-[var(--accent-strong)]">{message}</p> : null}
    </div>
  );
}
