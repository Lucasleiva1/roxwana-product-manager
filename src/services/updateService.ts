import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "./desktopService";

export type UpdateCheckResult =
  | {
      status: "unavailable";
      message: string;
      currentVersion?: string;
    }
  | {
      status: "current";
      message: string;
      currentVersion: string;
    }
  | {
      status: "available";
      message: string;
      currentVersion: string;
      version: string;
      notes?: string;
      date?: string;
      update: Update;
    }
  | {
      status: "error";
      message: string;
      currentVersion?: string;
    };

export type UpdateInstallStatus =
  | { status: "downloading"; message: string; progress: number | null }
  | { status: "installing"; message: string; progress: number | null }
  | { status: "relaunching"; message: string; progress: number | null }
  | { status: "error"; message: string; progress: number | null };

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export async function getInstalledVersion() {
  if (!isTauri()) return "web-local";
  return getVersion();
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  if (!isTauri()) {
    return {
      status: "unavailable",
      message: "Las actualizaciones solo funcionan en la app de escritorio.",
      currentVersion: "web-local",
    };
  }

  let currentVersion = "";
  try {
    currentVersion = await getVersion();
    const update = await check({ timeout: 15000 });
    if (!update) {
      return {
        status: "current",
        message: "La app ya esta actualizada.",
        currentVersion,
      };
    }
    return {
      status: "available",
      message: `Nueva version disponible: ${update.version}.`,
      currentVersion: update.currentVersion || currentVersion,
      version: update.version,
      notes: update.body,
      date: update.date,
      update,
    };
  } catch (error) {
    return {
      status: "error",
      message: errorMessage(error, "No se pudo comprobar la actualizacion."),
      currentVersion,
    };
  }
}

export async function downloadAndInstallUpdate(
  update: Update,
  onStatus: (status: UpdateInstallStatus) => void,
) {
  let downloaded = 0;
  let total: number | undefined;

  try {
    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") {
        downloaded = 0;
        total = event.data.contentLength;
        onStatus({
          status: "downloading",
          message: "Descargando actualizacion...",
          progress: total ? 0 : null,
        });
      }
      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onStatus({
          status: "downloading",
          message: "Descargando actualizacion...",
          progress: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
        });
      }
      if (event.event === "Finished") {
        onStatus({
          status: "installing",
          message: "Instalando actualizacion...",
          progress: 100,
        });
      }
    });

    onStatus({
      status: "relaunching",
      message: "Reiniciando aplicacion...",
      progress: 100,
    });
    await relaunch();
  } catch (error) {
    onStatus({
      status: "error",
      message: errorMessage(error, "No se pudo instalar la actualizacion."),
      progress: null,
    });
  }
}
