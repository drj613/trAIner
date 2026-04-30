"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { logRepo } from "@/lib/storage/logRepo";
import { buildHeatmapCells } from "@/lib/analytics/trainingHeatmap";
import { TrainingHeatmap } from "./TrainingHeatmap";
import type { HeatmapCell } from "@/lib/analytics/trainingHeatmap";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 mb-2">
        <span className="tx-up flex-1">{label}</span>
        <button
          type="button"
          className="p-1 rounded opacity-40 hover:opacity-100 transition-opacity"
          aria-label={`Edit ${label}`}
          onClick={() => undefined}
        >
          <Pencil size={12} />
        </button>
      </div>
      {children}
    </div>
  );
}

export function ProfileClient() {
  const { profile, loading } = useLocalData();
  const [heatmapCells, setHeatmapCells] = useState<HeatmapCell[][] | null>(null);

  useEffect(() => {
    logRepo.list().then((logs) => {
      const today = new Date().toISOString().slice(0, 10);
      setHeatmapCells(buildHeatmapCells(logs, today));
    });
  }, []);

  if (loading) return <p className="muted">Loading profile…</p>;
  if (!profile) return <p className="muted text-sm">No profile found. Import a program to create one.</p>;

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
          {initials(profile.name)}
        </div>
        <div>
          <p className="font-semibold text-base">{profile.name}</p>
          <p className="text-xs muted" style={{ fontFamily: "var(--font-mono)" }}>
            local · profile.json
          </p>
        </div>
      </div>

      {heatmapCells && <TrainingHeatmap cells={heatmapCells} />}

      {bodyHasData && (
        <ProfileCard label="Body">
          <KVGrid data={body} />
        </ProfileCard>
      )}

      <ProfileCard label="Training history">
        <ChipList items={profile.history ?? [profile.trainingAge].filter(Boolean)} />
      </ProfileCard>

      <ProfileCard label="Goals">
        <ChipList items={profile.goals} />
      </ProfileCard>

      <ProfileCard label="Injuries / limitations">
        <ChipList items={profile.injuries ?? profile.constraints} />
      </ProfileCard>

      <ProfileCard label="Equipment access">
        <ChipList items={profile.equipment} />
      </ProfileCard>

      <ProfileCard label="Schedule">
        <ChipList
          items={profile.schedule ?? [`${profile.defaultDaysPerWeek} days/week`]}
        />
      </ProfileCard>

      {(profile.preferences ?? []).length > 0 && (
        <ProfileCard label="Prompt preferences">
          <ChipList items={profile.preferences!} />
        </ProfileCard>
      )}
    </div>
  );
}
