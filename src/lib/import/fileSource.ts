import { parseLooseJson } from "@/lib/import/sanitizeJson";

export const MAX_ROUTINE_FILE_BYTES = 5 * 1024 * 1024;

export type ImportFileResult =
  | { kind: "text"; text: string; fileName: string }
  | { kind: "error"; reason: "too-large" | "backup" | "read"; message: string };

const messages = {
  tooLarge: "This file is larger than the 5 MB import limit.",
  backup: "This is a workspace backup. Restore it in Settings.",
  read: "The selected file could not be read. Please choose it again or paste its contents.",
} as const;

export async function readImportFile(file: File): Promise<ImportFileResult> {
  if (file.size > MAX_ROUTINE_FILE_BYTES) {
    return { kind: "error", reason: "too-large", message: messages.tooLarge };
  }

  try {
    const contents = await file.text();
    const text = contents.startsWith("\uFEFF") ? contents.slice(1) : contents;
    const parsed = parseLooseJson(text);
    if (parsed.ok && isWorkspaceBackup(parsed.value)) {
      return { kind: "error", reason: "backup", message: messages.backup };
    }
    return { kind: "text", text, fileName: file.name };
  } catch {
    return { kind: "error", reason: "read", message: messages.read };
  }
}

function isWorkspaceBackup(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.programs) && Array.isArray(record.logs);
}
