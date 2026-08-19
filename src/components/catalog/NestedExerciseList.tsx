"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { useExerciseNormalization } from "@/components/app/ExerciseNormalizationProvider";
import { exerciseCatalog, type ExerciseCatalogItem } from "@/lib/catalog/exercises";
import {
  groupCatalogItems,
  searchCatalogGroups,
  type CatalogGroup,
  type SelectableExercise,
} from "@/lib/catalog/groupCatalog";
import { toTitleCase } from "@/lib/catalog/normalize";

/**
 * The nested picker list, shared by the add and replace sheets so the rule
 * that matters is written once: **a family row is navigation, never a
 * choice.** It carries no selection control, no `aria-pressed`, and its click
 * handler only opens and closes. Everything selectable is a concrete version.
 */

/** How many groups a sheet renders before asking the user to narrow. */
export const PICKER_GROUP_LIMIT = 60;

/**
 * Everything a picker can offer: the bundled catalogue plus the user's own
 * exercises. Name-only entries are deliberately absent — a picked row is
 * written into the program as a catalogue reference, and a name has no id to
 * write.
 */
export function useSelectableCatalogGroups(): CatalogGroup[] {
  const { context, resolve } = useExerciseNormalization();

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

  return useMemo(() => groupCatalogItems(selectable, resolve), [selectable, resolve]);
}

function matchesMuscle(version: SelectableExercise, muscle: string): boolean {
  return version.catalogItem?.muscles.primary.includes(muscle) ?? false;
}

export function filterGroupsByMuscle(groups: readonly CatalogGroup[], muscle: string): CatalogGroup[] {
  const filtered: CatalogGroup[] = [];
  for (const group of groups) {
    const versions = group.versions.filter((version) => matchesMuscle(version, muscle));
    if (versions.length === 0) continue;
    filtered.push({
      ...group,
      versions,
      matchedVersionIds: group.matchedVersionIds.filter((id) => versions.some((v) => v.id === id)),
    });
  }
  return filtered;
}

export function usePickerGroups(query: string, muscleFilter: string | null): CatalogGroup[] {
  const allGroups = useSelectableCatalogGroups();
  return useMemo(() => {
    const searched = searchCatalogGroups(allGroups, query);
    return muscleFilter ? filterGroupsByMuscle(searched, muscleFilter) : searched;
  }, [allGroups, query, muscleFilter]);
}

/**
 * What a picked row hands back to the caller. A user exercise has no catalogue
 * entry, so it is described in the same shape — the caller stores its id and
 * name exactly as it does for a bundled one.
 */
export function catalogItemForVersion(version: SelectableExercise): ExerciseCatalogItem {
  return (
    version.catalogItem ?? {
      id: version.id,
      name: version.name,
      aliases: [],
      equipment: [],
      movementPatterns: [],
      muscles: { primary: [], secondary: [] },
      tags: [],
      movementModifierIds: [],
    }
  );
}

function VersionRow({
  version,
  selected,
  matched,
  nested,
  mark,
  onSelect,
}: {
  version: SelectableExercise;
  selected: boolean;
  matched: boolean;
  nested: boolean;
  mark: "check" | "radio";
  onSelect: () => void;
}) {
  const item = version.catalogItem;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-matched={matched ? "true" : "false"}
      className="w-full flex items-center gap-3 py-2 border-b text-left"
      style={{
        borderColor: "var(--line)",
        paddingLeft: nested ? 20 : 0,
        background: matched && !selected ? "var(--accent-soft)" : "transparent",
      }}
    >
      {mark === "check" ? (
        <div
          className="flex items-center justify-center rounded shrink-0"
          style={{
            width: 22,
            height: 22,
            background: selected ? "var(--accent)" : "var(--bg-3)",
            border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
          }}
        >
          {selected && <Check size={12} style={{ color: "var(--bg-1)" }} />}
        </div>
      ) : (
        <div
          className="shrink-0 rounded-full"
          style={{
            width: 10,
            height: 10,
            background: selected ? "var(--accent)" : "var(--bg-3)",
            border: `2px solid ${selected ? "var(--accent)" : "var(--line)"}`,
          }}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{toTitleCase(version.name)}</p>
        <p
          className="text-[10px] truncate"
          style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}
        >
          {item
            ? `${item.muscles.primary.slice(0, 2).join(" · ")}${item.equipment[0] ? ` · ${item.equipment[0]}` : ""}`
            : "your exercise"}
        </p>
      </div>
    </button>
  );
}

function FamilyRows({
  group,
  selectedIds,
  mark,
  onSelectVersion,
}: {
  group: CatalogGroup;
  selectedIds: ReadonlySet<string>;
  mark: "check" | "radio";
  onSelectVersion: (version: SelectableExercise) => void;
}) {
  // Open only when the query reached inside the family. A query that matched
  // the family's own name has not asked for a version yet, so the family stays
  // one quiet row.
  //
  // Derived from the current match, not seeded once: the row is mounted while
  // the user is still typing, so a `useState(...)` seed would freeze whatever
  // the half-typed query happened to match. The user's own click wins until the
  // query changes what the automatic answer would be.
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
        className="w-full flex items-center gap-3 py-2 border-b text-left"
        style={{ borderColor: "var(--line)" }}
      >
        <span
          className="shrink-0 text-center"
          style={{ width: 22, color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 13 }}
        >
          ⌸
        </span>
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{group.name}</span>
        <span
          className="shrink-0 text-[10px]"
          style={{ color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}
        >
          {count}
        </span>
        <span className="shrink-0" style={{ color: "var(--fg-4)" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && group.versions.map((version) => (
        <VersionRow
          key={version.id}
          version={version}
          selected={selectedIds.has(version.id)}
          matched={group.matchedVersionIds.includes(version.id)}
          nested
          mark={mark}
          onSelect={() => onSelectVersion(version)}
        />
      ))}
    </div>
  );
}

export function NestedExerciseList({
  groups,
  selectedIds,
  mark,
  onSelectVersion,
  limit = PICKER_GROUP_LIMIT,
}: {
  groups: readonly CatalogGroup[];
  selectedIds: ReadonlySet<string>;
  mark: "check" | "radio";
  onSelectVersion: (version: SelectableExercise) => void;
  limit?: number;
}) {
  if (groups.length === 0) {
    return <p className="muted text-sm text-center py-8">No exercises match</p>;
  }

  const shown = groups.slice(0, limit);
  const hidden = groups.length - shown.length;

  return (
    <>
      {shown.map((group) =>
        group.standalone ? (
          group.versions.map((version) => (
            <VersionRow
              key={version.id}
              version={version}
              selected={selectedIds.has(version.id)}
              matched={group.matchedVersionIds.includes(version.id)}
              nested={false}
              mark={mark}
              onSelect={() => onSelectVersion(version)}
            />
          ))
        ) : (
          <FamilyRows
            key={group.id}
            group={group}
            selectedIds={selectedIds}
            mark={mark}
            onSelectVersion={onSelectVersion}
          />
        ),
      )}
      {hidden > 0 && (
        <p
          className="text-[10px] py-2"
          style={{ color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}
        >
          {hidden} more matches — keep typing to narrow
        </p>
      )}
    </>
  );
}
