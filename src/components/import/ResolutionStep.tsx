"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import { normalizeExerciseName, toTitleCase } from "@/lib/catalog/normalize";
import {
  CUSTOM_ID,
  rememberableTarget,
  unrememberableReason,
  type ResolutionGroup,
  type ResolutionItem,
} from "@/lib/import/resolution";
import type { ExerciseSuggestion, UserExerciseDocument } from "@/lib/programs/types";

type SearchResult = { id: string; name: string; isUser: boolean };

// One search box's worth of plumbing, keyed by an arbitrary string so the same
// machinery serves a whole group and a single occurrence path.
type SearchBundle = {
  query: (key: string) => string;
  onQueryChange: (key: string, query: string) => void;
  results: (query: string) => SearchResult[];
  onCreate: (key: string, paths: string[], name: string) => Promise<void>;
  isAdding: (key: string) => boolean;
};

type Props = {
  items: ResolutionItem[];
  groups: ResolutionGroup[];
  /**
   * groupKey -> how many STORED exercises this group's decision changes. Not
   * the occurrence-path count: a base-day path expands into one stored
   * exercise per week-clone (see storedOccurrenceCounts).
   */
  storedCounts: Record<string, number>;
  resolutions: Record<string, string>;
  /** groupKey -> the user explicitly ticked Remember for this group. */
  remembered: Record<string, boolean>;
  userExercises: UserExerciseDocument[];
  onChange: (path: string, canonicalId: string) => void;
  onRememberChange: (groupKey: string, remember: boolean) => void;
  onAddToUserCatalog: (paths: string[], name: string) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
};

export function ResolutionStep({
  items,
  groups,
  storedCounts,
  resolutions,
  remembered,
  userExercises,
  onChange,
  onRememberChange,
  onAddToUserCatalog,
  onBack,
  onNext,
}: Props) {
  const [searchState, setSearchState] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [separated, setSeparated] = useState<Set<string>>(new Set());

  const itemsByPath = useMemo(
    () => new Map(items.map((item) => [item.path, item])),
    [items],
  );

  const resolved = useMemo(
    () => items.filter((i) => resolutions[i.path] && resolutions[i.path] !== CUSTOM_ID),
    [items, resolutions],
  );
  const pending = useMemo(
    () => items.filter((i) => !resolutions[i.path]),
    [items, resolutions],
  );
  const custom = useMemo(
    () => items.filter((i) => resolutions[i.path] === CUSTOM_ID),
    [items, resolutions],
  );

  const handled = resolved.length + custom.length;
  const progress = items.length > 0 ? (handled / items.length) * 100 : 100;
  const allHandled = pending.length === 0;

  function getResolvedName(path: string): string {
    const id = resolutions[path];
    if (!id || id === CUSTOM_ID) return "";
    const catalogItem = exerciseCatalog.find((e) => e.id === id); // Exact concrete metadata lookup; grouping is intentionally not performed here.
    if (catalogItem) return catalogItem.name;
    const userItem = userExercises.find((e) => e.id === id);
    return userItem?.name ?? id;
  }

  function getSearchResults(query: string): SearchResult[] {
    if (!query.trim()) return [];
    const q = normalizeExerciseName(query);
    const catalogResults = exerciseCatalog // Exact concrete metadata lookup; grouping is intentionally not performed here.
      .filter(
        (e) =>
          normalizeExerciseName(e.name).includes(q) ||
          e.aliases.some((a) => normalizeExerciseName(a).includes(q)),
      )
      .slice(0, 6)
      .map((e) => ({ id: e.id, name: e.name, isUser: false }));
    const userResults = userExercises
      .filter((e) => normalizeExerciseName(e.name).includes(q))
      .map((e) => ({ id: e.id, name: e.name, isUser: true }));
    return [...userResults, ...catalogResults].slice(0, 6);
  }

  async function handleCreate(key: string, paths: string[], name: string) {
    setAdding((prev) => new Set([...prev, key]));
    try {
      await onAddToUserCatalog(paths, name);
      setSearchState((prev) => ({ ...prev, [key]: "" }));
    } finally {
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const search: SearchBundle = {
    query: (key) => searchState[key] ?? "",
    onQueryChange: (key, query) => setSearchState((prev) => ({ ...prev, [key]: query })),
    results: getSearchResults,
    onCreate: handleCreate,
    isAdding: (key) => adding.has(key),
  };

  function clearQuery(key: string) {
    setSearchState((prev) => ({ ...prev, [key]: "" }));
  }

  return (
    <div className="stack">
      {/* Progress banner */}
      <div
        className="panel"
        style={{
          background:
            pending.length > 0 ? "rgba(var(--warn-rgb, 230,182,100), 0.08)" : "var(--bg-2)",
          borderColor: pending.length > 0 ? "var(--warn, #e6b664)" : "var(--line)",
        }}
      >
        <p className="text-sm font-semibold mb-1">
          {handled} of {items.length} handled
        </p>
        <p className="text-xs muted">
          {pending.length > 0
            ? `${pending.length} exercise${pending.length > 1 ? "s" : ""} need attention`
            : "All exercises resolved — ready to proceed."}
        </p>
        <div
          className="mt-2 h-1 rounded-full overflow-hidden"
          style={{ background: "var(--bg-3)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {/* One decision per repeated name. Every group stays on screen after it
          is decided: the selector doubles as the change affordance, and
          the Remember tick is only reachable once a version has been
          chosen. */}
      <div className="stack">
        {groups.map((group) => (
          <GroupCard
            key={group.groupKey}
            group={group}
            storedCount={storedCounts[group.groupKey]}
            itemsByPath={itemsByPath}
            resolutions={resolutions}
            remembered={remembered[group.groupKey] ?? false}
            resolvedName={getResolvedName}
            onChange={onChange}
            onRememberChange={onRememberChange}
            onClearQuery={clearQuery}
            search={search}
            separated={separated.has(group.groupKey)}
            onToggleSeparate={() =>
              setSeparated((prev) => {
                const next = new Set(prev);
                if (next.has(group.groupKey)) next.delete(group.groupKey);
                else next.add(group.groupKey);
                return next;
              })
            }
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex gap-2">
        <button type="button" className="button secondary flex-1" onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className="button flex-1"
          disabled={!allHandled}
          onClick={onNext}
        >
          Review import →
        </button>
      </div>
    </div>
  );
}

type GroupCardProps = {
  group: ResolutionGroup;
  storedCount: number | undefined;
  itemsByPath: Map<string, ResolutionItem>;
  resolutions: Record<string, string>;
  remembered: boolean;
  resolvedName: (path: string) => string;
  onChange: (path: string, canonicalId: string) => void;
  onRememberChange: (groupKey: string, remember: boolean) => void;
  onClearQuery: (key: string) => void;
  search: SearchBundle;
  separated: boolean;
  onToggleSeparate: () => void;
};

/**
 * One decision for every occurrence of a repeated name. Selecting a version
 * fans out to each occurrence's own path — the paths stay authoritative, so
 * `applyResolutions` keeps its name/path guards and a grouped choice cannot
 * bypass them.
 *
 * The Remember tick starts unticked on purpose: a choice made here is local to
 * this import, and only an explicit tick persists a global alias.
 */
function GroupCard({
  group,
  storedCount,
  itemsByPath,
  resolutions,
  remembered,
  resolvedName,
  onChange,
  onRememberChange,
  onClearQuery,
  search,
  separated,
  onToggleSeparate,
}: GroupCardProps) {
  const displayName = group.occurrences[0].rawName;
  const firstItem = itemsByPath.get(group.occurrences[0].path);
  const candidates = group.occurrences[0].candidates;
  // Reviewed candidate versions are a closed list, so they get a selector.
  // An unmatched name has only fuzzy suggestions, which stay suggestion-only
  // and keep the search/create affordances.
  const isVersionChoice = group.kind === "underspecified" && candidates.length > 0;
  const target = rememberableTarget(group, resolutions);
  // A tick that could never take effect is not offered. Deliberately NOT folded
  // into `rememberableTarget`: that value also drives the version selector, and
  // blanking it there would break the choice itself rather than the shortcut.
  //
  // Memoized on the name because `prepareImportName` compiles one regex per
  // phrase rule, and the search box's state lives in the parent — so without
  // this every card recompiles the whole rule set on every keystroke.
  const unrememberable = useMemo(() => unrememberableReason(displayName), [displayName]);
  const chosen = new Set(
    group.occurrences.map((o) => resolutions[o.path]).filter((id) => Boolean(id)),
  );
  const isSplit = chosen.size > 1;
  const paths = group.occurrences.map((o) => o.path);
  const decided = group.occurrences.every((o) => Boolean(resolutions[o.path]));
  const allCustom = group.occurrences.every((o) => resolutions[o.path] === CUSTOM_ID);

  function fanOut(canonicalId: string) {
    for (const path of paths) onChange(path, canonicalId);
    onClearQuery(group.groupKey);
  }

  return (
    <div
      className="panel stack"
      style={decided ? { background: "var(--bg-2)" } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs muted tx-mono">
            imported · {firstItem?.sectionType ?? "strength"}
          </p>
          <p className="text-sm font-semibold">{displayName}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {storedCount !== undefined && storedCount > 1 && (
            <span className="text-xs muted tx-mono">used {storedCount} times</span>
          )}
          {storedCount === 0 && (
            <span className="text-xs tx-mono" style={{ color: "var(--warn, #e6b664)" }}>
              won't apply — the routine's structure is ambiguous here
            </span>
          )}
          <button
            type="button"
            className="button secondary shrink-0"
            style={{ fontSize: "0.7rem", padding: "2px 8px" }}
            onClick={() => fanOut(allCustom ? "" : CUSTOM_ID)}
          >
            {allCustom ? "Map to catalog" : "Keep as custom"}
          </button>
        </div>
      </div>

      {allCustom ? (
        <p className="text-xs muted">Imported as custom — no history tracking.</p>
      ) : (
        <>
          {isVersionChoice && (
            <VersionSelect
              label={`Choose version for ${displayName}`}
              candidates={candidates}
              value={target}
              onSelect={fanOut}
            />
          )}

          {!isVersionChoice && decided && !isSplit && (
            <p className="text-xs">
              <span className="muted tx-mono">resolved to </span>
              <span className="font-semibold" style={{ color: "var(--accent)" }}>
                {toTitleCase(resolvedName(paths[0]))}
              </span>
            </p>
          )}

          {!isVersionChoice && !decided && (firstItem?.suggestions.length ?? 0) > 0 && (
            <div className="stack">
              <p className="tx-up text-[10px]">Suggestions</p>
              {firstItem?.suggestions.map((s) => (
                <SuggestionRow key={s.exerciseId} suggestion={s} onSelect={fanOut} />
              ))}
            </div>
          )}

          {!decided && (
            <SearchPicker
              searchKey={group.groupKey}
              paths={paths}
              search={search}
              onSelect={fanOut}
            />
          )}

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={remembered && target !== undefined && unrememberable === undefined}
                disabled={target === undefined || unrememberable !== undefined}
                onChange={(e) => onRememberChange(group.groupKey, e.target.checked)}
              />
              {/* The name is in the label, not just the row heading: two
                  ambiguous names on one screen are otherwise indistinguishable
                  to a screen reader and to a test. */}
              {rememberLabel(displayName, target === undefined ? undefined : resolvedName(paths[0]))}
            </label>
            <div className="flex items-center gap-2 shrink-0">
              {decided && !isVersionChoice && (
                <button
                  type="button"
                  className="text-[11px] muted underline"
                  onClick={() => fanOut("")}
                >
                  change
                </button>
              )}
              {group.occurrenceCount > 1 && (
                <button
                  type="button"
                  className="text-[11px] muted underline"
                  aria-expanded={separated}
                  onClick={onToggleSeparate}
                >
                  Resolve occurrences separately
                </button>
              )}
            </div>
          </div>
          {unrememberable !== undefined && (
            <p className="text-[10px]" style={{ color: "var(--warn, #e6b664)" }}>
              {unrememberable}
            </p>
          )}
          {isSplit && unrememberable === undefined && (
            <p className="text-[10px] muted">
              Different versions chosen — can't be remembered.
            </p>
          )}
        </>
      )}

      {separated && (
        <div className="stack" style={{ gap: 4 }}>
          <p className="tx-up text-[10px]">Occurrences</p>
          {group.occurrences.map((occurrence) =>
            isVersionChoice ? (
              <div key={occurrence.path} className="flex items-center gap-2">
                <span
                  className="text-[11px] muted tx-mono flex-1 truncate"
                  title={occurrence.path}
                >
                  {occurrence.path}
                </span>
                <VersionSelect
                  label={`Choose version for ${displayName} at ${occurrence.path}`}
                  candidates={candidates}
                  value={resolutions[occurrence.path]}
                  onSelect={(id) => onChange(occurrence.path, id)}
                  compact
                />
              </div>
            ) : (
              <div key={occurrence.path} className="stack" style={{ gap: 4 }}>
                <span
                  className="text-[11px] muted tx-mono truncate"
                  title={occurrence.path}
                >
                  {occurrence.path}
                </span>
                <SearchPicker
                  searchKey={occurrence.path}
                  paths={[occurrence.path]}
                  search={search}
                  onSelect={(id) => {
                    onChange(occurrence.path, id);
                    onClearQuery(occurrence.path);
                  }}
                />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The spec names this action `Remember this interpretation` (design ~443). The
 * shipped label names the exercise and the chosen version instead, because one
 * screen can carry several ambiguous names and the spec's wording makes every
 * one of their checkboxes read identically to a screen reader. The wording,
 * not the rule, moved; the shipped string is pinned by
 * `names the exercise and the chosen version in the Remember label`.
 */
function rememberLabel(displayName: string, targetName: string | undefined): string {
  const quoted = `Remember "${displayName}"`;
  return targetName ? `${quoted} as ${toTitleCase(targetName)}` : quoted;
}

function VersionSelect({
  label,
  candidates,
  value,
  onSelect,
  compact = false,
}: {
  label: string;
  candidates: ExerciseSuggestion[];
  value: string | undefined;
  onSelect: (canonicalId: string) => void;
  compact?: boolean;
}) {
  const known = candidates.some((c) => c.exerciseId === value);
  return (
    <select
      aria-label={label}
      className="input"
      style={compact ? { padding: "2px 6px", fontSize: "0.7rem", width: "auto" } : undefined}
      value={known ? value : ""}
      onChange={(e) => onSelect(e.target.value)}
    >
      <option value="">Choose version…</option>
      {candidates.map((candidate) => (
        <option key={candidate.exerciseId} value={candidate.exerciseId}>
          {toTitleCase(candidate.name)}
        </option>
      ))}
    </select>
  );
}

function SuggestionRow({
  suggestion,
  onSelect,
}: {
  suggestion: ExerciseSuggestion;
  onSelect: (canonicalId: string) => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 text-left w-full px-2 py-1.5 rounded border text-xs transition-colors"
      style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
      onClick={() => onSelect(suggestion.exerciseId)}
    >
      <span className="font-mono text-[11px] shrink-0" style={{ color: "var(--fg-3)" }}>
        ○
      </span>
      <span className="flex-1">{toTitleCase(suggestion.name)}</span>
      <span
        className="text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0"
        style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
      >
        {Math.round(suggestion.score * 100)}%
      </span>
    </button>
  );
}

function SearchPicker({
  searchKey,
  paths,
  search,
  onSelect,
}: {
  searchKey: string;
  paths: string[];
  search: SearchBundle;
  onSelect: (canonicalId: string) => void;
}) {
  const query = search.query(searchKey);
  const results = search.results(query);
  const adding = search.isAdding(searchKey);
  const showCreate = query.trim().length > 0 && results.length === 0;

  return (
    <div className="stack">
      <div
        className="flex items-center gap-2 rounded px-2 py-1.5"
        style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}
      >
        <Search size={12} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
        <input
          className="flex-1 bg-transparent outline-none text-xs"
          placeholder="Search catalog…"
          value={query}
          onChange={(e) => search.onQueryChange(searchKey, e.target.value)}
        />
        {query && (
          <button type="button" onClick={() => search.onQueryChange(searchKey, "")}>
            <X size={11} style={{ color: "var(--fg-3)" }} />
          </button>
        )}
      </div>
      {query && results.length > 0 && (
        <div
          className="rounded flex flex-col gap-1"
          style={{
            background: "var(--bg-3)",
            border: "1px solid var(--line)",
            padding: "4px",
          }}
        >
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex items-center gap-2 text-left w-full px-2 py-1.5 rounded border text-xs transition-colors"
              style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}
              onClick={() => onSelect(r.id)}
            >
              <span className="flex-1">{toTitleCase(r.name)}</span>
              {r.isUser && (
                <span
                  className="text-[10px] px-1 rounded font-mono shrink-0"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                  }}
                >
                  yours
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {showCreate && (
        <button
          type="button"
          className="flex items-center gap-2 text-left w-full px-2 py-1.5 rounded border text-xs transition-colors"
          style={{
            background: "var(--bg-2)",
            borderColor: "var(--line)",
            borderStyle: "dashed",
          }}
          disabled={adding}
          onClick={() => void search.onCreate(searchKey, paths, query.trim())}
        >
          <span className="flex-1">
            {adding ? "Creating…" : `Create "${query.trim()}" as exercise`}
          </span>
        </button>
      )}
    </div>
  );
}
