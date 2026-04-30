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

  return {
    profile: profile ? 1 : 0,
    programs: programs.length,
    logs: logs.length,
    aliases: aliases.length,
    snapshots: snapshots.length,
    lastSnapshotAt,
    sizeKB: Math.round((storageEstimate.usage ?? 0) / 1024),
  };
}
