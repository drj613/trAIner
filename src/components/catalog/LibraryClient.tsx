"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useExerciseNormalization } from "@/components/app/ExerciseNormalizationProvider";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { exerciseCatalog, type ExerciseCatalogItem } from "@/lib/catalog/exercises";
import type {
  ExerciseIdentityContext,
  ExerciseIdentityInput,
  ExerciseIdentityResolver,
  ExerciseIdentityResult,
} from "@/lib/catalog/identity";
import { normalizeExerciseName, toTitleCase } from "@/lib/catalog/normalize";
import type { ProgramDay, ProgramDocument, UserExerciseDocument, WorkoutLogDocument } from "@/lib/programs/types";
import { logRepo } from "@/lib/storage/logRepo";
import {
  ExerciseCorrectionSheet,
  correctionTargetKey,
  correctionTargetLabel,
  type CorrectionTarget,
} from "./ExerciseCorrectionSheet";

// ─── Needs review ─────────────────────────────────────────────────────────────

/**
 * Derived, never stored. The spec is explicit that `Needs review` is not a
 * persisted queue: it is recomputed from what the user actually references, so
 * correcting a target removes it from the list with no bookkeeping to keep in
 * sync and nothing to migrate.
 */
export type NeedsReviewOrigin = "routine" | "log" | "custom";

export type NeedsReviewItem = {
  key: string;
  target: CorrectionTarget;
  label: string;
  occurrences: number;
  origins: NeedsReviewOrigin[];
};

type Candidate = { input: ExerciseIdentityInput; rawName: string; origin: NeedsReviewOrigin };

function daysOf(program: ProgramDocument): ProgramDay[] {
  const replacements = program.overrides.flatMap((override) =>
    Array.isArray(override.replacement) ? override.replacement : [override.replacement],
  );
  return [...program.days, ...replacements];
}

function programCandidates(programs: readonly ProgramDocument[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const program of programs) {
    for (const day of daysOf(program)) {
      for (const section of day.sections ?? []) {
        for (const group of section.groups ?? []) {
          for (const exercise of group.exercises ?? []) {
            candidates.push({
              origin: "routine",
              rawName: exercise.name ?? "",
              input: {
                kind: "stored-exercise",
                canonicalExerciseId: exercise.canonicalExerciseId,
                slotId: exercise.id,
                performedName: exercise.name,
              },
            });
          }
        }
      }
    }
  }
  return candidates;
}

function logCandidates(logs: readonly WorkoutLogDocument[]): Candidate[] {
  return logs.flatMap((log) =>
    (log.entries ?? []).map((entry) => ({
      origin: "log" as const,
      rawName: entry.exerciseName ?? "",
      input: {
        kind: "stored-exercise" as const,
        canonicalExerciseId: entry.canonicalExerciseId,
        slotId: entry.exerciseId,
        performedName: entry.exerciseName,
      },
    })),
  );
}

function customCandidates(userExercises: readonly UserExerciseDocument[]): Candidate[] {
  return userExercises.map((exercise) => ({
    origin: "custom" as const,
    rawName: exercise.name,
    input: { kind: "custom-exercise" as const, exerciseId: exercise.id, name: exercise.name },
  }));
}

function targetFor(
  identity: ExerciseIdentityResult,
  candidate: Candidate,
  context: ExerciseIdentityContext,
): CorrectionTarget | undefined {
  const concreteId = identity.concreteExerciseId;
  if (concreteId) {
    const catalogItem = context.catalogById.get(concreteId);
    if (catalogItem) return { kind: "catalog-exercise", exerciseId: concreteId, name: catalogItem.name };
    const custom = context.userExercises.find((exercise) => exercise.id === concreteId);
    return custom ? { kind: "user-exercise", exerciseId: concreteId, name: custom.name } : undefined;
  }
  // With no concrete id there is nothing but the text to correct, and a slot id
  // is not a name — an entry that never carried one is skipped rather than
  // listed as something the user could recognise.
  const name = candidate.rawName.trim();
  return name ? { kind: "normalized-name", value: name } : undefined;
}

/**
 * Cache key for one candidate's resolution outcome.
 *
 * Deliberately excludes `slotId`: nothing this function reads from the result
 * (`movementId`, `source`, `concreteExerciseId`) depends on it — only `groupKey`
 * and `displayLabel` do, and the label shown here comes from `rawName`. A custom
 * exercise resolves by id, not by name, so it keys on the id: two custom
 * exercises sharing a name are two different targets and must not collapse.
 *
 * This matters because the entries with no `canonicalExerciseId` are exactly the
 * population this list targets — `v10Identity.ts` backfills that field only for
 * exact matches — and re-resolving each one by name is a full catalogue scan.
 */
function resolutionCacheKey(candidate: Candidate): string {
  if (candidate.input.kind === "custom-exercise") return `custom:${candidate.input.exerciseId}`;
  const canonicalExerciseId = candidate.input.kind === "stored-exercise"
    ? candidate.input.canonicalExerciseId ?? ""
    : "";
  return `${candidate.input.kind}:${canonicalExerciseId}:${normalizeExerciseName(candidate.rawName)}`;
}

export function deriveNeedsReview(
  context: ExerciseIdentityContext,
  resolve: ExerciseIdentityResolver,
  programs: readonly ProgramDocument[],
  logs: readonly WorkoutLogDocument[],
): NeedsReviewItem[] {
  const items = new Map<string, NeedsReviewItem>();
  const candidates = [
    ...programCandidates(programs),
    ...logCandidates(logs),
    ...customCandidates(context.userExercises),
  ];

  // `undefined` is a cached "nothing to review here", so a repeated candidate
  // costs one map lookup instead of one catalogue scan.
  const outcomes = new Map<string, CorrectionTarget | undefined>();

  for (const candidate of candidates) {
    const cacheKey = resolutionCacheKey(candidate);
    let target = outcomes.get(cacheKey);
    if (!outcomes.has(cacheKey)) {
      const identity = resolve(candidate.input);
      // Two exclusions, for two different reasons: a target that already nests
      // under a movement has nothing left to decide, and one whose
      // classification came from an override has already been decided by the
      // user — including a deliberate `movementId: null`, which must not be
      // nagged about forever.
      target = identity.movementId || identity.source === "user-override"
        ? undefined
        : targetFor(identity, candidate, context);
      outcomes.set(cacheKey, target);
    }
    if (!target) continue;

    const key = correctionTargetKey(target);
    const existing = items.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (!existing.origins.includes(candidate.origin)) existing.origins.push(candidate.origin);
      continue;
    }
    items.set(key, {
      key,
      target,
      label: correctionTargetLabel(target),
      occurrences: 1,
      origins: [candidate.origin],
    });
  }

  return [...items.values()].sort(
    (left, right) => right.occurrences - left.occurrences || left.label.localeCompare(right.label),
  );
}

// Only 142 of 3,175 catalogue entries carry a movement, so a long-standing
// user's list is tens of rows. Rendering all of them above the whole catalogue
// on every Library visit would read as a report on the catalogue's
// incompleteness rather than as a review queue — hence collapsed behind its
// count, and capped when open. The count is the instrument; the rows are the
// detail you ask for.
const NEEDS_REVIEW_PREVIEW = 10;

function NeedsReviewSection({ items }: { items: NeedsReviewItem[] }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (items.length === 0) return null;

  const shown = showAll ? items : items.slice(0, NEEDS_REVIEW_PREVIEW);
  const hidden = items.length - shown.length;

  return (
    <section
      aria-label="Needs review"
      style={{
        marginBottom: 10,
        border: "1px solid var(--line)",
        borderRadius: "var(--r)",
        background: "var(--bg-2)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        className="tap-target"
        onClick={() => setOpen((current) => !current)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          background: "var(--bg-2)",
          border: "none",
          cursor: "pointer",
          color: "var(--fg)",
          fontFamily: "inherit",
        }}
      >
        <span className="tx-up" style={{ flex: 1, textAlign: "left" }}>needs review</span>
        <span className="tx-mono" style={{ fontSize: 10, color: "var(--fg-4)" }}>{items.length}</span>
        <span style={{ color: "var(--fg-4)" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && shown.map((item) => (
        <div key={item.key} style={{ borderTop: "1px solid var(--line)" }}>
          <button
            type="button"
            className="tap-target"
            onClick={() => setOpenKey((current) => (current === item.key ? null : item.key))}
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 8,
              padding: "7px 12px",
              border: "none",
              background: openKey === item.key ? "var(--bg-3)" : "transparent",
              color: "var(--fg)",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 13,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </span>
            <span className="tx-mono" style={{ fontSize: 10, color: "var(--fg-4)" }}>
              {item.origins.join(" · ")}
            </span>
            <span className="tx-mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
              {item.occurrences}
            </span>
          </button>
          {openKey === item.key && (
            <div style={{ padding: "0 12px 10px" }}>
              <ExerciseCorrectionSheet target={item.target} onClose={() => setOpenKey(null)} />
            </div>
          )}
        </div>
      ))}
      {open && hidden > 0 && (
        <button
          type="button"
          className="tap-target"
          onClick={() => setShowAll(true)}
          style={{
            width: "100%",
            padding: "7px 12px",
            border: "none",
            borderTop: "1px solid var(--line)",
            background: "transparent",
            color: "var(--fg-3)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            textAlign: "left",
          }}
        >
          +{hidden} more
        </button>
      )}
    </section>
  );
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

function primaryMuscle(item: ExerciseCatalogItem): string {
  return item.muscles.primary[0] ?? item.tags[0] ?? "other";
}

function groupByMuscle(
  items: ExerciseCatalogItem[],
): Map<string, ExerciseCatalogItem[]> {
  const map = new Map<string, ExerciseCatalogItem[]>();
  for (const item of items) {
    const key = primaryMuscle(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

// ─── Equipment glyph ─────────────────────────────────────────────────────────

const equipGlyph: Record<string, string> = {
  barbell: "⊟",
  dumbbell: "⊜",
  cable: "⌇",
  machine: "⊞",
  bodyweight: "○",
  band: "≈",
  kettlebell: "⬡",
  "med-ball": "●",
  box: "□",
};

// ─── Exercise row ─────────────────────────────────────────────────────────────

function ExerciseRow({ item }: { item: ExerciseCatalogItem }) {
  const [open, setOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const glyph = equipGlyph[item.equipment[0] ?? ""] ?? "·";

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "24px 1fr auto",
          gap: 8,
          padding: "9px 12px",
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
          borderBottom: open ? "none" : "1px solid var(--line)",
          background: open ? "var(--bg-3)" : "transparent",
          color: "var(--fg)",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          alignItems: "center",
          transition: "background .1s",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--fg-3)",
            textAlign: "center",
          }}
        >
          {glyph}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {toTitleCase(item.name)}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-3)",
              marginTop: 1,
            }}
          >
            {item.muscles.primary.join(", ")}
            {item.muscles.secondary.length > 0 && (
              <span style={{ color: "var(--fg-4)" }}>
                {" "}
                +{item.muscles.secondary.slice(0, 2).join(", ")}
              </span>
            )}
          </div>
        </div>
        <span style={{ color: "var(--fg-4)", flexShrink: 0 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: "8px 12px 12px 44px",
            background: "var(--bg-3)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {item.aliases.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="tx-up" style={{ marginBottom: 4 }}>aliases</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {item.aliases.slice(0, 6).map((a, j) => (
                  <span
                    key={j}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      padding: "2px 6px",
                      background: "var(--bg-2)",
                      border: "1px solid var(--line)",
                      borderRadius: 3,
                      color: "var(--fg-2)",
                    }}
                  >
                    {a}
                  </span>
                ))}
                {item.aliases.length > 6 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      color: "var(--fg-4)",
                      alignSelf: "center",
                    }}
                  >
                    +{item.aliases.length - 6} more
                  </span>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
            }}
          >
            {[
              ["equipment", item.equipment.join(", ")],
              ["patterns", item.movementPatterns.slice(0, 2).join(", ") || "—"],
              ["id", item.id],
            ].map(([lbl, val]) => (
              <div key={lbl}>
                <div className="tx-up">{lbl}</div>
                <div
                  style={{
                    color: "var(--fg-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {val}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 8 }}>
            {correcting ? (
              <ExerciseCorrectionSheet
                target={{ kind: "catalog-exercise", exerciseId: item.id, name: item.name }}
                onClose={() => setCorrecting(false)}
              />
            ) : (
              <button type="button" className="btn" onClick={() => setCorrecting(true)}>
                Change movement
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  muscle,
  items,
  defaultOpen,
}: {
  muscle: string;
  items: ExerciseCatalogItem[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        marginBottom: 10,
        border: "1px solid var(--line)",
        borderRadius: "var(--r)",
        background: "var(--bg-2)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          background: "var(--bg-2)",
          border: "none",
          cursor: "pointer",
          color: "var(--fg)",
          fontFamily: "inherit",
        }}
      >
        <span className="tx-up" style={{ flex: 1, textAlign: "left" }}>
          {muscle}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-4)",
          }}
        >
          {items.length}
        </span>
        <span style={{ color: "var(--fg-4)" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {items.map((item) => (
            <ExerciseRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const EQUIPMENT_OPTIONS = [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "bodyweight",
  "band",
  "kettlebell",
];

export function LibraryClient() {
  const [q, setQ] = useState("");
  const [equipment, setEquipment] = useState<string | null>(null);
  const { programs } = useLocalData();
  const { context, resolve } = useExerciseNormalization();
  const [logs, setLogs] = useState<WorkoutLogDocument[]>([]);

  // Logs are read once. A correction changes how they CLASSIFY, never what
  // they contain, so re-reading them on every identity change would be work
  // that cannot change its own answer.
  useEffect(() => {
    let live = true;
    void logRepo.list().then((stored) => {
      if (live) setLogs(stored);
    });
    return () => {
      live = false;
    };
  }, []);

  // Regrouping is driven by the provider republishing a new context, which is
  // what a committed correction causes — no reload, no remount, no page.
  const needsReview = useMemo(
    () => deriveNeedsReview(context, resolve, programs, logs),
    [context, resolve, programs, logs],
  );
  const shownNeedsReview = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? needsReview.filter((item) => item.label.toLowerCase().includes(query)) : needsReview;
  }, [needsReview, q]);

  const grouped = useMemo(() => {
    let items = exerciseCatalog;
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(qq) ||
          item.aliases.some((a) => a.toLowerCase().includes(qq)) ||
          item.muscles.primary.some((m) => m.toLowerCase().includes(qq)),
      );
    }
    if (equipment) {
      items = items.filter((item) => item.equipment.includes(equipment));
    }
    return groupByMuscle(items);
  }, [q, equipment]);

  const totalShown = useMemo(
    () => [...grouped.values()].reduce((n, arr) => n + arr.length, 0),
    [grouped],
  );

  const isFiltered = Boolean(q.trim() || equipment);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "var(--fg)",
          }}
        >
          Library
        </h1>
        <span className="tx-mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
          {isFiltered ? `${totalShown} / ` : ""}
          {exerciseCatalog.length} exercises
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Full exercise catalog. Click a row to expand aliases and details.
      </p>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r)",
          padding: "6px 10px",
          marginBottom: 8,
        }}
      >
        <Search size={13} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search exercises, muscles, aliases…"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--fg)",
            fontSize: 13,
          }}
        />
        {q && (
          <button className="btn ghost" onClick={() => setQ("")} style={{ padding: "2px 4px" }}>
            <X size={11} />
          </button>
        )}
      </div>

      {/* Equipment filter chips */}
      <div
        style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}
      >
        <button
          onClick={() => setEquipment(null)}
          style={{
            flexShrink: 0,
            padding: "4px 10px",
            borderRadius: 999,
            border: `1px solid ${!equipment ? "var(--accent)" : "var(--line)"}`,
            background: !equipment ? "var(--accent-soft)" : "transparent",
            color: !equipment ? "var(--accent)" : "var(--fg-2)",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            cursor: "pointer",
          }}
        >
          all
        </button>
        {EQUIPMENT_OPTIONS.map((eq) => (
          <button
            key={eq}
            onClick={() => setEquipment(equipment === eq ? null : eq)}
            style={{
              flexShrink: 0,
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${equipment === eq ? "var(--accent)" : "var(--line)"}`,
              background: equipment === eq ? "var(--accent-soft)" : "transparent",
              color: equipment === eq ? "var(--accent)" : "var(--fg-2)",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {equipGlyph[eq] && (
              <span style={{ fontSize: 12 }}>{equipGlyph[eq]}</span>
            )}
            {eq}
          </button>
        ))}
      </div>

      <NeedsReviewSection items={shownNeedsReview} />

      {/* Groups */}
      <section aria-label="Catalogue">
        {grouped.size === 0 ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              fontSize: 12,
              color: "var(--fg-3)",
              background: "var(--bg-2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r)",
            }}
          >
            no matches
          </div>
        ) : (
          [...grouped.entries()].map(([muscle, items]) => (
            <CategorySection
              key={muscle}
              muscle={muscle}
              items={items}
              defaultOpen={isFiltered}
            />
          ))
        )}
      </section>

      {/* Footer */}
      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-3)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>
          exercises.generated.json · {exerciseCatalog.length} entries ·{" "}
          <span style={{ color: "var(--fg-2)" }}>local catalog</span>
        </span>
      </div>
    </div>
  );
}
