"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { setDensity, setTheme, setMono } from "@/components/app/ThemeProvider";
import { exportBackup, restoreBackup } from "@/lib/backup/backup";

type Density = "comfy" | "default" | "dense";
type Mono = "jetbrains" | "system";

const THEMES = ["editor", "terminal", "logbook", "linen", "paper", "midnight"] as const;
const DENSITIES: { value: Density; label: string }[] = [
  { value: "comfy", label: "Comfy" },
  { value: "default", label: "Default" },
  { value: "dense", label: "Dense" },
];

function readAttr(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return document.documentElement.getAttribute(name) ?? fallback;
}

export function SettingsClient() {
  const [theme, setThemeState] = useState(() => readAttr("data-theme", "linen"));
  const [density, setDensityState] = useState<Density>(() => readAttr("data-density", "default") as Density);
  const [mono, setMonoState] = useState<Mono>(() => readAttr("data-mono", "jetbrains") as Mono);

  function handleTheme(t: string) {
    setTheme(t);
    setThemeState(t);
  }

  function handleDensity(d: Density) {
    setDensity(d);
    setDensityState(d);
  }

  function handleMono(m: Mono) {
    setMono(m);
    setMonoState(m);
  }

  async function downloadBackup() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trainer-backup-${backup.exportedAt}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function uploadBackup(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await restoreBackup(data);
    } catch {
      alert("Failed to restore backup — invalid file format.");
    }
  }

  return (
    <div>
      <p style={{ margin: "0 0 4px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Workspace
      </p>
      <h1 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg)" }}>
        Settings
      </h1>

      <section style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Theme
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={theme === t}
              onClick={() => handleTheme(t)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${theme === t ? "var(--accent)" : "var(--line)"}`,
                background: theme === t ? "var(--accent-soft)" : "transparent",
                color: theme === t ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Density
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {DENSITIES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={density === value}
              onClick={() => handleDensity(value)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${density === value ? "var(--accent)" : "var(--line)"}`,
                background: density === value ? "var(--accent-soft)" : "transparent",
                color: density === value ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Monospace Font
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {(["jetbrains", "system"] as Mono[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mono === m}
              onClick={() => handleMono(m)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${mono === m ? "var(--accent)" : "var(--line)"}`,
                background: mono === m ? "var(--accent-soft)" : "transparent",
                color: mono === m ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {m === "jetbrains" ? "JetBrains" : "System"}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
          Data
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button" onClick={downloadBackup}>
            <Download size={18} /> Export Backup
          </button>
          <label className="button secondary">
            <Upload size={18} /> Restore Backup
            <input className="hidden" type="file" accept="application/json" onChange={(event) => uploadBackup(event.target.files?.[0])} />
          </label>
        </div>
      </section>
    </div>
  );
}
