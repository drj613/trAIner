"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
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
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--font-ui)", fontSize: 12 }}>Loading…</p>
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
    { label: "Choose a coach on Prompts", to: "/prompts", done: hasCopiedPrompt() },
    { label: "Paste the AI's routine on Import", to: "/import", done: programs.length > 0 },
  ];

  const firstPending = steps.findIndex(step => !step.done);
  const descriptions = [
    profileDone ? "Your goals, equipment, and constraints are saved." : "Set up your Profile with your goals, equipment, and constraints.",
    "Copy a coach prompt into your AI chat to plan your training.",
    "Validate the JSON and review it before saving.",
  ];

  return (
    <div className="today-onboarding">
      <PageHeader title="Today" description="No active program yet. Create a routine to start training." />
      <ol className="onboarding-steps">
        {steps.map(({ label, to, done }, index) => (
          <li key={to}>
            <Link to={to} className="onboarding-step" data-current={index === firstPending || undefined}>
              <span className="onboarding-marker" aria-hidden>{done ? <Check size={17} /> : index + 1}</span>
              <span className="onboarding-copy">
                <strong>{label}</strong>
                <span>{descriptions[index]}</span>
                <span className={index === firstPending ? "onboarding-action" : "onboarding-next"}>
                  {index === 0 ? "Go to Profile" : index === 1 ? "Open Prompts" : "Open Import"} <span aria-hidden>→</span>
                </span>
              </span>
              {done && <span className="onboarding-done">Done</span>}
            </Link>
          </li>
        ))}
      </ol>
      <div className="onboarding-alternative">
        <h2>Already know your routine?</h2>
        <p>Build your days and exercises directly, without an AI chat.</p>
        <Link to="/programs/new" className="button secondary">Build a routine manually</Link>
      </div>
    </div>
  );
}
