"use client";

import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { logRepo } from "@/lib/storage/logRepo";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { getRenderableDays } from "@/lib/programs/overrides";
import { resolveNextDay } from "@/lib/workout/dayResolver";
import { localDateString } from "@/lib/workout/localDate";
import { hasCopiedPrompt } from "@/lib/workspace/onboarding";

export function TodayClient() {
  const { programs, profile, loading } = useLocalData();
  const [dayResolving, setDayResolving] = useState(true);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  const activeProgram = programs.find((p) => p.active) ?? programs[0];

  useEffect(() => {
    if (loading) return;
    if (!activeProgram) {
      setDayResolving(false);
      return;
    }
    const days = getRenderableDays(activeProgram);
    if (days.length === 0) {
      setDayResolving(false);
      return;
    }
    setDayResolving(true);
    let cancelled = false;
    logRepo
      .listForProgram(activeProgram.id)
      .then((logs) => {
        if (cancelled) return;
        const today = localDateString();
        const day = resolveNextDay(days, logs, today);
        if (day) setRedirectTo(`/programs/${activeProgram.id}/days/${day.id}`);
        setDayResolving(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (days[0]) setRedirectTo(`/programs/${activeProgram.id}/days/${days[0].id}`);
        setDayResolving(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeProgram?.id]);

  const banner = !profile && !loading ? (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14,
        background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: "var(--r)",
        fontSize: 13, color: "var(--fg)",
      }}
    >
      <span style={{ flex: 1 }}>Welcome to trAIner — set up your Profile so the app can tailor your workouts.</span>
      <Link to="/profile" style={{ color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap", textDecoration: "none" }}>
        Go to Profile →
      </Link>
    </div>
  ) : null;

  if (loading || dayResolving) {
    return (
      <>
        {banner}
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading…</p>
      </>
    );
  }

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  // No active program — show onboarding
  const profileDone = !!profile;
  const steps: Array<{ label: string; to: string; done: boolean }> = [
    { label: "Fill out your Profile", to: "/profile", done: profileDone },
    { label: "Choose a coach on Prompts — copy the generated prompt", to: "/prompts", done: hasCopiedPrompt() },
    { label: "Paste the AI's JSON response on Import", to: "/import", done: programs.length > 0 },
  ];

  return (
    <>
      {banner}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px", color: "var(--fg)" }}>Today</h1>
          <p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0 }}>No active program yet. Follow these steps to get started:</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {steps.map(({ label, to, done }, i) => (
            <Link
              key={to}
              to={to}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                background: done ? "var(--bg-2)" : "var(--bg-1)",
                border: `1px solid ${done ? "var(--good)" : "var(--line)"}`,
                borderRadius: "var(--r)", textDecoration: "none", color: "var(--fg)",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: done ? 12 : 11, fontFamily: "var(--font-mono)", fontWeight: 700,
                  background: done ? "var(--good)" : "var(--bg-3)",
                  color: done ? "var(--accent-fg)" : "var(--fg-3)",
                  border: `1px solid ${done ? "var(--good)" : "var(--line)"}`,
                }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>{label}</span>
              <span aria-hidden style={{ color: "var(--fg-4)", fontSize: 11 }}>→</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
