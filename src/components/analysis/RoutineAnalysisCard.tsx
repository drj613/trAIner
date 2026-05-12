"use client";

import { useState } from "react";
import type { DisplayAnalysis } from "@/lib/analysis/types";

type AnyStatus = "good" | "warn" | "bad" | "green" | "yellow" | "red";

const STATUS_FG: Record<AnyStatus, string> = {
  good:   "var(--good, #7fc77a)",
  green:  "var(--good, #7fc77a)",
  warn:   "var(--warn, #e6b664)",
  yellow: "var(--warn, #e6b664)",
  bad:    "var(--bad, #e07b6a)",
  red:    "var(--bad, #e07b6a)",
};

const STATUS_BG: Record<AnyStatus, string> = {
  good: "rgba(127,199,122,0.10)", green: "rgba(127,199,122,0.10)",
  warn: "rgba(230,182,100,0.10)", yellow: "rgba(230,182,100,0.10)",
  bad: "rgba(224,123,106,0.10)", red: "rgba(224,123,106,0.10)",
};

function sc(s: string): string { return STATUS_FG[s as AnyStatus] ?? "var(--fg-3)"; }
function sb(s: string): string { return STATUS_BG[s as AnyStatus] ?? "transparent"; }

function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  const status = score >= 80 ? "good" : score >= 60 ? "warn" : "bad";
  return (
    <div style={{
      width: 52, height: 52, borderRadius: 26, flexShrink: 0,
      border: `2px solid ${sc(status)}`, background: sb(status),
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, lineHeight: 1, color: sc(status) }}>{grade}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", marginTop: 2 }}>{score}</span>
    </div>
  );
}

function DimChip({
  dim,
  active,
  onClick,
}: {
  dim: DisplayAnalysis["dimensions"][0];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "0 0 auto", minWidth: 64, padding: "6px 8px",
        background: active ? sb(dim.status) : "var(--bg-2)",
        borderTop: `2px solid ${sc(dim.status)}`,
        borderRight: `1px solid ${active ? sc(dim.status) : "var(--line)"}`,
        borderBottom: `1px solid ${active ? sc(dim.status) : "var(--line)"}`,
        borderLeft: `1px solid ${active ? sc(dim.status) : "var(--line)"}`,
        borderRadius: "var(--r-sm, 4px)", cursor: "pointer",
        fontFamily: "inherit", color: "var(--fg)", textAlign: "center",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: sc(dim.status), lineHeight: 1 }}>{dim.score}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginTop: 3 }}>{dim.label}</div>
    </button>
  );
}

function CoverageChip({ muscles, active, onClick }: {
  muscles: DisplayAnalysis["muscles"];
  active: boolean;
  onClick: () => void;
}) {
  const trained = muscles.filter((m) => m.sets > 0).length;
  const total = muscles.length;
  const allTrained = trained === total;
  const color = allTrained ? "var(--good)" : "var(--fg-3)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "0 0 auto", minWidth: 64, padding: "6px 8px",
        background: active ? "rgba(255,255,255,0.04)" : "var(--bg-2)",
        borderTop: `2px solid ${color}`,
        borderRight: `1px solid ${active ? "var(--fg-3)" : "var(--line)"}`,
        borderBottom: `1px solid ${active ? "var(--fg-3)" : "var(--line)"}`,
        borderLeft: `1px solid ${active ? "var(--fg-3)" : "var(--line)"}`,
        borderRadius: "var(--r-sm, 4px)", cursor: "pointer",
        fontFamily: "inherit", color: "var(--fg)", textAlign: "center",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color, lineHeight: 1 }}>
        {trained}/{total}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginTop: 3 }}>Coverage</div>
    </button>
  );
}

function VolumeBars({ muscles }: { muscles: DisplayAnalysis["muscles"] }) {
  const max = Math.ceil(Math.max(...muscles.map((m) => Math.max(m.sets, m.mrv))) * 1.05);
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div>
      <div style={{ display: "flex", gap: 10, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", marginBottom: 6, paddingLeft: 86, textTransform: "uppercase" }}>
        <span>MEV (Minimum Effective Volume)</span>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 12, height: 5, background: "var(--good)", opacity: 0.22, display: "inline-block" }} /> MAV (Maximum Adaptive Volume)
        </span>
        <span>MRV (Maximum Recoverable Volume)</span>
      </div>
      {muscles.map((m) => (
        <div key={m.group} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ width: 80, fontSize: 11, color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{m.group}</span>
          <div style={{ flex: 1, height: 14, position: "relative", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 2 }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(m.mavLo), width: `calc(${pct(m.mavHi)} - ${pct(m.mavLo)})`, background: "var(--good)", opacity: 0.18 }} />
            <div style={{ position: "absolute", top: -2, bottom: -2, left: pct(m.mev), width: 1.5, background: "var(--fg-4)" }} />
            <div style={{ position: "absolute", top: -2, bottom: -2, left: pct(m.mrv), width: 1.5, background: "var(--bad)" }} />
            <div style={{ position: "absolute", top: 2, bottom: 2, left: 0, width: pct(m.sets), background: sc(m.status), borderRadius: 1 }} />
          </div>
          <span style={{ width: 30, fontFamily: "var(--font-mono)", fontSize: 10.5, color: sc(m.status), textAlign: "right", fontWeight: 600, flexShrink: 0 }}>{m.sets}</span>
        </div>
      ))}
      <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", paddingLeft: 86 }}>
        weekly effective sets · primary 1.0 · secondary 0.5 · incidental 0.25
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: "var(--fg-3)", lineHeight: 1.5, paddingLeft: 86 }}>
        Ideally your sets land in the MAV band — above MEV to drive growth, below MRV to stay recoverable. Consistently under MEV means not enough stimulus; consistently over MRV risks accumulating fatigue faster than you can adapt.
      </div>
    </div>
  );
}

const MOVEMENT_PATTERN_LABELS: Record<string, string> = {
  horizontal_push: "H. push", horizontal_pull: "H. pull",
  vertical_push: "V. push", vertical_pull: "V. pull",
  hip_hinge: "Hinge", squat: "Squat",
};

function BalancePanel({ ratios, patterns }: { ratios: DisplayAnalysis["ratios"]; patterns: DisplayAnalysis["patterns"] }) {
  return (
    <div>
      {ratios.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: sc(r.verdict), flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: "var(--fg)" }}>{r.label}</div>
            {r.detail && <div style={{ fontSize: 10.5, color: "var(--fg-3)", marginTop: 1, lineHeight: 1.35 }}>{r.detail}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: sc(r.verdict) }}>{r.value}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)" }}>tgt {r.target}</div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: 6 }}>Movement patterns</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
          {Object.entries(MOVEMENT_PATTERN_LABELS).map(([id, label]) => {
            const ok = patterns.covered.includes(id);
            return (
              <div key={id} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 7px",
                borderRadius: "var(--r-sm, 4px)",
                background: ok ? sb("good") : sb("warn"),
                border: `1px solid ${ok ? sc("good") : sc("warn")}`,
              }}>
                <span style={{ fontSize: 10, color: ok ? sc("good") : sc("warn") }}>{ok ? "✓" : "!"}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: ok ? "var(--fg-2)" : "var(--warn)" }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CoveragePanel({ muscles, patterns }: {
  muscles: DisplayAnalysis["muscles"];
  patterns: DisplayAnalysis["patterns"];
}) {
  const trained = muscles.filter((m) => m.sets > 0);
  const untrained = muscles.filter((m) => m.sets === 0);

  return (
    <div>
      {/* Movement patterns */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: 6 }}>
          Movement patterns
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
          {Object.entries(MOVEMENT_PATTERN_LABELS).map(([id, label]) => {
            const ok = patterns.covered.includes(id);
            return (
              <div key={id} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 7px",
                borderRadius: "var(--r-sm, 4px)",
                background: ok ? sb("good") : sb("warn"),
                border: `1px solid ${ok ? sc("good") : sc("warn")}`,
              }}>
                <span style={{ fontSize: 10, color: ok ? sc("good") : sc("warn") }}>{ok ? "✓" : "!"}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: ok ? "var(--fg-2)" : "var(--warn)" }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trained muscles */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: 6 }}>
          Trained — {trained.length} muscle groups
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {trained.map((m) => (
            <div key={m.group} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 7px", borderRadius: "var(--r-sm, 4px)",
              background: sb(m.status), border: `1px solid ${sc(m.status)}`,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc(m.status), flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: "var(--fg-2)" }}>{m.group}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: sc(m.status), marginLeft: 1 }}>{m.sets}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Untrained muscles */}
      {untrained.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: 6 }}>
            Not trained — {untrained.length} muscle groups
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {untrained.map((m) => (
              <div key={m.group} style={{
                padding: "3px 7px", borderRadius: "var(--r-sm, 4px)",
                background: "var(--bg-2)", border: "1px solid var(--line)",
              }}>
                <span style={{ fontSize: 10.5, color: "var(--fg-4)" }}>{m.group}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--fg-3)", lineHeight: 1.5 }}>
            Untrained muscles don't affect your score — specialists intentionally skip certain groups.
          </div>
        </div>
      )}
    </div>
  );
}

function SessionsPanel({ sessions }: { sessions: DisplayAnalysis["sessions"] }) {
  return (
    <div>
      {sessions.map((s, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 8px", marginBottom: 4,
          background: "var(--bg-2)", border: "1px solid var(--line)",
          borderLeft: `2px solid ${sc(s.status)}`, borderRadius: "var(--r-sm, 4px)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 500 }}>{s.day}</div>
            {s.flag && <div style={{ fontSize: 10, color: "var(--warn)", marginTop: 1, lineHeight: 1.35 }}>{s.flag}</div>}
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", flexShrink: 0 }}>
            {s.exercises}ex · {s.sets}s · {s.durationMin}m
          </span>
        </div>
      ))}
    </div>
  );
}

function FindingsPanel({ warnings, strengths }: { warnings: DisplayAnalysis["warnings"]; strengths: string[] }) {
  return (
    <div>
      {warnings.map((w, i) => (
        <div key={i} style={{
          display: "flex", gap: 8, padding: "7px 9px", marginBottom: 4,
          background: sb(w.severity === "info" ? "good" : w.severity),
          border: `1px solid ${sc(w.severity === "info" ? "good" : w.severity)}`,
          borderRadius: "var(--r-sm, 4px)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>{w.area}</div>
            <div style={{ fontSize: 11.5, color: "var(--fg-2)", lineHeight: 1.4 }}>{w.msg}</div>
          </div>
        </div>
      ))}
      {strengths.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--good)", marginBottom: 6 }}>Strengths</div>
          {strengths.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 6, padding: "4px 0", fontSize: 11, color: "var(--fg-2)", lineHeight: 1.4 }}>
              <span style={{ color: "var(--good)", flexShrink: 0, marginTop: 2 }}>✓</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Tab = "volume" | "balance" | "coverage" | "sessions" | "findings" | "structure" | "periodization";

export function RoutineAnalysisCard({
  analysis,
  onOpenPrompt,
}: {
  analysis: DisplayAnalysis;
  onOpenPrompt: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>("volume");

  const activeDim = tab !== "coverage"
    ? (analysis.dimensions.find((d) => d.id === tab) ?? analysis.dimensions[0])
    : null;

  return (
    <div style={{
      background: "var(--bg-1)", border: "1px solid var(--line)",
      borderRadius: "var(--r, 6px)", overflow: "hidden", marginBottom: 12,
    }}>
      {/* Header — click to expand */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "12px 12px", background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit", color: "var(--fg)", textAlign: "left",
        }}
      >
        <ScoreBadge score={analysis.overall.score} grade={analysis.overall.grade} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <span>Analysis</span>
            <span style={{ color: "var(--fg-4)" }}>· {analysis.durationMs}ms · offline</span>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, marginBottom: 3 }}>
            {analysis.fingerprint.label}
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            <span style={{ padding: "1px 5px", borderRadius: "var(--r-sm, 4px)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
              {analysis.fingerprint.primary}
            </span>
            {analysis.fingerprint.secondary && (
              <>
                <span style={{ color: "var(--fg-4)" }}>+</span>
                <span style={{ padding: "1px 5px", borderRadius: "var(--r-sm, 4px)", border: "1px solid var(--line)", color: "var(--fg-2)" }}>
                  {analysis.fingerprint.secondary}
                </span>
              </>
            )}
          </div>
        </div>
        <span style={{ color: "var(--fg-3)", flexShrink: 0, fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Chips row — dimension chips + coverage chip */}
      <div style={{ display: "flex", gap: 4, padding: "0 10px 10px", overflowX: "auto" }}>
        {analysis.dimensions.map((d) => (
          <DimChip
            key={d.id}
            dim={d}
            active={expanded && tab === d.id}
            onClick={() => {
              setTab(d.id as Tab);
              setExpanded(true);
            }}
          />
        ))}
        <CoverageChip
          muscles={analysis.muscles}
          active={expanded && tab === "coverage"}
          onClick={() => {
            setTab("coverage");
            setExpanded(true);
          }}
        />
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {activeDim && (
            <div style={{ padding: "8px 12px", background: "var(--bg-2)", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--fg-2)", lineHeight: 1.4 }}>
              <strong style={{ color: sc(activeDim.status) }}>{activeDim.label}</strong>
              {" — "}
              {activeDim.note}
            </div>
          )}

          <div style={{ padding: 12 }}>
            {tab === "volume" && <VolumeBars muscles={analysis.muscles} />}
            {tab === "balance" && <BalancePanel ratios={analysis.ratios} patterns={analysis.patterns} />}
            {tab === "coverage" && <CoveragePanel muscles={analysis.muscles} patterns={analysis.patterns} />}
            {tab === "sessions" && <SessionsPanel sessions={analysis.sessions} />}
            {(tab === "findings" || tab === "periodization" || tab === "structure") && (
              <FindingsPanel warnings={analysis.warnings} strengths={analysis.strengths} />
            )}
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
            borderTop: "1px solid var(--line)", background: "var(--bg-2)",
          }}>
            <div style={{ flex: 1, fontSize: 10.5, color: "var(--fg-3)", lineHeight: 1.35 }}>
              Want a deeper, qualitative review? Use AI for context-aware recommendations.
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={(e) => { e.stopPropagation(); onOpenPrompt(); }}
              style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }}
            >
              AI prompt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
