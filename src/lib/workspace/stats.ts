import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { logRepo } from "@/lib/storage/logRepo";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { backupRepo } from "@/lib/storage/backupRepo";

export type WorkspaceStats = {
  profile: 0 | 1;
  programs: number;
  logs: number;
  aliases: number;
  snapshots: number;
  lastSnapshotAt: string | null;
  sizeKB: number;
  snapshotKB: number;
};

export async function loadWorkspaceStats(): Promise<WorkspaceStats> {
  const [profile, programs, logs, aliases, snapshots, storageEstimate] = await Promise.all([
    profileRepo.get(),
    programRepo.list(),
    logRepo.list(),
    aliasRepo.list(),
    backupRepo.list(),
    navigator.storage?.estimate?.() ?? Promise.resolve({ usage: 0 }),
  ]);

  const sorted = [...snapshots].sort((a, b) => b.id.localeCompare(a.id));
  const lastSnapshotAt = sorted[0]?.id ? sorted[0].id.slice(0, 10) : null;
  // Encoded byte length via Blob, not UTF-16 code-unit length (.length), so
  // "KB" in the UI actually means kilobytes rather than a smaller-looking
  // approximation of them. (TextEncoder isn't available in this repo's
  // jsdom test environment; Blob is, and both give byte-accurate UTF-8 size.)
  const snapshotKB = Math.round(
    snapshots.reduce((sum, s) => sum + new Blob([JSON.stringify(s)]).size, 0) / 1024,
  );

  return {
    profile: profile ? 1 : 0,
    programs: programs.length,
    logs: logs.length,
    aliases: aliases.length,
    snapshots: snapshots.length,
    lastSnapshotAt,
    sizeKB: Math.round((storageEstimate.usage ?? 0) / 1024),
    snapshotKB,
  };
}
