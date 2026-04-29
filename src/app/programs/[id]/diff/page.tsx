"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { programRepo } from "@/lib/storage/programRepo";
import { DiffReview } from "@/components/workout/DiffReview";
import { diffDays } from "@/lib/workout/programDiff";
import { loadPendingDiff, clearPendingDiff } from "@/lib/workout/pendingDiff";
import type { ProgramDay } from "@/lib/programs/types";

export default function DiffPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<{ original: ProgramDay; replacement: ProgramDay } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const data = loadPendingDiff();
    if (!data) { router.replace(`/programs/${params.id}`); return; }
    if (data.programId !== params.id) { router.replace(`/programs/${params.id}`); return; }
    setState({ original: data.original, replacement: data.replacement });
  }, [params.id, router]);

  if (!state) return <p style={{ color: "var(--fg-3)", padding: 16, fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading diff…</p>;

  const diffs = diffDays(state.original, state.replacement);

  async function handleAccept() {
    setSaveError(null);
    try {
      const program = await programRepo.get(params.id);
      if (!program) {
        setSaveError("Program not found — changes could not be saved.");
        return;
      }
      await programRepo.save({
        ...program,
        overrides: [
          ...program.overrides,
          {
            id: crypto.randomUUID(),
            scope: "day" as const,
            programId: program.id,
            dayId: state!.original.id,
            replacement: state!.replacement,
            reason: "Modified with AI",
            createdAt: new Date().toISOString(),
          },
        ],
      });
      clearPendingDiff();
      router.replace(`/today`);
    } catch (e) {
      console.error("[diff] failed to save override", e);
      setSaveError("Failed to save changes. Please try again.");
    }
  }

  function handleDiscard() {
    clearPendingDiff();
    router.back();
  }

  return (
    <div style={{ height: "calc(100dvh - 78px)", display: "flex", flexDirection: "column" }}>
      {saveError && (
        <p style={{ color: "var(--bad)", fontSize: 12, fontFamily: "var(--font-mono)", padding: "0 16px" }}>
          {saveError}
        </p>
      )}
      <DiffReview diffs={diffs} replacement={state.replacement} onAccept={handleAccept} onDiscard={handleDiscard} />
    </div>
  );
}
