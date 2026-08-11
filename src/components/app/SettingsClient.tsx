"use client";

import { useEffect, useState, useRef } from "react";
import { setDensity, setTheme, setMono } from "@/components/app/ThemeProvider";
import { exportBackup, restoreBackup, resetWorkspace } from "@/lib/backup/backup";
import { backupRepo } from "@/lib/storage/backupRepo";
import { loadWorkspaceStats, type WorkspaceStats } from "@/lib/workspace/stats";
import { getPersistenceState, requestPersistence, type PersistenceState } from "@/lib/storage/persistence";

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
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  sub: string;
  variant?: "primary" | "warn" | "danger" | "default";
  disabled?: boolean;
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
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", textAlign: "left",
        padding: "10px 12px", background: "var(--bg-2)",
        border: "1px solid var(--line)", borderRadius: "var(--r, 6px)",
        cursor: disabled ? "not-allowed" : "pointer", width: "100%", gap: 8,
        opacity: disabled ? 0.6 : 1,
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
  const [wiping, setWiping] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [persistence, setPersistence] = useState<PersistenceState | null>(null);
  const [snapshotList, setSnapshotList] = useState<{ id: string }[]>([]);
  // Which row's delete button is armed (needs a second click to confirm).
  // A single click-to-arm state covers "arm a row" (first click), "confirm"
  // (second click on the same row), and "disarm" (arming a different row,
  // or a successful delete) without a modal.
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadWorkspaceStats().then(setStats);
  }, []);

  useEffect(() => {
    getPersistenceState().then(setPersistence);
  }, []);

  async function refreshSnapshots() {
    // Ids only: loadWorkspaceStats() already materializes every full
    // snapshot record for its size/count readout, so fetching full records
    // again here would be a second full read of up to SNAPSHOT_RETENTION
    // complete workspace copies just to render a list of timestamps.
    const ids = await backupRepo.listIds();
    setSnapshotList([...ids].sort((a, b) => b.localeCompare(a)).map((id) => ({ id })));
  }

  useEffect(() => {
    refreshSnapshots().catch((e) => console.error("[settings] snapshot list failed", e));
  }, []);

  async function handleDeleteSnapshot(id: string) {
    try {
      await backupRepo.delete(id);
      await refreshSnapshots();
      setStats(await loadWorkspaceStats());
    } catch (e) {
      console.error("[settings] snapshot delete failed", e);
    } finally {
      setArmedDeleteId(null);
    }
  }

  function handleDeleteClick(id: string) {
    if (armedDeleteId === id) {
      void handleDeleteSnapshot(id);
    } else {
      setArmedDeleteId(id);
    }
  }

  function handleTheme(t: string) { setTheme(t); setThemeState(t); }
  function handleDensity(d: Density) { setDensity(d); setDensityState(d); }
  function handleMono(m: Mono) { setMono(m); setMonoState(m); }

  function downloadBackupFile(backup: Awaited<ReturnType<typeof exportBackup>>, prefix = "trAIner-workspace") {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${prefix}-${backup.exportedAt.slice(0, 10)}.json`;
      a.click();
    } finally {
      // Defer the revoke instead of calling it synchronously right after
      // click() — that gives the browser a moment to actually start the
      // download, and the finally+setTimeout combination means the object
      // URL is still released even if click() itself throws.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  async function handleExport() {
    downloadBackupFile(await exportBackup());
  }

  async function handleImport(file?: File) {
    if (!file) return;
    if (!confirm("This will replace all local data. A backup file of the current workspace will start downloading before anything is replaced. Continue?")) return;
    try {
      // A restore clears everything first. Push the current workspace to a
      // file so a bad import is recoverable.
      downloadBackupFile(await exportBackup(), "trAIner-pre-restore");
    } catch (e) {
      console.error("[settings] pre-restore backup failed", e);
      alert("Could not create a safety backup first, so nothing was changed.");
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      await restoreBackup(data);
      setStats(await loadWorkspaceStats());
    } catch (e) {
      console.error("[settings] restore failed", e);
      alert("Failed to restore — invalid file format.");
    }
  }

  async function handleSnapshot() {
    setSnapshotting(true);
    try {
      const backup = await exportBackup();
      await backupRepo.save(backup);
      await refreshSnapshots();
      setStats(await loadWorkspaceStats());
    } finally {
      setSnapshotting(false);
    }
  }

  const sizeLabel = stats
    ? stats.sizeKB >= 1024 ? `${(stats.sizeKB / 1024).toFixed(2)} MB` : `${stats.sizeKB} KB`
    : "…";

  // snapshotKB is an approximate encoded-byte size — round to zero reads as
  // a bug when snapshots actually exist, so floor it at "<1 KB" instead.
  const snapshotSizeLabel = stats && stats.snapshotKB > 0 ? `~${stats.snapshotKB} KB` : "<1 KB";

  const snapshotSub = stats?.snapshots
    ? `${stats.snapshots} snapshot${stats.snapshots !== 1 ? "s" : ""} · ${snapshotSizeLabel} · last ${stats.lastSnapshotAt ?? "—"}`
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
            local · {sizeLabel} ·{" "}
            <span style={{ color: persistence === "persisted" ? "var(--good, #7fc77a)" : "var(--warn, #e6b664)" }}>
              {persistence === "persisted" ? "protected"
                : persistence === "denied" ? "evictable"
                : persistence === "unsupported" ? "unprotected"
                : "…"}
            </span>
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
        <ActionRow label="Download backup file" sub={exportSub} variant="primary" onClick={handleExport} />
        <ActionRow label="Import workspace" sub="Replace all local data — destructive" variant="warn" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => handleImport(e.target.files?.[0])} />
        </ActionRow>
        <ActionRow
          label={snapshotting ? "Saving…" : "Snapshot (undo point)"}
          sub={`${snapshotSub} · stored in-browser, wiped with it — not a backup`}
          disabled={snapshotting}
          onClick={handleSnapshot}
        />
        {snapshotList.length > 0 && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {snapshotList.map((s) => {
              const armed = armedDeleteId === s.id;
              return (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 12px", borderBottom: "1px dashed var(--line)", color: "var(--fg-3)" }}>
                  <span>{s.id.slice(0, 16).replace("T", " ")}</span>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 10, padding: "1px 6px", color: armed ? "var(--bad, #ef9a9a)" : undefined }}
                    aria-label={`${armed ? "confirm delete" : "delete"} snapshot ${s.id}`}
                    onClick={() => handleDeleteClick(s.id)}
                  >
                    {armed ? "confirm?" : "delete"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Local-first blurb */}
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r, 6px)", padding: 10, fontSize: 11.5, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="tx-up" style={{ color: "var(--good, #7fc77a)" }}>Local-first</span>
        </div>
        All data lives in your browser via IndexedDB. No account, no sync, no telemetry. Download a backup file to protect your history or move between devices — in-browser snapshots vanish with the browser data they copy.
        {persistence === "denied" && (
          <div style={{ marginTop: 6, color: "var(--warn, #e6b664)" }}>
            The browser has not granted persistent storage — it may delete this
            data under disk pressure or inactivity. Export regularly.{" "}
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => requestPersistence().then(setPersistence)}
            >
              Request protection
            </button>
          </div>
        )}
        {persistence === "unsupported" && (
          <div style={{ marginTop: 6, color: "var(--warn, #e6b664)" }}>
            This browser can&apos;t protect local data from eviction. Download a
            backup file regularly — it&apos;s the only safeguard here.
          </div>
        )}
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
          aria-expanded={resetOpen}
          aria-controls="reset-confirm-panel"
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
            id="reset-confirm-panel"
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
                disabled={wiping}
                onClick={async () => {
                  setWiping(true);
                  setResetError(null);
                  try {
                    await resetWorkspace();
                    window.location.reload();
                  } catch (e) {
                    setWiping(false);
                    setResetError(e instanceof Error ? e.message : "Reset failed. Please try again.");
                  }
                }}
                style={{
                  padding: "7px 14px",
                  background: "var(--bad, #ef5350)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--r, 6px)",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: wiping ? "not-allowed" : "pointer",
                  opacity: wiping ? 0.7 : 1,
                }}
              >
                {wiping ? "Wiping…" : "Yes, wipe everything"}
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
            {resetError && (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--bad)", fontFamily: "var(--font-mono)" }}>
                {resetError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
