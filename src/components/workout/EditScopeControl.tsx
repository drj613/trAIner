import type { EditScope } from "@/lib/programs/edits";

export function EditScopeControl({ scope, onChange, title, dayNumber, atImport = false, disabled = false }: {
  scope: EditScope | null;
  onChange: (scope: EditScope) => void;
  title: string;
  dayNumber?: number;
  atImport?: boolean;
  disabled?: boolean;
}) {
  const label = title.trim() || `Day ${dayNumber ?? 1}`;
  const recurringLabel = atImport ? `Every occurrence of ${label}` : `Apply to remaining occurrences of ${label}`;
  return (
    <fieldset className="flex flex-wrap gap-3 text-sm">
      <legend className="muted">{atImport ? "Apply edits to" : "Edit scope"}</legend>
      <label><input type="radio" name="import-edit-scope" disabled={disabled} checked={scope === "occurrence"} onChange={() => onChange("occurrence")} /> This occurrence</label>
      <label><input type="radio" name="import-edit-scope" disabled={disabled} checked={scope === "routine-day"} onChange={() => onChange("routine-day")} /> {recurringLabel}</label>
    </fieldset>
  );
}
