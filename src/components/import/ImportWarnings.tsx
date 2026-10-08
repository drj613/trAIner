import type { ImportWarning } from "@/lib/programs/types";

type Props = {
  warnings: ImportWarning[];
  corrections?: ImportWarning[];
  onSelectTarget?: (targetId: string, affectedWeeks?: number[]) => void;
};

export function ImportWarnings({ warnings, corrections = [], onSelectTarget }: Props) {
  if (warnings.length === 0 && corrections.length === 0) return null;
  const groups = groupWarnings(warnings);
  const shownGroups = groups.slice(0, 3);
  const moreGroups = groups.slice(3);
  return (
    <section className="panel stack" aria-label="Import diagnostics">
      <h2 className="font-bold">Review notes</h2>
      {corrections.length > 0 && (
        <details>
          <summary className="text-sm">{corrections.length} correction{corrections.length === 1 ? "" : "s"} made to the imported input</summary>
          <ul className="stack mt-2" style={{ gap: 8 }}>
            {corrections.map((warning, index) => <WarningItem key={`${warning.code}-${warning.path}-${index}`} warning={warning} onSelectTarget={onSelectTarget} />)}
          </ul>
        </details>
      )}
      {warnings.length > 0 && (
        <>
          <ul className="stack" style={{ gap: 8 }}>
            {shownGroups.map((group) => <WarningGroup key={group.key} group={group} onSelectTarget={onSelectTarget} />)}
          </ul>
          {moreGroups.length > 0 && (
            <details>
              <summary className="text-sm">{moreGroups.length} more warning type{moreGroups.length === 1 ? "" : "s"}</summary>
              <ul className="stack mt-2" style={{ gap: 8 }}>
                {moreGroups.map((group) => <WarningGroup key={group.key} group={group} onSelectTarget={onSelectTarget} />)}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

type WarningGroupData = { key: string; message: string; warnings: ImportWarning[] };

function groupWarnings(warnings: ImportWarning[]): WarningGroupData[] {
  const groups = new Map<string, WarningGroupData>();
  for (const warning of warnings) {
    const key = JSON.stringify([warning.code ?? null, warning.message]);
    const existing = groups.get(key);
    if (existing) existing.warnings.push(warning);
    else groups.set(key, { key, message: warning.message, warnings: [warning] });
  }
  return [...groups.values()];
}

function WarningGroup({ group, onSelectTarget }: { group: WarningGroupData; onSelectTarget?: (targetId: string, affectedWeeks?: number[]) => void }) {
  if (group.warnings.length === 1) return <WarningItem warning={group.warnings[0]} onSelectTarget={onSelectTarget} />;
  return (
    <li className="text-sm stack" style={{ gap: 4 }}>
      <span>{group.message}</span>
      <details>
        <summary>{group.warnings.length} affected items</summary>
        <ul className="stack mt-2" style={{ gap: 6 }}>
          {group.warnings.map((warning, index) => (
            <li key={`${warning.path}-${warning.targetId ?? ""}-${index}`} className="flex flex-wrap items-baseline gap-2">
              <span className="muted text-xs">{warningLocation(warning, index)}</span>
              <ReviewButton warning={warning} onSelectTarget={onSelectTarget} />
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function warningLocation(warning: ImportWarning, index: number): string {
  const day = warning.path.match(/(?:^|\.)days\.(\d+)(?:@w(\d+))?/);
  const exercise = warning.path.match(/\.exercises\.(\d+)/);
  const weeks = warning.affectedWeeks ?? (day?.[2] ? [Number(day[2])] : []);
  return [
    day ? `Workout ${day[1]}` : `Item ${index + 1}`,
    exercise ? `Exercise ${Number(exercise[1]) + 1}` : null,
    weeks.length ? `${weeks.length === 1 ? "Week" : "Weeks"} ${weeks.join(", ")}` : null,
  ].filter(Boolean).join(" · ");
}

function WarningItem({ warning, onSelectTarget }: { warning: ImportWarning; onSelectTarget?: (targetId: string, affectedWeeks?: number[]) => void }) {
  return (
    <li className="text-sm" style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span>{warning.message}</span>
      <ReviewButton warning={warning} onSelectTarget={onSelectTarget} />
    </li>
  );
}

function ReviewButton({ warning, onSelectTarget }: { warning: ImportWarning; onSelectTarget?: (targetId: string, affectedWeeks?: number[]) => void }) {
  if (!warning.targetId || !onSelectTarget) return null;
  return <button className="button secondary" type="button" onClick={() => onSelectTarget(warning.targetId!, warning.affectedWeeks)}>Review</button>;
}
