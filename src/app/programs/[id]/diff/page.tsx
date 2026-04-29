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

  useEffect(() => {
    const data = loadPendingDiff();
    if (!data) { router.replace(`/programs/${params.id}`); return; }
    if (data.programId !== params.id) { router.replace(`/programs/${params.id}`); return; }
    setState({ original: data.original, replacement: data.replacement });
  }, [params.id, router]);

  if (!state) return <p style={{ color: "var(--fg-3)", padding: 16, fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading diff…</p>;

  const diffs = diffDays(state.original, state.replacement);

  async function handleAccept() {
    const program = await programRepo.get(params.id);
    if (!program) return;
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
  }

  function handleDiscard() {
    clearPendingDiff();
    router.back();
  }

  return (
    <div style={{ height: "calc(100vh - 46px)", display: "flex", flexDirection: "column" }}>
      <DiffReview diffs={diffs} replacement={state.replacement} onAccept={handleAccept} onDiscard={handleDiscard} />
    </div>
  );
}
