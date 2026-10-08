import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { DiffReview } from "@/components/workout/DiffReview";
import { diffDays } from "@/lib/workout/programDiff";
import { loadPendingDiff, clearPendingDiff, resolvePendingDiffScope } from "@/lib/workout/pendingDiff";
import type { EditScope, ProgramEdit } from "@/lib/programs/edits";
import { previewProgramEdit } from "@/lib/programs/edits";
import type { ProgramDocument } from "@/lib/programs/types";
import { programRepo } from "@/lib/storage/programRepo";
import { logRepo } from "@/lib/storage/logRepo";

type ReviewState = {
  pending: NonNullable<ReturnType<typeof loadPendingDiff>>;
  program: ProgramDocument;
  logs: Awaited<ReturnType<typeof logRepo.listForProgram>>;
};

export function DiffPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { commitProgramEdit } = useLocalData();
  const [state, setState] = useState<ReviewState | null>(null);
  const [scope, setScope] = useState<EditScope | null>("occurrence");
  const [includeExceptionDayIds, setIncludeExceptionDayIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const pending = loadPendingDiff();
    if (!pending || pending.programId !== id) {
      navigate(`/programs/${id}`, { replace: true });
      return;
    }
    setScope(resolvePendingDiffScope(pending));
    void Promise.all([programRepo.get(pending.programId), logRepo.listForProgram(pending.programId)]).then(([program, logs]) => {
      if (!active) return;
      if (!program) {
        navigate(`/programs/${id}`, { replace: true });
        return;
      }
      setState({ pending, program, logs });
    }).catch(() => {
      if (active) setSaveError("Could not load the routine for review. Please try again.");
    });
    return () => { active = false; };
  }, [id, navigate]);

  const edit: ProgramEdit | undefined = useMemo(() => state
    ? state.pending.edit ?? {
        kind: "day-content",
        dayId: state.pending.dayId ?? state.pending.original.id,
        replacement: state.pending.replacement,
      }
    : undefined, [state]);
  const previewResult = useMemo(() => {
    if (!state || !edit || !scope) return { preview: null, error: null };
    try {
      return {
        preview: previewProgramEdit(state.program, edit, {
          scope,
          logs: state.logs,
          includeExceptionDayIds,
        }),
        error: null,
      };
    } catch (error) {
      return { preview: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [state, edit, scope, includeExceptionDayIds]);

  if (!state) return <p style={{ color: "var(--fg-3)", padding: 16, fontFamily: "var(--font-mono)", fontSize: 12 }}>{saveError ?? "Loading diff…"}</p>;

  const diffs = diffDays(state.pending.original, state.pending.replacement);

  async function refreshReviewAfterStale() {
    const [program, logs] = await Promise.all([
      programRepo.get(state!.pending.programId),
      logRepo.listForProgram(state!.pending.programId),
    ]);
    if (program) setState({ ...state!, program, logs });
  }

  async function handleAccept() {
    setSaveError(null);
    if (!previewResult.preview) {
      setSaveError(previewResult.error ?? "Choose where to apply this edit before saving.");
      return;
    }
    if (!commitProgramEdit) {
      setSaveError("Routine editing is unavailable. Please try again after reloading.");
      return;
    }
    try {
      const result = await commitProgramEdit(previewResult.preview);
      if (result.status === "stale") {
        await refreshReviewAfterStale();
        setSaveError("The routine or workout history changed during review. The preview has been refreshed; review it before applying.");
        return;
      }
      clearPendingDiff();
      navigate("/today", { replace: true });
    } catch (error) {
      console.error("[diff] failed to save reviewed edit", error);
      setSaveError("Failed to save changes. Please try again.");
    }
  }

  function handleDiscard() {
    clearPendingDiff();
    navigate(-1);
  }

  return (
    <div style={{ height: "calc(100dvh - 78px)", display: "flex", flexDirection: "column" }}>
      {saveError && <p role="alert" style={{ color: "var(--bad)", fontSize: 12, fontFamily: "var(--font-mono)", padding: "0 16px" }}>{saveError}</p>}
      {previewResult.error && <p role="alert" style={{ color: "var(--bad)", fontSize: 12, padding: "0 16px" }}>{previewResult.error}</p>}
      <DiffReview
        diffs={diffs}
        replacement={state.pending.replacement}
        onAccept={handleAccept}
        onDiscard={handleDiscard}
        editPreview={previewResult.preview ?? undefined}
        warnings={state.pending.warnings}
        scope={scope}
        scopeTitle={state.pending.original.title}
        dayNumber={state.pending.original.dayNumber}
        onScopeChange={(next) => { setScope(next); setSaveError(null); }}
        includeExceptionDayIds={includeExceptionDayIds}
        onIncludeExceptionDayIdsChange={setIncludeExceptionDayIds}
        canApply={!!scope && !!previewResult.preview}
      />
    </div>
  );
}
