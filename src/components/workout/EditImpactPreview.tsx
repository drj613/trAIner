import type { ProgramEditPreview } from "@/lib/programs/edits";
import type { ImportWarning } from "@/lib/programs/types";

type Preview = Pick<ProgramEditPreview, "changes" | "preservedExceptions" | "unmappedTargets" | "validationResults">;

export function EditImpactPreview({ preview, includeExceptionDayIds = [], onIncludeExceptionDayIdsChange, warnings = [] }: {
  preview: Preview;
  includeExceptionDayIds?: string[];
  onIncludeExceptionDayIdsChange?: (dayIds: string[]) => void;
  warnings?: ImportWarning[];
}) {
  const exceptions = preview.preservedExceptions
    .filter((item) => item.reason.startsWith("Preserved"))
    .map((item) => ({ ...item, selectionId: item.selectionId ?? item.dayId }));
  return (
    <section className="panel stack" aria-label="Edit impact preview">
      <h3 className="font-bold">Review edit</h3>
      <p className="text-sm muted">{preview.changes.length} change{preview.changes.length === 1 ? "" : "s"} across {new Set(preview.changes.map((change) => change.dayId)).size} occurrence{new Set(preview.changes.map((change) => change.dayId)).size === 1 ? "" : "s"}.</p>
      {preview.changes.length > 0 && (
        <ul className="stack text-sm" style={{ gap: 6 }}>
          {preview.changes.map((change, index) => (
            <li key={`${change.dayId}-${change.elementId}-${change.field}-${index}`}>
              {change.weekNumber ? `Week ${change.weekNumber}` : "This occurrence"}: {change.field} {display(change.before)} → {display(change.after)}
            </li>
          ))}
        </ul>
      )}
      {exceptions.length > 0 && (
        <fieldset className="stack text-sm">
          <legend className="font-semibold">Preserve weekly differences by default</legend>
          {exceptions.map((item, index) => (
            <label key={`${item.selectionId}-${index}`}>
              <input type="checkbox" checked={includeExceptionDayIds.includes(item.selectionId)} onChange={() => {
                const next = includeExceptionDayIds.includes(item.selectionId)
                  ? includeExceptionDayIds.filter((id) => id !== item.selectionId)
                  : [...includeExceptionDayIds, item.selectionId];
                onIncludeExceptionDayIdsChange?.(next);
              }} />
              Apply to another occurrence too ({item.dayId}: {item.reason})
            </label>
          ))}
        </fieldset>
      )}
      {preview.preservedExceptions.length > 0 && (
        <ul className="stack text-xs muted" aria-label="Skipped occurrences">
          {preview.preservedExceptions.map((item, index) => <li key={`${item.dayId}-${item.reason}-${index}`}>Skipped occurrence {item.dayId}: {item.reason}</li>)}
        </ul>
      )}
      {preview.unmappedTargets.length > 0 && (
        <ul className="stack text-sm" aria-label="Unmapped targets">
          {preview.unmappedTargets.map((item, index) => <li key={`${item.dayId}-${index}`}>Could not update occurrence {item.dayId}: {item.reason}</li>)}
        </ul>
      )}
      {preview.validationResults.length > 0 && (
        <ul className="stack text-sm" aria-label="Resulting warnings">
          {preview.validationResults.map((warning, index) => <li key={`${warning.code}-${warning.path}-${index}`}>{warning.message}</li>)}
        </ul>
      )}
      {warnings.length > 0 && <ul className="stack text-sm" aria-label="Import warnings">{warnings.map((warning, index) => <li key={`${warning.path}-${index}`}>{warning.message}</li>)}</ul>}
    </section>
  );
}

function display(value: unknown): string {
  return value === undefined ? "cleared" : typeof value === "string" ? `“${value}”` : JSON.stringify(value);
}
