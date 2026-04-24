"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { buildInitialProgramPrompt, buildModificationPrompt } from "@/lib/prompts/builder";
import type { ProgramScope } from "@/lib/programs/types";

export function PromptBuilderClient() {
  const { profile, programs } = useLocalData();
  const [scope, setScope] = useState<ProgramScope>("base");
  const program = programs[0];

  const prompt = useMemo(() => {
    if (!profile) return "";
    if (!program) return buildInitialProgramPrompt(profile);
    const current = scope === "day" ? program.days[0] : scope === "week" ? program.days : program;
    return buildModificationPrompt(program, scope, current);
  }, [profile, program, scope]);

  return (
    <div className="stack">
      <h1 className="text-2xl font-bold">Prompts</h1>
      <div className="grid grid-cols-3 gap-2">
        {(["base", "week", "day"] as const).map((item) => (
          <button key={item} className={`button ${scope === item ? "" : "secondary"}`} onClick={() => setScope(item)}>
            {item}
          </button>
        ))}
      </div>
      <textarea className="input min-h-96 font-mono text-sm" readOnly value={prompt} />
      <button className="button" onClick={() => navigator.clipboard.writeText(prompt)}>
        <Copy size={18} /> Copy
      </button>
    </div>
  );
}
