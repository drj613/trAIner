"use client";

import { Download, Upload } from "lucide-react";
import { exportBackup, restoreBackup } from "@/lib/backup/backup";

export function SettingsClient() {
  async function downloadBackup() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trainer-backup-${backup.exportedAt}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function uploadBackup(file?: File) {
    if (!file) return;
    await restoreBackup(JSON.parse(await file.text()));
  }

  return (
    <div className="stack">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="panel stack">
        <button className="button" onClick={downloadBackup}>
          <Download size={18} /> Export Backup
        </button>
        <label className="button secondary">
          <Upload size={18} /> Restore Backup
          <input className="hidden" type="file" accept="application/json" onChange={(event) => uploadBackup(event.target.files?.[0])} />
        </label>
      </div>
    </div>
  );
}
