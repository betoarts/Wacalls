import { apiUrl } from "@/lib/api-base";

export interface BackupStats {
  dbSize: number;
  mediaCount: number;
  mediaSize: number;
  messageCount: number;
  chatCount: number;
  contactCount: number;
  userCount: number;
  sessionCount: number;
  createdAt: string;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  tablesRestored: number;
  mediaFilesRestored: number;
  preRestoreBackup: string;
}

export async function getBackupInfo(): Promise<BackupStats> {
  const res = await fetch(apiUrl("/api/backup/info"), {
    credentials: "include",
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export function getExportBackupUrl(includeMedia: boolean): string {
  return apiUrl(`/api/backup/export?includeMedia=${includeMedia ? "true" : "false"}`);
}

export async function importBackup(file: File): Promise<RestoreResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(apiUrl("/api/backup/import"), {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

