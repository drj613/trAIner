"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { exerciseCatalog, type ExerciseCatalogItem } from "@/lib/catalog/exercises";

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
            {item.name}
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

      {/* Groups */}
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
