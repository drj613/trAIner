"use client";

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy } from "lucide-react";
import { useLocalData } from "@/components/app/LocalDataProvider";
import {
  buildProfileBlock,
  buildRoutineBlock,
  buildConstraintsBlock,
  buildSchemaBlock,
  assemblePrompt,
} from "@/lib/prompts/builder";
import { DEFAULT_PERSONAS, type CoachPersona } from "@/lib/prompts/personas";

type BlockKey = "profile" | "routine" | "constraints" | "schema";

export function PromptBuilderClient() {
  const { profile, programs, loading } = useLocalData();
  const program = programs[0];

  const [selectedIds, setSelectedIds] = useState<string[]>(["rp"]);
  const [editedBlocks, setEditedBlocks] = useState<Record<string, string>>({});
  const [blocks, setBlocks] = useState<Record<BlockKey, boolean>>({
    profile: true,
    routine: true,
    constraints: true,
    schema: true,
  });

  function togglePersona(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleBlock(key: BlockKey) {
    setBlocks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const selectedPersonas = useMemo(
    () => DEFAULT_PERSONAS.filter((p) => selectedIds.includes(p.id)),
    [selectedIds]
  );

  const prompt = useMemo(() => {
    const personaBlocks = selectedPersonas.map((p) => {
      const text = editedBlocks[p.id] ?? p.block;
      return `## Coach: ${p.name}\n${text}`;
    });

    const sectionBlocks: string[] = [];
    if (blocks.profile && profile) sectionBlocks.push(buildProfileBlock(profile));
    if (blocks.routine) sectionBlocks.push(buildRoutineBlock(program));
    if (blocks.constraints && profile) sectionBlocks.push(buildConstraintsBlock(profile));
    if (blocks.schema) sectionBlocks.push(buildSchemaBlock());

    return assemblePrompt([...personaBlocks, ...sectionBlocks]);
  }, [selectedPersonas, editedBlocks, blocks, profile, program]);

  return (
    <div className="stack">
      {!profile && !loading && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            background: "color-mix(in srgb, var(--warn, #e6b664) 12%, var(--bg-2))",
            border: "1px solid var(--warn, #e6b664)",
            borderRadius: "var(--r, 6px)",
            fontSize: 13,
            color: "var(--fg)",
            lineHeight: 1.5,
          }}
        >
          No profile found. The prompt below won&apos;t include your goals, equipment, or constraints —
          fill out your{" "}
          <Link to="/profile" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Profile
          </Link>{" "}
          first for a useful result.
        </div>
      )}
      <section>
        <p className="tx-up mb-2">Coach personas · select &amp; combine</p>
        <div className="grid grid-cols-2 gap-2">
          {DEFAULT_PERSONAS.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              selected={selectedIds.includes(p.id)}
              onToggle={() => togglePersona(p.id)}
            />
          ))}
        </div>
      </section>

      {selectedPersonas.length > 0 && (
        <section>
          <p className="tx-up mb-2">Selected persona blocks · ephemeral edits</p>
          <div className="stack">
            {selectedPersonas.map((p) => (
              <div key={p.id} className="panel">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="tx-mono text-xs muted">ephemeral</span>
                </div>
                <textarea
                  aria-label={p.name}
                  className="input tx-mono text-xs min-h-20 resize-y"
                  value={editedBlocks[p.id] ?? p.block}
                  onChange={(e) =>
                    setEditedBlocks((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="tx-up mb-2">Prompt blocks</p>
        <div className="stack">
          {(
            [
              ["profile", "Profile block"],
              ["routine", "Routine structure block"],
              ["constraints", "Constraints block"],
              ["schema", "Output schema block"],
            ] as [BlockKey, string][]
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-3 panel cursor-pointer"
            >
              <input
                type="checkbox"
                checked={blocks[key]}
                onChange={() => toggleBlock(key)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm flex-1">{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <p className="tx-up mb-2">Generated prompt</p>
        <div
          className="panel font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto muted"
          style={{ minHeight: "3rem" }}
        >
          {prompt || "(select at least one persona)"}
        </div>
        <button
          className="button mt-2 w-full justify-center"
          disabled={!prompt}
          onClick={() => void navigator.clipboard.writeText(prompt).catch(() => {})}
        >
          <Copy size={14} /> Copy prompt · {prompt.length.toLocaleString()} chars
        </button>
      </section>
    </div>
  );
}

function PersonaCard({
  persona,
  selected,
  onToggle,
}: {
  persona: CoachPersona;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className="text-left p-2 rounded border transition-colors"
      style={{
        background: selected ? "var(--accent-soft)" : "var(--bg-2)",
        borderColor: selected ? "var(--accent)" : "var(--line)",
        color: "var(--fg)",
      }}
    >
      <div
        className="text-xs font-semibold mb-1 leading-tight"
        style={{ color: selected ? "var(--accent)" : "var(--fg)" }}
      >
        {persona.name}
      </div>
      <div className="tx-mono text-[10px] muted leading-snug mb-1">
        {persona.style}
      </div>
      <div className="text-[10px] muted leading-snug mb-2">
        {persona.description}
      </div>
      <div className="flex flex-wrap gap-1">
        {persona.tags.map((tag) => (
          <span
            key={tag}
            className="tx-mono text-[9px] px-1 rounded"
            style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}
