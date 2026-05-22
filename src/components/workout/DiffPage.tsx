import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { programRepo } from "@/lib/storage/programRepo";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { DiffReview } from "@/components/workout/DiffReview";
import { diffDays } from "@/lib/workout/programDiff";
import { loadPendingDiff, clearPendingDiff } from "@/lib/workout/pendingDiff";
import type { ProgramDay } from "@/lib/programs/types";

export function DiffPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { saveProgram } = useLocalData();
  const [state, setState] = useState<{ original: ProgramDay; replacement: ProgramDay } | null>(null);
  const [scope, setScope] = useState<"day" | "week">("day");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const data = loadPendingDiff();
    if (!data) { navigate(`/programs/${id}`, { replace: true }); return; }
    if (data.programId !== id) { navigate(`/programs/${id}`, { replace: true }); return; }
    setState({ original: data.original, replacement: data.replacement });
    setScope(data.scope ?? "day");
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
      const override =
        scope === "week"
          ? {
              id: crypto.randomUUID(),
              scope: "week" as const,
              programId: program.id,
              weekNumber: state!.original.weekNumber,
              replacement: state!.replacement,
              reason: "Modified with AI",
              createdAt: new Date().toISOString(),
            }
          : {
              id: crypto.randomUUID(),
              scope: "day" as const,
              programId: program.id,
              dayId: state!.original.id,
              replacement: state!.replacement,
              reason: "Modified with AI",
              createdAt: new Date().toISOString(),
            };
      const deduped = program.overrides.filter((o) => {
        if (o.scope !== override.scope) return true;
        if (override.scope === "day") return o.dayId !== override.dayId;
        return o.weekNumber !== override.weekNumber;
      });
      await saveProgram({ ...program, overrides: [...deduped, override] });
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

      {/* C3: scope picker */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 16px 8px",
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-1)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            alignSelf: "center",
            marginRight: 4,
          }}
        >
          Apply to
        </span>
        {(["day", "week"] as const).map((s) => {
          const weekDisabled = s === "week" && !state?.original.weekNumber;
          return (
            <label
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: scope === s ? "var(--fg)" : "var(--fg-3)",
                cursor: weekDisabled ? "not-allowed" : "pointer",
                opacity: weekDisabled ? 0.5 : 1,
              }}
            >
              <input
                type="radio"
                name="diff-scope"
                value={s}
                checked={scope === s}
                disabled={weekDisabled}
                onChange={() => setScope(s)}
                style={{ accentColor: "var(--accent)" }}
              />
              {s === "day" ? "This day" : "Entire week"}
              {weekDisabled && (
                <span style={{ fontSize: 10, color: "var(--fg-4)" }}>
                  (not available — day has no week number)
                </span>
              )}
            </label>
          );
        })}
      </div>

      <DiffReview diffs={diffs} replacement={state.replacement} onAccept={handleAccept} onDiscard={handleDiscard} />
    </div>
  );
}
