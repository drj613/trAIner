import { programRepo } from "@/lib/storage/programRepo";
import type { ProgramEditPreview } from "./edits";

/** Commits the reviewed program and any required historical prescription snapshots together. */
export function commitProgramEdit(preview: ProgramEditPreview) {
  return programRepo.commitEdit(preview);
}
