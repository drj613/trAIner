"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useExerciseNormalization } from "@/components/app/ExerciseNormalizationProvider";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import {
  filterGroupVersions,
  groupCatalogItems,
  searchCatalogGroups,
  type CatalogGroup,
  type SelectableExercise,
} from "@/lib/catalog/groupCatalog";
import type {
  ExerciseIdentityContext,
  ExerciseIdentityInput,
  ExerciseIdentityResolver,
  ExerciseIdentityResult,
} from "@/lib/catalog/identity";
import { normalizeExerciseName, toTitleCase } from "@/lib/catalog/normalize";
import type { ProgramDay, ProgramDocument, UserExerciseDocument, WorkoutLogDocument } from "@/lib/programs/types";
import { logRepo } from "@/lib/storage/logRepo";
import { readableEntries } from "@/lib/workout/historyUtils";
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
  // Task 12's shared guard, not a fourth variant. `?? []` was not enough: it
  // does not fire for a non-nullish unreadable value, so `entries: "corrupt"`
  // reached `.map` and threw. `deriveNeedsReview` runs in a `useMemo` during
  // render and there is no error boundary in the app, so that throw blanked the
  // whole page rather than dropping one row.
  return logs.flatMap((log) =>
    readableEntries(log).map(({ entry }) => ({
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

/**
 * A family is filed under one muscle — its first version's — rather than split
 * across every muscle its versions touch. Splitting would put two rows called
 * "Squat" on one page holding different halves of the same family, which is
 * exactly the fragmentation nesting exists to remove.
 */
function primaryMuscle(group: CatalogGroup): string {
  const item = group.versions[0]?.catalogItem;
  if (!item) return group.versions[0]?.userExercise ? "custom" : "other";
  return item.muscles.primary[0] ?? item.tags[0] ?? "other";
}

function groupByMuscle(groups: readonly CatalogGroup[]): Map<string, CatalogGroup[]> {
  const map = new Map<string, CatalogGroup[]>();
  for (const group of groups) {
    const key = primaryMuscle(group);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(group);
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function countVersions(groups: readonly CatalogGroup[]): number {
  return groups.reduce((total, group) => total + group.versions.length, 0);
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

function correctionTargetForVersion(version: SelectableExercise): CorrectionTarget {
  return version.catalogItem
    ? { kind: "catalog-exercise", exerciseId: version.id, name: version.name }
    : { kind: "user-exercise", exerciseId: version.id, name: version.name };
}

/**
 * One concrete version — the only thing in this surface that names an exercise
 * the user can choose or correct. `nested` shifts it under its family without
 * adding a second card: the disclosure is the hierarchy, the indent is only a
 * reading aid.
 */
function ExerciseRow({
  version,
  standalone,
  highlighted = false,
  nested = false,
}: {
  version: SelectableExercise;
  standalone: boolean;
  highlighted?: boolean;
  nested?: boolean;
}) {
  const item = version.catalogItem;
  const [open, setOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const glyph = equipGlyph[item?.equipment[0] ?? ""] ?? "·";

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        data-standalone={standalone ? "true" : "false"}
        data-matched={highlighted ? "true" : "false"}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "24px 1fr auto",
          gap: 8,
          padding: nested ? "8px 12px 8px 28px" : "9px 12px",
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
          borderBottom: open ? "none" : "1px solid var(--line)",
          background: open ? "var(--bg-3)" : highlighted ? "var(--accent-soft)" : "transparent",
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
            {toTitleCase(version.name)}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-3)",
              marginTop: 1,
            }}
          >
            {item ? item.muscles.primary.join(", ") : "your exercise"}
            {item && item.muscles.secondary.length > 0 && (
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
            padding: nested ? "8px 12px 12px 60px" : "8px 12px 12px 44px",
            background: "var(--bg-3)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {item && item.aliases.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="tx-up" style={{ marginBottom: 4 }}>aliases</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {item.aliases.slice(0, 6).map((a: string, j: number) => (
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
              ["equipment", item ? item.equipment.join(", ") : "—"],
              ["patterns", item ? item.movementPatterns.slice(0, 2).join(", ") || "—" : "custom"],
              ["id", version.id],
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
                target={correctionTargetForVersion(version)}
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

// ─── Movement family ─────────────────────────────────────────────────────────

/**
 * Navigation, never a choice. A family names a group of exercises, not an
 * exercise, so this row only opens and closes — there is no version behind it
 * to log, and no identity behind it to correct.
 */
function FamilyRow({ group }: { group: CatalogGroup }) {
  // Open only when the query reached inside the family, and re-derived on every
  // query rather than seeded once: the row stays mounted while the user types,
  // so a `useState` seed would freeze whatever a half-typed query matched. A
  // click wins until the automatic answer itself changes.
  const autoOpen = group.matchedVersionIds.length > 0;
  const [clicked, setClicked] = useState<boolean | null>(null);
  const [lastAutoOpen, setLastAutoOpen] = useState(autoOpen);
  if (lastAutoOpen !== autoOpen) {
    setLastAutoOpen(autoOpen);
    setClicked(null);
  }
  const open = clicked ?? autoOpen;
  const count = group.versions.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setClicked(!open)}
        aria-expanded={open}
        aria-label={`${group.name} movement, ${count} version${count === 1 ? "" : "s"}`}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "24px 1fr auto auto",
          gap: 8,
          padding: "9px 12px",
          border: "none",
          borderBottom: "1px solid var(--line)",
          background: "transparent",
          color: "var(--fg)",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          alignItems: "center",
        }}
      >
        <span className="tx-mono" style={{ fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
          ⌸
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>{group.name}</span>
        <span className="tx-mono" style={{ fontSize: 10, color: "var(--fg-4)" }}>{count}</span>
        <span style={{ color: "var(--fg-4)" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && group.versions.map((version) => (
        <ExerciseRow
          key={version.id}
          version={version}
          standalone={false}
          nested
          highlighted={group.matchedVersionIds.includes(version.id)}
        />
      ))}
    </div>
  );
}

function GroupRows({ group }: { group: CatalogGroup }) {
  if (!group.standalone) return <FamilyRow group={group} />;
  // A standalone group is one entry with no family, which is the common case:
  // it renders as an ordinary row with no disclosure to click through.
  return (
    <>
      {group.versions.map((version) => (
        <ExerciseRow key={version.id} version={version} standalone />
      ))}
    </>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  muscle,
  groups,
  defaultOpen,
}: {
  muscle: string;
  groups: CatalogGroup[];
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
          {countVersions(groups)}
        </span>
        <span style={{ color: "var(--fg-4)" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {groups.map((group) => (
            <GroupRows key={group.id} group={group} />
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

  // Everything the library can show: the bundled catalogue plus the user's own
  // exercises, which the spec puts alongside bundled families rather than in a
  // separate list. Standalone unresolved NAMES are not added here — they have
  // no id to open a detail row on, and `Needs review` above already lists them
  // and filters by the same query.
  const selectable = useMemo<SelectableExercise[]>(
    () => [
      ...exerciseCatalog.map((item) => ({
        id: item.id,
        name: item.name,
        source: "bundled" as const,
        catalogItem: item,
      })),
      ...context.userExercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        source: "user" as const,
        userExercise: exercise,
      })),
    ],
    [context.userExercises],
  );

  // Keyed on the resolver, so a committed correction regroups the catalogue
  // and nothing else recomputes. Resolution here is by id, one map lookup per
  // entry — not the by-name catalogue scan that made `Needs review` expensive.
  const allGroups = useMemo(() => groupCatalogItems(selectable, resolve), [selectable, resolve]);

  const grouped = useMemo(() => {
    const searched = searchCatalogGroups(allGroups, q);
    return groupByMuscle(
      equipment
        ? filterGroupVersions(searched, (version) => version.catalogItem?.equipment.includes(equipment) ?? false)
        : searched,
    );
  }, [allGroups, q, equipment]);

  const totalShown = useMemo(
    () => [...grouped.values()].reduce((total, groups) => total + countVersions(groups), 0),
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
        Full exercise catalog. Movements hold their versions; click a row to expand aliases and details.
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
          [...grouped.entries()].map(([muscle, groups]) => (
            <CategorySection
              key={muscle}
              muscle={muscle}
              groups={groups}
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
