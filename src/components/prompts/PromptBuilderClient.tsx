"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PersonaInstructions } from "./PersonaInstructions";
import { PromptDetails } from "./PromptDetails";
import { Link } from "react-router-dom";
import { ArrowRight, Copy } from "lucide-react";
import { markPromptCopied } from "@/lib/workspace/onboarding";
import { useLocalData } from "@/components/app/LocalDataProvider";
import {
  buildProfileFieldsBlock,
  buildConstraintsFieldsBlock,
  PROFILE_FIELDS,
  missingImportantFields,
} from "@/lib/prompts/profileFields";
import { buildRequiredContract, buildCoachingBlock, buildPersonaSynthesis, buildPersonaGuidance, assemblePrompt } from "@/lib/prompts/builder";
import { DEFAULT_PERSONAS, type CoachPersona } from "@/lib/prompts/personas";
import { promptPresetRepo } from "@/lib/storage/promptPresetRepo";
import type { PromptPresetDocument } from "@/lib/programs/types";

export function PromptBuilderClient() {
  const { profile, loading } = useLocalData();

  const [selectedIds, setSelectedIds] = useState<string[]>(["rp"]);
  const [editedBlocks, setEditedBlocks] = useState<Record<string, string>>({});
  const [fieldOn, setFieldOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, true])),
  );
  const [coachingOn, setCoachingOn] = useState(false);
  const [adhocInjuries, setAdhocInjuries] = useState<string[]>([]);
  const [adhocInput, setAdhocInput] = useState("");
  const [presets, setPresets] = useState<PromptPresetDocument[]>([]);
  const [presetName, setPresetName] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  // savePreset and deletePreset each await the repo and then refresh, so two
  // refreshes can overlap. Stamp each one and drop any response that a later
  // refresh has already superseded, otherwise a slow earlier list() can resolve
  // last and restore rows that were just deleted.
  const refreshGeneration = useRef(0);
  const refreshPresets = async () => {
    const generation = ++refreshGeneration.current;
    const all = await promptPresetRepo.list();
    if (generation !== refreshGeneration.current) return;
    setPresets([...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  };
  useEffect(() => {
    void refreshPresets();
  }, []);

  async function savePreset() {
    const name = presetName.trim();
    if (!name) return;
    const edited: Record<string, string> = {};
    for (const [id, text] of Object.entries(editedBlocks)) {
      const def = DEFAULT_PERSONAS.find((p) => p.id === id);
      if (def && text !== def.block) edited[id] = text;
    }
    await promptPresetRepo.save({
      id: crypto.randomUUID(),
      name,
      personaIds: [...selectedIds],
      editedBlocks: edited,
      fieldOn: { ...fieldOn },
      schemaOn: true,
      coachingOn,
      createdAt: "",
      updatedAt: "",
    });
    setPresetName("");
    await refreshPresets();
  }

  function loadPreset(preset: PromptPresetDocument) {
    setSelectedIds(
      preset.personaIds.filter((id) => DEFAULT_PERSONAS.some((p) => p.id === id)),
    );
    setEditedBlocks(
      Object.fromEntries(
        Object.entries(preset.editedBlocks).filter(([id]) =>
          DEFAULT_PERSONAS.some((p) => p.id === id),
        ),
      ),
    );
    setFieldOn(
      Object.fromEntries(
        PROFILE_FIELDS.map((f) => [f.key, preset.fieldOn[f.key] ?? true]),
      ),
    );
    setCoachingOn(preset.coachingOn ?? false);
    // adhocInjuries / adhocInput intentionally untouched
  }

  async function deletePreset(id: string) {
    await promptPresetRepo.remove(id);
    await refreshPresets();
  }

  function addAdhocInjury() {
    const v = adhocInput.trim();
    if (!v || adhocInjuries.includes(v)) return;
    setAdhocInjuries((prev) => [...prev, v]);
    setAdhocInput("");
  }

  function togglePersona(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleField(key: string) {
    setFieldOn((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const enabled = useMemo(
    () => new Set(Object.entries(fieldOn).filter(([, v]) => v).map(([k]) => k)),
    [fieldOn],
  );

  const missing = useMemo(
    () =>
      profile
        ? missingImportantFields(profile, enabled, enabled.has("injuries") ? adhocInjuries : [])
        : [],
    [profile, enabled, adhocInjuries],
  );

  const selectedPersonas = useMemo(
    () => DEFAULT_PERSONAS.filter((p) => selectedIds.includes(p.id)),
    [selectedIds]
  );

  const prompt = useMemo(() => {
    const personaBlock = buildPersonaSynthesis(selectedPersonas.map((persona) => ({
      name: persona.name,
      text: editedBlocks[persona.id] ?? persona.block,
    })));

    const sectionBlocks: string[] = [];
    if (profile) {
      sectionBlocks.push(buildProfileFieldsBlock(profile, enabled));
      sectionBlocks.push(
        buildConstraintsFieldsBlock(
          profile,
          enabled,
          enabled.has("injuries") ? adhocInjuries : [],
        ),
      );
    }
    sectionBlocks.push(buildRequiredContract());
    if (coachingOn) sectionBlocks.push(buildCoachingBlock());

    return assemblePrompt([personaBlock, ...sectionBlocks]);
  }, [selectedPersonas, editedBlocks, enabled, coachingOn, profile, adhocInjuries]);

  useEffect(() => { setCopyStatus(""); }, [prompt]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      markPromptCopied();
      setCopyStatus("Copied the complete prompt.");
    } catch {
      setCopyStatus("Could not copy the prompt. Please try again.");
    }
  }

  return (
    <div className="stack min-w-0" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header>
        <h1 className="text-lg font-semibold">Prompt editor</h1>
        <p className="text-sm muted mt-1">Review what each section adds, then copy the complete prompt at the bottom.</p>
      </header>
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
        <p className="tx-up mb-2">Presets</p>
        {presets.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center justify-between panel">
                <button
                  type="button"
                  className="text-sm text-left flex-1 min-w-0 break-words"
                  style={{ color: "var(--fg)", overflowWrap: "anywhere" }}
                  onClick={() => loadPreset(preset)}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${preset.name}`}
                  onClick={() => void deletePreset(preset.id)}
                  style={{ color: "var(--fg-3)", lineHeight: 1, padding: "0 2px" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1 mt-2">
          <input
            className="input flex-1 min-w-0"
            style={{ fontSize: 12, padding: "3px 7px" }}
            value={presetName}
            placeholder="Name this preset…"
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void savePreset()}
          />
          <button
            type="button"
            className="button"
            style={{ fontSize: 11, padding: "2px 8px" }}
            disabled={!presetName.trim()}
            onClick={() => void savePreset()}
          >
            Save
          </button>
        </div>
      </section>

      <section>
        <p className="tx-up mb-2">Coach personas · select &amp; combine</p>
        <details className="panel min-w-0">
          <summary className="text-sm cursor-pointer"><span>Choose coaches</span><span className="muted"> · {selectedPersonas.length} selected</span></summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0 mt-3">
          {DEFAULT_PERSONAS.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              selected={selectedIds.includes(p.id)}
              onToggle={() => togglePersona(p.id)}
            />
          ))}
        </div>
        </details>
      </section>

      {selectedPersonas.length > 0 && (
        <section>
          <p className="tx-up mb-2">Selected coach instructions</p>
          <p className="text-sm muted mb-2">Open a coach to review its philosophy, methodology, and principles. Save a preset to keep your edits.</p>
          <div className="stack">
            {selectedPersonas.map((p) => (
              <details key={p.id} open className="panel min-w-0">
                <summary className="text-sm font-semibold cursor-pointer">Coach: {p.name}</summary>
                <PersonaInstructions name={p.name} text={editedBlocks[p.id] ?? p.block} onChange={(text) => setEditedBlocks((prev) => ({ ...prev, [p.id]: text }))} />
              </details>
            ))}
            <details className="panel min-w-0">
              <summary className="text-sm cursor-pointer">How the selected coaches work together</summary>
              <PromptDetails text={buildPersonaGuidance(selectedPersonas)} paragraphLabels={selectedPersonas.length > 1 ? ["Combining approaches", "Athlete priorities"] : ["Athlete priorities"]} />
            </details>
          </div>
        </section>
      )}

      {missing.length > 0 && (
        <div
          role="note"
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
          Not yet in your prompt: {missing.map((f) => f.label).join(", ")}.{" "}
          <Link to="/profile" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Add in Profile →
          </Link>
        </div>
      )}
      <section>
        <p className="tx-up mb-2">Profile fields</p>
        <div className="stack">
          {PROFILE_FIELDS.filter((f) => f.group === "profile").map((f) => (
            <section key={f.key} aria-label={`${f.label} prompt section`} className="panel min-w-0">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={fieldOn[f.key]}
                onChange={() => toggleField(f.key)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm flex-1">{f.label}</span>
            </label>
            {fieldOn[f.key] ? <PromptDetails text={profile ? f.render(profile) ?? "No saved value. Add it in your Profile to include it here." : "No saved profile."} /> : <p className="text-xs muted mt-2">Excluded from the copied prompt</p>}
            </section>
          ))}
        </div>

        <p className="tx-up mb-2 mt-3">Constraints</p>
        <div className="stack">
          {PROFILE_FIELDS.filter((f) => f.group === "constraints").map((f) => (
            <section key={f.key} aria-label={`${f.label} prompt section`} className="panel min-w-0">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={fieldOn[f.key]}
                onChange={() => toggleField(f.key)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm flex-1">{f.label}</span>
            </label>
            {fieldOn[f.key] ? <PromptDetails paragraphLabels={profile ? ["Injury precautions"] : undefined} text={profile ? buildConstraintsFieldsBlock(profile, new Set([f.key]), adhocInjuries) || "No saved injuries or constraints." : "No saved profile."} /> : <p className="text-xs muted mt-2">Excluded from the copied prompt</p>}
            </section>
          ))}
        </div>

        <div className="panel stack" style={{ gap: 6 }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">Temporary injuries (this prompt only)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {adhocInjuries.map((item) => (
              <span
                key={item}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: "var(--bg-3)", border: "1px solid var(--line)", color: "var(--fg-2)", minWidth: 0, overflowWrap: "anywhere" }}
              >
                <span className="min-w-0">{item}</span>
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => setAdhocInjuries((prev) => prev.filter((i) => i !== item))}
                  style={{ color: "var(--fg-3)", lineHeight: 1, padding: "0 1px", flexShrink: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              className="input flex-1 min-w-0"
              style={{ fontSize: 12, padding: "3px 7px" }}
              value={adhocInput}
              placeholder="Add a temporary injury…"
              onChange={(e) => setAdhocInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAdhocInjury()}
            />
            <button type="button" className="button" style={{ fontSize: 11, padding: "2px 8px" }} onClick={addAdhocInjury}>
              Add
            </button>
          </div>
        </div>

        <p className="tx-up mb-2 mt-3">Coaching preferences</p>
        <section aria-label="Coaching instructions" className="panel min-w-0">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={coachingOn}
            onChange={() => setCoachingOn((v) => !v)}
            className="accent-[var(--accent)]"
          />
          <span className="text-sm flex-1">Optional coaching</span>
        </label>
        <p className="text-xs muted mt-2">Adds advice on exercise selection, volume, progression, recovery, and reviewing the routine.</p>
        {coachingOn ? <details className="mt-2"><summary className="text-sm cursor-pointer">Read the coaching instructions</summary><PromptDetails text={buildCoachingBlock()} paragraphLabels={["Coaching approach", "Exercise selection", "Volume and frequency", "Progression", "Deloads and recovery", "Routine review", "Final response"]} /></details> : <p className="text-xs muted mt-2">Excluded from the copied prompt</p>}
        </section>
      </section>

      <section aria-label="Output requirements" className="panel min-w-0">
        <h2 className="text-sm font-semibold">Routine JSON contract</h2>
        <p className="text-xs muted mt-2">Always included. Defines the import format, repeating weeks, exercise groups, and set counts. New routines are limited to eight generated weeks.</p>
        <details className="mt-2"><summary className="text-sm cursor-pointer">Read the output requirements</summary><PromptDetails text={buildRequiredContract()} paragraphLabels={["Response format", "Weeks and weekly changes", "Groups and set counts", "Exercise fields and volume", "Variants and progression", "Using the example"]} /></details>
      </section>

      <section aria-label="Copy complete prompt">
        <p className="text-sm muted">Copy all included sections together, ready to paste into your chat.</p>
        <button
          type="button"
          className="button mt-2 w-full justify-center"
          disabled={!prompt}
          onClick={() => void copyPrompt()}
        >
          <Copy size={14} /> Copy prompt · {prompt.length.toLocaleString()} chars
        </button>
        {copyStatus && <p role="status" className="text-xs mt-2">{copyStatus}</p>}
        <Link to="/import" className="button mt-2 w-full justify-center">
          <ArrowRight size={14} /> Go to Import
        </Link>
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
