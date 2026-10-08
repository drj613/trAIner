import type { ImportWarning } from "@/lib/programs/types";

type Props = {
  warnings: ImportWarning[];
  corrections?: ImportWarning[];
  onSelectTarget?: (targetId: string, affectedWeeks?: number[]) => void;
};

export function ImportWarnings({ warnings, corrections = [], onSelectTarget }: Props) {
  if (warnings.length === 0 && corrections.length === 0) return null;
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
        <ul className="stack" style={{ gap: 8 }}>
          {warnings.map((warning, index) => <WarningItem key={`${warning.code}-${warning.path}-${index}`} warning={warning} onSelectTarget={onSelectTarget} />)}
        </ul>
      )}
    </section>
  );
}

function WarningItem({ warning, onSelectTarget }: { warning: ImportWarning; onSelectTarget?: (targetId: string, affectedWeeks?: number[]) => void }) {
  return (
    <li className="text-sm" style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span>{warning.message}</span>
      {warning.targetId && onSelectTarget && (
        <button className="button secondary" type="button" onClick={() => onSelectTarget(warning.targetId!, warning.affectedWeeks)}>
          Review
        </button>
      )}
    </li>
  );
}
