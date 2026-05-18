import type { ProgramGroup } from "@/lib/programs/types";

type Props = {
  type: ProgramGroup["type"];
  notes?: string;
  /** Optional density: "compact" for the routine view, "default" for Today. */
  density?: "default" | "compact";
  children: React.ReactNode;
};

const LABELS: Record<Exclude<ProgramGroup["type"], "single">, string> = {
  superset: "SUPERSET",
  circuit: "CIRCUIT",
  "giant-set": "GIANT SET",
};

export function GroupRail({ type, notes, density = "default", children }: Props) {
  if (type === "single") return <div>{children}</div>;
  const label = LABELS[type];
  const railLeft = density === "compact" ? 10 : 14;
  const labelPadTop = density === "compact" ? 2 : 4;
  return (
    <div style={{ position: "relative", paddingLeft: railLeft, paddingTop: labelPadTop }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: density === "compact" ? 9 : 9.5,
          letterSpacing: "0.14em",
          color: "var(--fg-3)",
          textTransform: "uppercase",
          padding: density === "compact" ? "4px 10px 2px" : "6px 10px 4px",
        }}
      >
        <span style={{ width: 8, height: 1, background: "var(--line-2)" }} />
        <span>{label}{notes ? ` · ${notes}` : ""}</span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: density === "compact" ? 4 : 6,
          top: density === "compact" ? 18 : 26,
          bottom: 8,
          width: 2,
          background: "var(--line-2)",
          borderRadius: 1,
        }}
      />
      <div>{children}</div>
    </div>
  );
}
