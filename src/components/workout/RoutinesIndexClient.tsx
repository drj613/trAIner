"use client";

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { programRepo } from "@/lib/storage/programRepo";
import { programStatus, programDaysPerWeek, programLengthWeeks } from "@/lib/programs/routineMeta";
import type { ProgramDocument } from "@/lib/programs/types";

type Filter = "all" | "draft" | "archived";

const STATUS_COLOR: Record<string, string> = {
  active: "var(--good, #7fc77a)",
  draft: "var(--warn, #e6b664)",
  archived: "var(--fg-3)",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        background: STATUS_COLOR[status] ?? "var(--fg-3)",
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status.toUpperCase();
  const color = STATUS_COLOR[status] ?? "var(--fg-3)";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.1em",
        color,
        padding: "1px 6px",
        borderRadius: "var(--r-sm, 4px)",
        border: `1px solid ${color}`,
        background: status === "active" ? "rgba(127,199,122,0.08)" : "transparent",
      }}
    >
      {label}
    </span>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-sm, 4px)",
        padding: "4px 6px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--fg-3)",
          marginBottom: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 500,
          color: accent ? "var(--accent)" : "var(--fg)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function WeekStrip({ days }: { days: ProgramDocument["days"] }) {
  const slots = days.slice(0, 7);
  if (slots.length === 0) return null;
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
      {slots.map((d, i) => {
        const isRest = d.title?.toLowerCase().includes("rest");
        return (
          <div
            key={d.id}
            style={{
              flex: 1,
              height: 28,
              background: isRest ? "transparent" : "var(--bg-2)",
              border: `1px ${isRest ? "dashed" : "solid"} var(--line)`,
              borderRadius: "var(--r-sm, 4px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8.5,
                color: "var(--fg-4)",
                textTransform: "uppercase",
              }}
            >
              {DAY_LABELS[i] ?? `D${i + 1}`}
            </span>
            {!isRest && (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  marginTop: 2,
                  background: "var(--fg-4)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActiveCard({
  program,
  onOpen,
  onRun,
}: {
  program: ProgramDocument;
  onOpen: () => void;
  onRun: () => void;
}) {
  const pct = Math.round((program.completion ?? 0) * 100);
  const dpw = programDaysPerWeek(program);
  const lw = programLengthWeeks(program);
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--accent)",
        borderRadius: "var(--r, 6px)",
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          padding: "10px 12px 8px",
          background: "var(--accent-soft)",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <StatusBadge status="active" />
        <span style={{ flex: 1 }} />
        {program.lastRunAt && (
          <span
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-2)" }}
          >
            last run · {program.lastRunAt.slice(0, 10)}
          </span>
        )}
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            marginBottom: 2,
          }}
        >
          {program.title}
        </div>
        {program.description && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--fg-3)",
              marginBottom: 10,
              lineHeight: 1.4,
            }}
          >
            {program.description}
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 6,
            marginBottom: 10,
          }}
        >
          <StatTile label="DAYS/WK" value={String(dpw)} />
          <StatTile label="LENGTH" value={`${lw}w`} />
          <StatTile label="STREAK" value={`${program.streakWeeks ?? 0}w`} />
          <StatTile label="DONE" value={`${pct}%`} accent={pct >= 50} />
        </div>
        <WeekStrip days={program.days} />
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="button"
            onClick={onRun}
            style={{ flex: 1, justifyContent: "center" }}
          >
            Open today
          </button>
          <button
            type="button"
            className="button"
            onClick={onOpen}
            style={{ flex: 1, justifyContent: "center" }}
          >
            View routine
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuButton({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        color: danger ? "var(--bad, #ef9a9a)" : "var(--fg)",
        textAlign: "left",
      }}
    >
      {label}
    </button>
  );
}

function RoutineRow({
  program,
  onOpen,
  onActivate,
  onDuplicate,
  onDelete,
}: {
  program: ProgramDocument;
  onOpen: () => void;
  onActivate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = programStatus(program);
  const dpw = programDaysPerWeek(program);
  const lw = programLengthWeeks(program);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        marginBottom: 4,
        background: "var(--bg-1)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 6px)",
        position: "relative",
        opacity: status === "archived" ? 0.7 : 1,
      }}
    >
      <StatusDot status={status} />
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: "inherit",
          color: "var(--fg)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {program.title}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-3)",
            marginTop: 1,
          }}
        >
          {dpw}d/wk · {lw}w{status === "draft" ? " · not started" : ""}
          {program.lastRunAt && ` · ${program.lastRunAt.slice(0, 10)}`}
        </div>
      </button>
      <button
        type="button"
        aria-label="Open menu"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
        style={{
          background: "transparent",
          border: "none",
          padding: 4,
          color: "var(--fg-3)",
          cursor: "pointer",
        }}
      >
        ···
      </button>
      {menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 5 }}
          />
          <div
            style={{
              position: "absolute",
              right: 8,
              top: "100%",
              marginTop: 2,
              background: "var(--bg-2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r, 6px)",
              overflow: "hidden",
              zIndex: 10,
              minWidth: 140,
              boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
            }}
          >
            {status !== "active" && (
              <MenuButton
                label="Activate"
                onClick={() => {
                  setMenuOpen(false);
                  onActivate();
                }}
              />
            )}
            <MenuButton
              label="Duplicate"
              onClick={() => {
                setMenuOpen(false);
                onDuplicate();
              }}
            />
            <MenuButton
              label="Open editor"
              onClick={() => {
                setMenuOpen(false);
                onOpen();
              }}
            />
            <MenuButton
              label="Delete"
              danger
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function RoutinesIndexClient() {
  const { programs, loading, refresh } = useLocalData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");

  if (loading) return <p className="muted">Loading routines…</p>;

  const active = programs.find((p) => programStatus(p) === "active");
  const others = programs.filter((p) => programStatus(p) !== "active");
  const filtered =
    filter === "all" ? others : others.filter((p) => programStatus(p) === filter);

  async function handleActivate(id: string) {
    try {
      await programRepo.activate(id);
      await refresh();
    } catch (err) {
      console.error("Failed to activate routine", err);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const copy = await programRepo.duplicate(id);
      navigate(`/programs/${copy.id}`);
    } catch (err) {
      console.error("Failed to duplicate routine", err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this routine?")) return;
    try {
      await programRepo.remove(id);
      await refresh();
    } catch (err) {
      console.error("Failed to delete routine", err);
    }
  }

  return (
    <div>
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="tx-up">Routines</span>
          <div
            style={{
              fontSize: 11,
              color: "var(--fg-3)",
              marginTop: 1,
              fontFamily: "var(--font-mono)",
            }}
          >
            {programs.length} total · {programs.filter((p) => programStatus(p) === "active").length} active ·{" "}
            {programs.filter((p) => programStatus(p) === "draft").length} draft
          </div>
        </div>
        <Link to="/programs/new" className="button" style={{ padding: "5px 10px", fontSize: 11.5 }}>
          + New
        </Link>
      </div>

      {active && (
        <div style={{ padding: "10px 10px 0" }}>
          <ActiveCard
            program={active}
            onOpen={() => navigate(`/programs/${active.id}`)}
            onRun={() => navigate("/today")}
          />
        </div>
      )}

      <div
        style={{
          padding: "4px 10px 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span className="tx-up" style={{ fontSize: 9.5 }}>
          Other
        </span>
        {(["all", "draft", "archived"] as Filter[]).map((k) => {
          const count =
            k === "all"
              ? others.length
              : others.filter((p) => programStatus(p) === k).length;
          const isActive = filter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              style={{
                padding: "2px 7px",
                borderRadius: "var(--r-sm, 4px)",
                background: isActive ? "var(--accent-soft)" : "transparent",
                border: `1px solid ${isActive ? "var(--accent)" : "var(--line)"}`,
                color: isActive ? "var(--accent)" : "var(--fg-2)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {k} <span style={{ color: "var(--fg-4)" }}>·{count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: 10 }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--fg-3)",
              fontSize: 12,
              background: "var(--bg-1)",
              border: "1px dashed var(--line)",
              borderRadius: "var(--r, 6px)",
            }}
          >
            <div style={{ marginBottom: 4 }}>
              No {filter === "all" ? "other" : filter} routines
            </div>
            <Link
              to="/programs/new"
              style={{ color: "var(--accent)", fontFamily: "inherit", fontSize: 12 }}
            >
              Build a new one
            </Link>
          </div>
        ) : (
          filtered.map((p) => (
            <RoutineRow
              key={p.id}
              program={p}
              onOpen={() => navigate(`/programs/${p.id}`)}
              onActivate={() => { void handleActivate(p.id); }}
              onDuplicate={() => { void handleDuplicate(p.id); }}
              onDelete={() => { void handleDelete(p.id); }}
            />
          ))
        )}
      </div>

      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid var(--line)",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--fg-3)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>routines.json · {programs.length} entries</span>
        <span style={{ flex: 1 }} />
        <span>local</span>
      </div>
    </div>
  );
}
