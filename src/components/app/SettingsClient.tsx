"use client";

import { useEffect, useState, useRef } from "react";
import { setDensity, setTheme, setMono } from "@/components/app/ThemeProvider";
import { exportBackup, restoreBackup, resetWorkspace } from "@/lib/backup/backup";
import { backupRepo } from "@/lib/storage/backupRepo";
import { loadWorkspaceStats, type WorkspaceStats } from "@/lib/workspace/stats";

type Density = "comfy" | "default" | "dense";
type Mono = "jetbrains" | "system";

const THEMES = ["editor", "terminal", "logbook", "linen", "paper", "midnight"] as const;
const DENSITIES: { value: Density; label: string }[] = [
  { value: "comfy", label: "Comfy" },
  { value: "default", label: "Default" },
  { value: "dense", label: "Dense" },
];
const STAT_KEYS: (keyof WorkspaceStats)[] = ["profile", "programs", "logs", "aliases", "snapshots"];

function readAttr(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return document.documentElement.getAttribute(name) ?? fallback;
}

function ActionRow({
  label,
  sub,
  variant = "default",
  onClick,
  children,
}: {
  label: string;
  sub: string;
  variant?: "primary" | "warn" | "danger" | "default";
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const color =
    variant === "primary" ? "var(--accent)" :
    variant === "warn" ? "var(--warn, #e6b664)" :
    variant === "danger" ? "var(--bad, #ef9a9a)" :
    "var(--fg-3)";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", textAlign: "left",
        padding: "10px 12px", background: "var(--bg-2)",
        border: "1px solid var(--line)", borderRadius: "var(--r, 6px)",
        cursor: "pointer", width: "100%", gap: 8,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{sub}</div>
      </div>
      <span style={{ fontSize: 11, color, fontFamily: "var(--font-mono)" }}>›</span>
      {children}
    </button>
  );
}

export function SettingsClient() {
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [theme, setThemeState] = useState(() => readAttr("data-theme", "linen"));
  const [density, setDensityState] = useState<Density>(
    () => readAttr("data-density", "default") as Density
  );
  const [mono, setMonoState] = useState<Mono>(
    () => readAttr("data-mono", "jetbrains") as Mono
  );
  const [snapshotting, setSnapshotting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWorkspaceStats().then(setStats);
  }, []);

  function handleTheme(t: string) { setTheme(t); setThemeState(t); }
  function handleDensity(d: Density) { setDensity(d); setDensityState(d); }
  function handleMono(m: Mono) { setMono(m); setMonoState(m); }

  async function handleExport() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trAIner-workspace-${backup.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file?: File) {
    if (!file) return;
    if (!confirm("This will replace all local data. Continue?")) return;
    try {
      const data = JSON.parse(await file.text());
      await restoreBackup(data);
      setStats(await loadWorkspaceStats());
    } catch {
      alert("Failed to restore — invalid file format.");
    }
  }

  async function handleSnapshot() {
    setSnapshotting(true);
    try {
      const backup = await exportBackup();
      await backupRepo.save(backup);
      setStats(await loadWorkspaceStats());
    } finally {
      setSnapshotting(false);
    }
  }

  const sizeLabel = stats
    ? stats.sizeKB >= 1024 ? `${(stats.sizeKB / 1024).toFixed(2)} MB` : `${stats.sizeKB} KB`
    : "…";

  const snapshotSub = stats?.snapshots
    ? `${stats.snapshots} snapshot${stats.snapshots !== 1 ? "s" : ""} · last ${stats.lastSnapshotAt ?? "—"}`
    : "no snapshots";

  const exportSub = stats
    ? `trAIner-workspace-${new Date().toISOString().slice(0, 10)}.json · ~${sizeLabel}`
    : "loading…";

  return (
    <div style={{ padding: 12 }}>
      {/* Stats panel */}
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r, 6px)", padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className="tx-up">Workspace</span>
          <span style={{ flex: 1 }} />
          <span className="tx-mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>
            local · {sizeLabel}
          </span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px" }}>
          {STAT_KEYS.map((k) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px dashed var(--line)" }}>
              <span style={{ color: "var(--fg-3)" }}>{k}</span>
              <span style={{ color: "var(--fg)" }}>{stats ? String(stats[k] ?? 0) : "…"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <ActionRow label="Export full workspace" sub={exportSub} variant="primary" onClick={handleExport} />
        <ActionRow label="Import workspace" sub="Replace all local data — destructive" variant="warn" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => handleImport(e.target.files?.[0])} />
        </ActionRow>
        <ActionRow label={snapshotting ? "Saving…" : "Snapshot current state"} sub={snapshotSub} onClick={handleSnapshot} />
      </div>

      {/* Local-first blurb */}
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r, 6px)", padding: 10, fontSize: 11.5, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="tx-up" style={{ color: "var(--good, #7fc77a)" }}>Local-first</span>
        </div>
        All data lives in your browser via IndexedDB. No account, no sync, no telemetry. Export to back up or move between devices.
      </div>

      {/* Appearance */}
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>
        Appearance
      </p>

      <section style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Theme</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {THEMES.map((t) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => handleTheme(t)} style={{ padding: "4px 12px", borderRadius: 999, border: `1px solid ${theme === t ? "var(--accent)" : "var(--line)"}`, background: theme === t ? "var(--accent-soft)" : "transparent", color: theme === t ? "var(--accent)" : "var(--fg-2)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer" }}>
              {t}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Density</p>
        <div style={{ display: "flex", gap: 6 }}>
          {DENSITIES.map(({ value, label }) => (
            <button key={value} type="button" aria-pressed={density === value} onClick={() => handleDensity(value)} style={{ padding: "4px 12px", borderRadius: 999, border: `1px solid ${density === value ? "var(--accent)" : "var(--line)"}`, background: density === value ? "var(--accent-soft)" : "transparent", color: density === value ? "var(--accent)" : "var(--fg-2)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Monospace Font</p>
        <div style={{ display: "flex", gap: 6 }}>
          {(["jetbrains", "system"] as Mono[]).map((m) => (
            <button key={m} type="button" aria-pressed={mono === m} onClick={() => handleMono(m)} style={{ padding: "4px 12px", borderRadius: 999, border: `1px solid ${mono === m ? "var(--accent)" : "var(--line)"}`, background: mono === m ? "var(--accent-soft)" : "transparent", color: mono === m ? "var(--accent)" : "var(--fg-2)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer" }}>
              {m === "jetbrains" ? "JetBrains" : "System"}
            </button>
          ))}
        </div>
      </section>

      {/* Danger zone */}
      <div style={{ marginTop: 32 }}>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--bad, #ef9a9a)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "0 0 12px",
          }}
        >
          Danger
        </p>
        <button
          type="button"
          onClick={() => setResetOpen((o) => !o)}
          style={{
            display: "block",
            width: "100%",
            padding: "10px 16px",
            background: "var(--bad, #ef5350)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--r, 6px)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          Reset workspace
        </button>
        {resetOpen && (
          <div
            style={{
              marginTop: 8,
              padding: "12px 14px",
              background: "color-mix(in srgb, var(--bad, #ef5350) 8%, var(--bg-2))",
              border: "1px solid var(--bad, #ef5350)",
              borderRadius: "var(--r, 6px)",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--fg)", marginBottom: 12, lineHeight: 1.5 }}>
              This will permanently delete all programs, logs, profile data, and aliases.
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  await resetWorkspace();
                  window.location.reload();
                }}
                style={{
                  padding: "7px 14px",
                  background: "var(--bad, #ef5350)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--r, 6px)",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Yes, wipe everything
              </button>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 12, padding: "7px 12px" }}
                onClick={() => setResetOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
