import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./desktopService";
import type { ProductDraft } from "../types/product";

export interface BackupStatus {
  available: boolean;
  backupExists: boolean;
  drivePath?: string;
  backupPath?: string;
  lastBackupAt?: string;
  productCount: number;
  fileCount: number;
  totalBytes: number;
  message: string;
}

export interface BackupOperationResult {
  status: BackupStatus;
  backedUp: boolean;
  restored: boolean;
  backupPath?: string;
  message: string;
}

const desktopOnlyStatus: BackupStatus = {
  available: false,
  backupExists: false,
  productCount: 0,
  fileCount: 0,
  totalBytes: 0,
  message: "El backup en Google Drive funciona desde la app de escritorio.",
};

async function callBackupApi<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.error || text || "No pude conectar con el servicio local de backup.");
  }
  return data as T;
}

export async function getBackupStatus(backupRoot?: string): Promise<BackupStatus> {
  try {
    return await callBackupApi<BackupStatus>("/api/backup/status", { backupRoot: backupRoot || null });
  } catch (apiError) {
    if (isTauri()) return invoke<BackupStatus>("backup_status", { backupRoot: backupRoot || null });
    return {
      ...desktopOnlyStatus,
      message: apiError instanceof Error ? apiError.message : desktopOnlyStatus.message,
    };
  }
}

export async function runBackup(backupRoot?: string, reason = "manual"): Promise<BackupOperationResult> {
  try {
    return await callBackupApi<BackupOperationResult>("/api/backup/run", {
      backupRoot: backupRoot || null,
      reason,
    });
  } catch (apiError) {
    if (isTauri()) {
      return invoke<BackupOperationResult>("run_backup", { backupRoot: backupRoot || null, reason });
    }
    return {
      status: {
        ...desktopOnlyStatus,
        message: apiError instanceof Error ? apiError.message : desktopOnlyStatus.message,
      },
      backedUp: false,
      restored: false,
      message: apiError instanceof Error ? apiError.message : desktopOnlyStatus.message,
    };
  }
}

export async function restoreBackup(backupRoot?: string): Promise<BackupOperationResult> {
  try {
    return await callBackupApi<BackupOperationResult>("/api/backup/restore", { backupRoot: backupRoot || null });
  } catch (apiError) {
    if (isTauri()) return invoke<BackupOperationResult>("restore_backup", { backupRoot: backupRoot || null });
    return {
      status: {
        ...desktopOnlyStatus,
        message: apiError instanceof Error ? apiError.message : desktopOnlyStatus.message,
      },
      backedUp: false,
      restored: false,
      message: apiError instanceof Error ? apiError.message : desktopOnlyStatus.message,
    };
  }
}

export function shouldRunAutomaticBackup(
  status: BackupStatus | null,
  products: ProductDraft[],
  frequencyDays: number,
) {
  if (!status?.available || products.length <= 0) return false;
  if (!status.backupExists || !status.lastBackupAt) return true;
  const lastBackup = new Date(status.lastBackupAt).getTime();
  if (!Number.isFinite(lastBackup)) return true;
  const latestLocalChange = latestProductChange(products);
  if (latestLocalChange <= lastBackup) return false;
  const safeFrequency = Math.max(1, frequencyDays || 3);
  return Date.now() - lastBackup >= safeFrequency * 24 * 60 * 60 * 1000;
}

export function latestProductChange(products: ProductDraft[]) {
  return Math.max(
    0,
    ...products.map((product) => new Date(product.updatedAt || product.createdAt).getTime() || 0),
  );
}

export function formatBackupDate(value?: string) {
  if (!value) return "Sin backup todavia";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatBackupSize(bytes: number) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
