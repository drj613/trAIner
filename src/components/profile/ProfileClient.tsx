"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { logRepo } from "@/lib/storage/logRepo";
import { bodyweightRepo } from "@/lib/storage/bodyweightRepo";
import { buildHeatmapCells } from "@/lib/analytics/trainingHeatmap";
import { TrainingHeatmap } from "./TrainingHeatmap";
import { BodyweightSparkline } from "./BodyweightSparkline";
import type { HeatmapCell } from "@/lib/analytics/trainingHeatmap";
import type { BodyweightEntry, ProfileDocument } from "@/lib/programs/types";
import { TRAINING_GOALS, type TrainingGoal } from "@/lib/programs/types";
import { GOAL_LABELS } from "@/lib/programs/routineMeta";

type EditingSection =
  | "name" | "body" | "history" | "goals"
  | "injuries" | "equipment" | "schedule" | "preferences"
  | null;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function PrimaryGoalSelect({ value, onChange }: {
  value: TrainingGoal | undefined;
  onChange: (goal: TrainingGoal | undefined) => void;
}) {
  return (
    <select
      aria-label="Primary training goal"
      className="input"
      style={{ fontSize: 12, padding: "4px 8px", marginBottom: 8, display: "block" }}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || undefined) as TrainingGoal | undefined)}
    >
      <option value="">No primary goal</option>
      {TRAINING_GOALS.map((g) => (
        <option key={g} value={g}>{GOAL_LABELS[g]}</option>
      ))}
    </select>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (!items.length) return <p className="muted text-xs">None recorded</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            background: "var(--bg-3)",
            border: "1px solid var(--line)",
            color: "var(--fg-2)",
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function EditableChips({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function addItem() {
    const v = input.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setInput("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{
              background: "var(--bg-3)",
              border: "1px solid var(--line)",
              color: "var(--fg-2)",
            }}
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() => onChange(items.filter((i) => i !== item))}
              style={{ color: "var(--fg-3)", lineHeight: 1, padding: "0 1px" }}
            >
              ×
            </button>
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-xs muted">No items yet</span>
        )}
      </div>
      <div className="flex gap-1">
        <input
          className="input flex-1"
          style={{ fontSize: 12, padding: "3px 7px" }}
          value={input}
          placeholder="Add item…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <button
          type="button"
          className="button"
          style={{ fontSize: 11, padding: "2px 8px" }}
          onClick={addItem}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function EditableBody({
  body,
  onChange,
}: {
  body: NonNullable<ProfileDocument["body"]>;
  onChange: (body: NonNullable<ProfileDocument["body"]>) => void;
}) {
  const fields: {
    key: keyof NonNullable<ProfileDocument["body"]>;
    label: string;
  }[] = [
    { key: "age", label: "Age" },
    { key: "height", label: "Height" },
    { key: "weight", label: "Weight" },
    { key: "bodyfat", label: "Body fat" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map(({ key, label }) => (
        <div key={key}>
          <label
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-3)",
              textTransform: "uppercase",
            }}
          >
            {label}
          </label>
          <input
            className="input w-full"
            style={{ fontSize: 12, padding: "3px 7px", marginTop: 2 }}
            value={body[key] ?? ""}
            placeholder={label}
            onChange={(e) =>
              onChange({ ...body, [key]: e.target.value || undefined })
            }
          />
        </div>
      ))}
    </div>
  );
}

function KVGrid({ data }: { data: Record<string, string | undefined> }) {
  const entries = Object.entries(data).filter(([, v]) => v && v !== "—");
  if (!entries.length) return <p className="muted text-xs">None recorded</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="flex justify-between py-0.5 border-b border-dashed"
          style={{
            borderColor: "var(--line)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        >
          <span style={{ color: "var(--fg-3)" }}>{k}</span>
          <span style={{ color: "var(--fg)" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function ProfileCard({
  label,
  editing,
  onEdit,
  onSave,
  onCancel,
  children,
}: {
  label: string;
  editing?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 mb-2">
        <span className="tx-up flex-1">{label}</span>
        {editing ? (
          <div className="flex gap-1">
            <button
              type="button"
              className="button"
              style={{ padding: "2px 8px", fontSize: 11 }}
              onClick={onSave}
            >
              Save
            </button>
            <button
              type="button"
              className="button"
              style={{ padding: "2px 8px", fontSize: 11, opacity: 0.6 }}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="p-1 rounded opacity-40 hover:opacity-100 transition-opacity"
            aria-label={`Edit ${label}`}
            onClick={onEdit}
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function ProfileClient() {
  const { profile, loading, saveProfile } = useLocalData();
  const [heatmapCells, setHeatmapCells] = useState<HeatmapCell[][] | null>(null);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [editingSection, setEditingSection] = useState<EditingSection>(null);
  const [draft, setDraft] = useState<ProfileDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    logRepo.list().then((logs) => {
      const today = new Date().toISOString().slice(0, 10);
      setHeatmapCells(buildHeatmapCells(logs, today));
    });
  }, []);

  useEffect(() => {
    bodyweightRepo.list().then(setBodyweight);
  }, []);

  const isCreating = !loading && !profile;

  useEffect(() => {
    if (isCreating) {
      setDraft({
        id: "local-profile",
        name: "",
        goals: [],
        equipment: [],
        constraints: [],
        injuries: [],
        preferences: [],
        trainingAge: "",
        defaultDaysPerWeek: 4,
        updatedAt: "",
      });
    }
  }, [isCreating]);

  function startEdit(section: EditingSection) {
    setDraft({ ...profile! });
    setEditingSection(section);
  }

  function cancelEdit() {
    setEditingSection(null);
    setDraft(null);
  }

  async function saveEdit() {
    if (!draft) return;
    await saveProfile(draft);
    setEditingSection(null);
    setDraft(null);
  }

  if (loading) return <p className="muted">Loading profile…</p>;

  if (isCreating) {
    if (!draft) return null;

    const saveNewProfile = async () => {
      if (!draft) return;
      setSaving(true);
      setSaveError(null);
      try {
        await saveProfile(draft);
      } catch {
        setSaveError("Failed to save profile. Please try again.");
        setSaving(false);
      }
    };

    return (
      <div className="stack">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Set up your Profile</h2>
          <button
            type="button"
            className="button"
            disabled={saving}
            style={{ padding: "4px 14px", fontSize: 12 }}
            onClick={() => void saveNewProfile()}
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
        {saveError && (
          <p style={{ color: "var(--bad)", fontSize: 12, margin: 0 }}>{saveError}</p>
        )}

        <div className="panel">
          <p className="tx-up mb-2">Name</p>
          <input
            className="input w-full"
            style={{ fontSize: 13, padding: "5px 9px" }}
            placeholder="Your name"
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })}
          />
        </div>

        <div className="panel">
          <p className="tx-up mb-2">Goals</p>
          <PrimaryGoalSelect
            value={draft.primaryGoal}
            onChange={(primaryGoal) => setDraft((d) => d && { ...d, primaryGoal })}
          />
          <EditableChips
            items={draft.goals}
            onChange={(goals) => setDraft((d) => d && { ...d, goals })}
          />
        </div>

        <div className="panel">
          <p className="tx-up mb-2">Equipment access</p>
          <EditableChips
            items={draft.equipment}
            onChange={(equipment) => setDraft((d) => d && { ...d, equipment })}
          />
        </div>

        <div className="panel">
          <p className="tx-up mb-2">Injuries / limitations</p>
          <EditableChips
            items={draft.injuries ?? []}
            onChange={(injuries) => setDraft((d) => d && { ...d, injuries })}
          />
        </div>

        <div className="panel">
          <p className="tx-up mb-2">Training age</p>
          <input
            className="input w-full"
            style={{ fontSize: 12, padding: "3px 7px" }}
            placeholder="e.g. 3 years, intermediate"
            value={draft.trainingAge}
            onChange={(e) => setDraft((d) => d && { ...d, trainingAge: e.target.value })}
          />
        </div>

        <div className="panel">
          <p className="tx-up mb-2">Default days / week</p>
          <input
            type="number"
            min={1}
            max={7}
            className="input w-full"
            style={{ fontSize: 12, padding: "3px 7px" }}
            value={draft.defaultDaysPerWeek}
            onChange={(e) =>
              setDraft((d) => d && { ...d, defaultDaysPerWeek: Number(e.target.value) })
            }
          />
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const body = profile.body ?? {};
  const bodyHasData = Object.values(body).some((v) => v && v !== "—");

  return (
    <div className="stack">
      {/* Avatar header */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-full font-semibold shrink-0"
          style={{
            width: 44,
            height: 44,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: 16,
          }}
        >
          {initials(editingSection === "name" && draft ? draft.name : profile.name)}
        </div>
        <div className="flex-1 min-w-0">
          {editingSection === "name" && draft ? (
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                style={{ fontSize: 14, fontWeight: 600, padding: "3px 7px" }}
                value={draft.name}
                autoFocus
                onChange={(e) =>
                  setDraft((d) => d && { ...d, name: e.target.value })
                }
                onKeyDown={(e) => e.key === "Enter" && void saveEdit()}
              />
              <button
                type="button"
                className="button"
                style={{ padding: "2px 8px", fontSize: 11 }}
                onClick={() => void saveEdit()}
              >
                Save
              </button>
              <button
                type="button"
                className="button"
                style={{ padding: "2px 8px", fontSize: 11, opacity: 0.6 }}
                onClick={cancelEdit}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <p className="font-semibold text-base">{profile.name}</p>
              <p className="text-xs muted" style={{ fontFamily: "var(--font-mono)" }}>
                local · profile.json
              </p>
            </>
          )}
        </div>
        {editingSection !== "name" && (
          <button
            type="button"
            className="p-1 rounded opacity-40 hover:opacity-100 transition-opacity"
            aria-label="Edit name"
            onClick={() => startEdit("name")}
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {heatmapCells && <TrainingHeatmap cells={heatmapCells} />}

      <BodyweightSparkline entries={bodyweight} />

      <ProfileCard
        label="Body"
        editing={editingSection === "body"}
        onEdit={() => startEdit("body")}
        onSave={() => void saveEdit()}
        onCancel={cancelEdit}
      >
        {editingSection === "body" && draft ? (
          <EditableBody
            body={draft.body ?? {}}
            onChange={(b) => setDraft((d) => d && { ...d, body: b })}
          />
        ) : bodyHasData ? (
          <KVGrid data={body} />
        ) : (
          <p className="muted text-xs">None recorded</p>
        )}
      </ProfileCard>

      <ProfileCard
        label="Training history"
        editing={editingSection === "history"}
        onEdit={() => startEdit("history")}
        onSave={() => void saveEdit()}
        onCancel={cancelEdit}
      >
        {editingSection === "history" && draft ? (
          <div className="flex flex-col gap-3">
            <EditableChips
              items={draft.history ?? []}
              onChange={(history) => setDraft((d) => d && { ...d, history })}
            />
            <div>
              <label
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--fg-3)",
                  textTransform: "uppercase",
                }}
              >
                Training age
              </label>
              <input
                className="input w-full"
                style={{ fontSize: 12, padding: "3px 7px", marginTop: 2 }}
                value={draft.trainingAge}
                placeholder="e.g. 3 years"
                onChange={(e) =>
                  setDraft((d) => d && { ...d, trainingAge: e.target.value })
                }
              />
            </div>
          </div>
        ) : (
          <ChipList items={profile.history ?? [profile.trainingAge].filter(Boolean)} />
        )}
      </ProfileCard>

      <ProfileCard
        label="Goals"
        editing={editingSection === "goals"}
        onEdit={() => startEdit("goals")}
        onSave={() => void saveEdit()}
        onCancel={cancelEdit}
      >
        {editingSection === "goals" && draft ? (
          <>
            <PrimaryGoalSelect
              value={draft.primaryGoal}
              onChange={(primaryGoal) => setDraft((d) => d && { ...d, primaryGoal })}
            />
            <EditableChips
              items={draft.goals}
              onChange={(goals) => setDraft((d) => d && { ...d, goals })}
            />
          </>
        ) : (
          <ChipList
            items={[
              ...(profile.primaryGoal ? [`★ ${GOAL_LABELS[profile.primaryGoal]}`] : []),
              ...profile.goals,
            ]}
          />
        )}
      </ProfileCard>

      <ProfileCard
        label="Injuries / limitations"
        editing={editingSection === "injuries"}
        onEdit={() => startEdit("injuries")}
        onSave={() => void saveEdit()}
        onCancel={cancelEdit}
      >
        {editingSection === "injuries" && draft ? (
          <EditableChips
            items={draft.injuries ?? draft.constraints}
            onChange={(injuries) => setDraft((d) => d && { ...d, injuries })}
          />
        ) : (
          <ChipList items={profile.injuries ?? profile.constraints} />
        )}
      </ProfileCard>

      <ProfileCard
        label="Equipment access"
        editing={editingSection === "equipment"}
        onEdit={() => startEdit("equipment")}
        onSave={() => void saveEdit()}
        onCancel={cancelEdit}
      >
        {editingSection === "equipment" && draft ? (
          <EditableChips
            items={draft.equipment}
            onChange={(equipment) => setDraft((d) => d && { ...d, equipment })}
          />
        ) : (
          <ChipList items={profile.equipment} />
        )}
      </ProfileCard>

      <ProfileCard
        label="Schedule"
        editing={editingSection === "schedule"}
        onEdit={() => startEdit("schedule")}
        onSave={() => void saveEdit()}
        onCancel={cancelEdit}
      >
        {editingSection === "schedule" && draft ? (
          <div className="flex flex-col gap-3">
            <EditableChips
              items={draft.schedule ?? []}
              onChange={(schedule) => setDraft((d) => d && { ...d, schedule })}
            />
            <div>
              <label
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--fg-3)",
                  textTransform: "uppercase",
                }}
              >
                Default days/week
              </label>
              <input
                type="number"
                min={1}
                max={7}
                className="input w-full"
                style={{ fontSize: 12, padding: "3px 7px", marginTop: 2 }}
                value={draft.defaultDaysPerWeek}
                onChange={(e) =>
                  setDraft((d) =>
                    d && { ...d, defaultDaysPerWeek: Number(e.target.value) }
                  )
                }
              />
            </div>
          </div>
        ) : (
          <ChipList
            items={profile.schedule ?? [`${profile.defaultDaysPerWeek} days/week`]}
          />
        )}
      </ProfileCard>

      {(editingSection === "preferences" || (profile.preferences ?? []).length > 0) && (
        <ProfileCard
          label="Prompt preferences"
          editing={editingSection === "preferences"}
          onEdit={() => startEdit("preferences")}
          onSave={() => void saveEdit()}
          onCancel={cancelEdit}
        >
          {editingSection === "preferences" && draft ? (
            <EditableChips
              items={draft.preferences ?? []}
              onChange={(preferences) =>
                setDraft((d) => d && { ...d, preferences })
              }
            />
          ) : (
            <ChipList items={profile.preferences!} />
          )}
        </ProfileCard>
      )}
    </div>
  );
}
