"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import { normalizeExerciseName, toTitleCase } from "@/lib/catalog/normalize";
import { CUSTOM_ID, type ResolutionItem } from "@/lib/import/resolution";
import type { UserExerciseDocument } from "@/lib/programs/types";

type Props = {
  items: ResolutionItem[];
  resolutions: Record<string, string>;
  userExercises: UserExerciseDocument[];
  onChange: (path: string, canonicalId: string) => void;
  onAddToUserCatalog: (path: string, name: string) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
};

export function ResolutionStep({
  items,
  resolutions,
  userExercises,
  onChange,
  onAddToUserCatalog,
  onBack,
  onNext,
}: Props) {
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [searchState, setSearchState] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<Set<string>>(new Set());

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
    const catalogItem = exerciseCatalog.find((e) => e.id === id);
    if (catalogItem) return catalogItem.name;
    const userItem = userExercises.find((e) => e.id === id);
    return userItem?.name ?? id;
  }

  function getSearchResults(query: string) {
    if (!query.trim()) return [];
    const q = normalizeExerciseName(query);
    const catalogResults = exerciseCatalog
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

  async function handleCreate(path: string, name: string) {
    setAdding((prev) => new Set([...prev, path]));
    try {
      await onAddToUserCatalog(path, name);
      setSearchState((prev) => ({ ...prev, [path]: "" }));
    } finally {
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
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

      {/* Pending items */}
      {pending.length > 0 && (
        <div className="stack">
          <p className="tx-up text-[10px]">Needs attention</p>
          {pending.map((item) => (
            <PendingCard
              key={item.path}
              item={item}
              searchQuery={searchState[item.path] ?? ""}
              onSearchChange={(q) =>
                setSearchState((prev) => ({ ...prev, [item.path]: q }))
              }
              searchResults={getSearchResults(searchState[item.path] ?? "")}
              onSelect={(id) => {
                onChange(item.path, id);
                setSearchState((prev) => ({ ...prev, [item.path]: "" }));
              }}
              onKeepCustom={() => {
                onChange(item.path, CUSTOM_ID);
                setSearchState((prev) => ({ ...prev, [item.path]: "" }));
              }}
              onCreate={(name) => handleCreate(item.path, name)}
              adding={adding.has(item.path)}
            />
          ))}
        </div>
      )}

      {/* Auto-resolved items */}
      {resolved.length > 0 && (
        <div className="stack">
          <button
            type="button"
            className="flex items-center gap-1.5 tx-up text-[10px]"
            aria-expanded={autoExpanded}
            onClick={() => setAutoExpanded((v) => !v)}
          >
            {autoExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Auto-resolved ({resolved.length})
          </button>
          {autoExpanded &&
            resolved.map((item) => (
              <div key={item.path} className="panel flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs muted tx-mono">imported</p>
                  <p className="text-sm font-semibold">{item.rawName}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-xs muted tx-mono">resolved to</p>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {toTitleCase(getResolvedName(item.path))}
                  </p>
                  <button
                    type="button"
                    className="text-[11px] muted underline"
                    onClick={() => onChange(item.path, "")}
                  >
                    change
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Custom items */}
      {custom.length > 0 && (
        <div
          className="panel"
          style={{ background: "var(--bg-2)", borderStyle: "dashed" }}
        >
          <p className="tx-up text-[10px] mb-1">
            Importing as custom (no history tracking)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {custom.map((item) => (
              <span
                key={item.path}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
              >
                {item.rawName}
                <button
                  type="button"
                  title="Map to catalog"
                  onClick={() => onChange(item.path, "")}
                  style={{ color: "var(--fg-4)" }}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <p className="text-[10px] muted mt-1">
            Click × on any exercise above to map it to the catalog instead.
          </p>
        </div>
      )}

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

type PendingCardProps = {
  item: ResolutionItem;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: { id: string; name: string; isUser: boolean }[];
  onSelect: (id: string) => void;
  onKeepCustom: () => void;
  onCreate: (name: string) => Promise<void>;
  adding: boolean;
};

function PendingCard({
  item,
  searchQuery,
  onSearchChange,
  searchResults,
  onSelect,
  onKeepCustom,
  onCreate,
  adding,
}: PendingCardProps) {
  const showCreate = searchQuery.trim().length > 0 && searchResults.length === 0;

  return (
    <div className="panel stack">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs muted tx-mono">imported · {item.sectionType}</p>
          <p className="text-sm font-semibold">{item.rawName}</p>
        </div>
        <button
          type="button"
          className="button secondary shrink-0"
          style={{ fontSize: "0.7rem", padding: "2px 8px" }}
          onClick={onKeepCustom}
        >
          Keep as custom
        </button>
      </div>

      {item.suggestions.length > 0 && (
        <div className="stack">
          <p className="tx-up text-[10px]">Suggestions</p>
          {item.suggestions.map((s) => (
            <button
              key={s.exerciseId}
              type="button"
              className="flex items-center gap-2 text-left w-full px-2 py-1.5 rounded border text-xs transition-colors"
              style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
              onClick={() => onSelect(s.exerciseId)}
            >
              <span
                className="font-mono text-[11px] shrink-0"
                style={{ color: "var(--fg-3)" }}
              >
                ○
              </span>
              <span className="flex-1">{toTitleCase(s.name)}</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0"
                style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
              >
                {Math.round(s.score * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Inline search */}
      <div className="stack">
        <div
          className="flex items-center gap-2 rounded px-2 py-1.5"
          style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}
        >
          <Search size={12} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
          <input
            className="flex-1 bg-transparent outline-none text-xs"
            placeholder="Search catalog…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button type="button" onClick={() => onSearchChange("")}>
              <X size={11} style={{ color: "var(--fg-3)" }} />
            </button>
          )}
        </div>
        {searchQuery && searchResults.length > 0 && (
          <div
            className="rounded flex flex-col gap-1"
            style={{
              background: "var(--bg-3)",
              border: "1px solid var(--line)",
              padding: "4px",
            }}
          >
            {searchResults.map((r) => (
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
            onClick={() => onCreate(searchQuery.trim())}
          >
            <span className="flex-1">
              {adding
                ? "Creating…"
                : `Create "${searchQuery.trim()}" as exercise`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
