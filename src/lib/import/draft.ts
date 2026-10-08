import { applyProgramEdit, previewProgramEdit, type ProgramEdit, type ProgramEditContext, type ProgramEditPreview } from "@/lib/programs/edits";
import { validateProgram, type ProgramDiagnostic } from "@/lib/programs/validation";
import type { ImportReview } from "./parser";
import type { ProgramDocument } from "@/lib/programs/types";

const correctionCode = (code?: string) => Boolean(code && (code.endsWith("-coerced") || code.endsWith("-defaulted")));

export type ImportDraft = {
  originalJson: string;
  program: ProgramDocument;
  correctionHistory: ProgramDiagnostic[];
  currentWarnings: ProgramDiagnostic[];
  sourceWarnings: ProgramDiagnostic[];
  revision: number;
};

export function createImportDraft(review: ImportReview, originalJson: string): ImportDraft {
  const sourceWarnings = review.warnings as ProgramDiagnostic[];
  const correctionHistory = sourceWarnings.filter((warning) => correctionCode(warning.code));
  return {
    originalJson,
    program: structuredClone(review.program),
    correctionHistory,
    sourceWarnings,
    currentWarnings: currentWarnings(review.program, sourceWarnings),
    revision: 0,
  };
}

export function previewImportDraftEdit(
  draft: ImportDraft,
  edit: ProgramEdit,
  context: ProgramEditContext,
): ProgramEditPreview {
  return previewProgramEdit(draft.program, edit, context);
}

export function applyImportDraftEdit(
  draft: ImportDraft,
  edit: ProgramEdit,
  context: ProgramEditContext,
): ImportDraft {
  const preview = previewImportDraftEdit(draft, edit, context);
  return replaceDraftProgram(draft, applyProgramEdit(draft.program, preview));
}

export function replaceDraftProgram(draft: ImportDraft, program: ProgramDocument): ImportDraft {
  const persistedCorrections = (program.import?.warnings ?? []).filter(
    (warning): warning is ProgramDiagnostic => correctionCode(warning.code),
  );
  const correctionHistory = mergeDiagnostics(draft.correctionHistory, persistedCorrections);
  return {
    ...draft,
    program,
    correctionHistory,
    currentWarnings: currentWarnings(program, draft.sourceWarnings),
    revision: draft.revision + 1,
  };
}

function mergeDiagnostics(...groups: ProgramDiagnostic[][]): ProgramDiagnostic[] {
  const byKey = new Map<string, ProgramDiagnostic>();
  for (const diagnostic of groups.flat()) {
    const key = JSON.stringify([diagnostic.code, diagnostic.path, diagnostic.originalValue, diagnostic.replacementValue]);
    if (!byKey.has(key)) byKey.set(key, diagnostic);
  }
  return [...byKey.values()];
}

function currentWarnings(program: ProgramDocument, sourceWarnings: ProgramDiagnostic[]): ProgramDiagnostic[] {
  return [
    ...sourceWarnings.filter((warning) => !correctionCode(warning.code) && warning.code !== "superset-set-mismatch"),
    ...validateProgram(program),
  ];
}
