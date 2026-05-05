import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { programRepo } from "@/lib/storage/programRepo";
import { DiffReview } from "@/components/workout/DiffReview";
import { diffDays } from "@/lib/workout/programDiff";
import { loadPendingDiff, clearPendingDiff } from "@/lib/workout/pendingDiff";
import type { ProgramDay } from "@/lib/programs/types";

export function DiffPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<{ original: ProgramDay; replacement: ProgramDay } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const data = loadPendingDiff();
    if (!data) { navigate(`/programs/${id}`, { replace: true }); return; }
    if (data.programId !== id) { navigate(`/programs/${id}`, { replace: true }); return; }
    setState({ original: data.original, replacement: data.replacement });
  }, [id, navigate]);

  if (!state) return <p style={{ color: "var(--fg-3)", padding: 16, fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading diff…</p>;

  const diffs = diffDays(state.original, state.replacement);

  async function handleAccept() {
    setSaveError(null);
    try {
      const program = await programRepo.get(id!);
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
      navigate("/today", { replace: true });
    } catch (e) {
      console.error("[diff] failed to save override", e);
      setSaveError("Failed to save changes. Please try again.");
    }
  }

  function handleDiscard() {
    clearPendingDiff();
    navigate(-1);
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
