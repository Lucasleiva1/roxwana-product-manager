import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const PRODUCT_PACKAGE_ROOT = join(homedir(), "Documents", "ROXWANA Product Manager");
const BACKUP_FOLDER_NAME = "ROXWANA Product Manager Backup";

function safeName(value: string, fallback: string) {
  const clean = basename(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

function productPackageFolder(modelCode: string) {
  return join(PRODUCT_PACKAGE_ROOT, "productos", safeName(modelCode, "producto-sin-codigo"));
}

function decodeDataUrl(dataUrl: string) {
  const encoded = dataUrl.includes(",") ? dataUrl.split(",").pop() || "" : dataUrl;
  return Buffer.from(encoded, "base64");
}

function writeDataUrl(path: string, dataUrl: string) {
  writeFileSync(path, decodeDataUrl(dataUrl));
}

async function readRequestBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 250 * 1024 * 1024) throw new Error("El paquete supera el límite de 250 MB.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createFolderStructure(folder: string) {
  [
    "ficha",
    "imagenes/originales",
    "imagenes/webp",
    "imagenes/aprobadas",
    "estampas",
    "mockups",
    "codigos-barra",
    "impresion",
    "impresion/trabajos-para-impresion",
    "notas",
  ].forEach((relative) => mkdirSync(join(folder, relative), { recursive: true }));
}

function saveProductPackage(payload: any) {
  const modelCode = payload?.product?.modelCode || "producto-sin-codigo";
  const folder = productPackageFolder(modelCode);
  createFolderStructure(folder);

  writeFileSync(join(folder, "ficha", "product-sheet.txt"), payload.productSheet || "", "utf8");
  if (payload.webInfo) writeFileSync(join(folder, "ficha", "info-web.txt"), payload.webInfo, "utf8");
  writeFileSync(join(folder, "ficha", "product.json"), JSON.stringify(payload.product, null, 2), "utf8");
  if (payload.product?.notes) {
    writeFileSync(join(folder, "notas", "notas.txt"), String(payload.product.notes), "utf8");
  }

  for (const image of payload.images || []) {
    const originalName = safeName(image.originalName, `${image.id || "imagen"}-original`);
    const finalName = safeName(image.finalFilename, `${image.id || "imagen"}.webp`);
    const originalPath = join(folder, "imagenes", "originales", originalName);
    const webpPath = join(folder, "imagenes", "webp", finalName);
    if (image.originalDataUrl) writeDataUrl(originalPath, image.originalDataUrl);
    else if (image.originalPath && existsSync(image.originalPath)) copyFileSync(image.originalPath, originalPath);
    if (image.webpDataUrl) writeDataUrl(webpPath, image.webpDataUrl);
    else if (image.finalPath && existsSync(image.finalPath)) copyFileSync(image.finalPath, webpPath);
    if (image.approved && existsSync(webpPath)) {
      copyFileSync(webpPath, join(folder, "imagenes", "aprobadas", finalName));
    }
  }

  for (const barcode of payload.barcodes || []) {
    const sku = safeName(barcode.sku, "sku");
    if (barcode.svg) writeFileSync(join(folder, "codigos-barra", `${sku}.svg`), barcode.svg, "utf8");
    if (barcode.pngDataUrl) {
      const png = decodeDataUrl(barcode.pngDataUrl);
      writeFileSync(join(folder, "codigos-barra", `${sku}.png`), png);
      writeFileSync(join(folder, "impresion", `${sku}.png`), png);
    }
  }

  savePrintFiles(folder, payload.printFiles || []);

  return { folderPath: folder };
}

function savePrintFiles(productFolder: string, printFiles: any[]) {
  if (!printFiles.length) return;
  const folder = join(productFolder, "impresion", "trabajos-para-impresion");
  mkdirSync(folder, { recursive: true });
  for (const file of printFiles) {
    if (!file?.dataUrl) continue;
    const name = safeName(file.originalName, `${file.id || "archivo"}-impresion`);
    writeDataUrl(join(folder, name), file.dataUrl);
  }
}

function safeJsonResponse(response: import("node:http").ServerResponse, value: unknown) {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

function googleDriveCandidates() {
  const candidates = [
    join(homedir(), "Google Drive"),
    join(homedir(), "My Drive"),
    join(homedir(), "Mi unidad"),
    join(homedir(), "Google Drive", "My Drive"),
    join(homedir(), "Google Drive", "Mi unidad"),
  ];
  for (let code = "D".charCodeAt(0); code <= "Z".charCodeAt(0); code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    candidates.push(join(root, "My Drive"));
    candidates.push(join(root, "Mi unidad"));
    candidates.push(join(root, "Google Drive"));
  }
  return candidates;
}

function findGoogleDriveRoot() {
  return googleDriveCandidates().find((candidate) => existsSync(candidate));
}

function resolveBackupLocation(backupRoot?: string) {
  const configured = String(backupRoot || "").trim();
  if (configured) return { drivePath: dirname(configured), backupPath: configured };
  const drivePath = findGoogleDriveRoot();
  if (!drivePath) {
    throw new Error("No pude detectar Google Drive en esta PC. Abrilo una vez o configura la carpeta en Ajustes.");
  }
  return { drivePath, backupPath: join(drivePath, BACKUP_FOLDER_NAME) };
}

function backupManifestPath(backupPath: string) {
  return join(backupPath, "current", "manifest.json");
}

function readBackupManifest(backupPath: string) {
  const path = backupManifestPath(backupPath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function backupStatus(backupRoot?: string) {
  try {
    const { drivePath, backupPath } = resolveBackupLocation(backupRoot);
    const manifest = readBackupManifest(backupPath);
    return {
      available: true,
      backupExists: Boolean(manifest),
      drivePath,
      backupPath,
      lastBackupAt: manifest?.createdAt,
      productCount: manifest?.productCount || 0,
      fileCount: manifest?.fileCount || 0,
      totalBytes: manifest?.totalBytes || 0,
      message: manifest ? "Backup disponible en Google Drive." : "Google Drive detectado, todavia no hay backup.",
    };
  } catch (error) {
    return {
      available: false,
      backupExists: false,
      productCount: 0,
      fileCount: 0,
      totalBytes: 0,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function removePath(path: string) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

function replaceDirectory(next: string, current: string) {
  const previous = `${current}.previous`;
  removePath(previous);
  if (existsSync(current)) renameSync(current, previous);
  try {
    renameSync(next, current);
    removePath(previous);
  } catch (error) {
    if (existsSync(previous)) renameSync(previous, current);
    throw error;
  }
}

function copyDirectory(source: string, destination: string, summary: { fileCount: number; totalBytes: number }) {
  mkdirSync(destination, { recursive: true });
  if (!existsSync(source)) return;
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath, summary);
    } else if (entry.isFile()) {
      mkdirSync(dirname(destinationPath), { recursive: true });
      copyFileSync(sourcePath, destinationPath);
      const size = statSync(sourcePath).size;
      summary.fileCount += 1;
      summary.totalBytes += size;
    }
  }
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function databasePath() {
  return join(process.cwd(), "data", "roxwana.db");
}

function productCount() {
  const path = databasePath();
  if (!existsSync(path)) return 0;
  const db = new DatabaseSync(path);
  try {
    const row = db.prepare("SELECT COUNT(*) AS total FROM products").get() as { total?: number } | undefined;
    return Number(row?.total || 0);
  } catch {
    return 0;
  } finally {
    db.close();
  }
}

function writeDatabaseBackup(destination: string, summary: { fileCount: number; totalBytes: number }) {
  const source = databasePath();
  if (!existsSync(source)) return;
  mkdirSync(dirname(destination), { recursive: true });
  removePath(destination);
  const db = new DatabaseSync(source);
  try {
    db.exec(`VACUUM INTO ${sqlString(destination)}`);
  } finally {
    db.close();
  }
  if (existsSync(destination)) {
    summary.fileCount += 1;
    summary.totalBytes += statSync(destination).size;
  }
}

function normalizeRestoredDatabasePaths() {
  const path = databasePath();
  if (!existsSync(path)) return;
  const db = new DatabaseSync(path);
  try {
    const rows = db
      .prepare("SELECT id, model_code, product_json FROM products")
      .all() as Array<{ id: string; model_code: string; product_json: string }>;
    const update = db.prepare("UPDATE products SET product_folder_path = ?, product_json = ? WHERE id = ?");
    for (const row of rows) {
      const folder = productPackageFolder(row.model_code);
      const product = JSON.parse(row.product_json);
      product.images = (product.images || []).map((image: any) => {
        const originalName = safeName(image.originalName, "imagen-original");
        const finalName = safeName(image.finalFilename, "imagen.webp");
        const { previewUrl, ...next } = image;
        return {
          ...next,
          originalPath: join(folder, "imagenes", "originales", originalName),
          finalPath: join(folder, "imagenes", "webp", finalName),
        };
      });
      update.run(folder, JSON.stringify(product), row.id);
    }
  } finally {
    db.close();
  }
}

function runDevBackup(backupRoot?: string, reason = "manual") {
  const { backupPath } = resolveBackupLocation(backupRoot);
  const current = join(backupPath, "current");
  const next = join(backupPath, "current.tmp");
  const summary = { fileCount: 0, totalBytes: 0 };
  mkdirSync(backupPath, { recursive: true });
  removePath(next);
  mkdirSync(join(next, "data"), { recursive: true });
  writeDatabaseBackup(join(next, "data", "roxwana.db"), summary);
  copyDirectory(join(PRODUCT_PACKAGE_ROOT, "productos"), join(next, "productos"), summary);
  const manifest = {
    appName: "ROXWANA Product Manager",
    backupVersion: 1,
    createdAt: new Date().toISOString(),
    reason,
    sourceDatabasePath: databasePath(),
    sourceProductRoot: join(PRODUCT_PACKAGE_ROOT, "productos"),
    productCount: productCount(),
    fileCount: summary.fileCount,
    totalBytes: summary.totalBytes,
  };
  writeFileSync(join(next, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  replaceDirectory(next, current);
  return {
    status: backupStatus(backupRoot),
    backedUp: true,
    restored: false,
    backupPath,
    message: "Backup guardado en Google Drive.",
  };
}

function restoreDevBackup(backupRoot?: string) {
  const { backupPath } = resolveBackupLocation(backupRoot);
  const current = join(backupPath, "current");
  const dbBackup = join(current, "data", "roxwana.db");
  if (!existsSync(dbBackup)) throw new Error("El backup no tiene la base roxwana.db.");
  mkdirSync(dirname(databasePath()), { recursive: true });
  copyFileSync(dbBackup, databasePath());
  const productsBackup = join(current, "productos");
  const productsRoot = join(PRODUCT_PACKAGE_ROOT, "productos");
  const nextProducts = `${productsRoot}.restore.tmp`;
  removePath(nextProducts);
  const summary = { fileCount: 0, totalBytes: 0 };
  copyDirectory(productsBackup, nextProducts, summary);
  replaceDirectory(nextProducts, productsRoot);
  normalizeRestoredDatabasePaths();
  return {
    status: backupStatus(backupRoot),
    backedUp: false,
    restored: true,
    backupPath,
    message: "Backup restaurado desde Google Drive.",
  };
}

function deleteProductRecord(productId: string) {
  const db = new DatabaseSync(join(process.cwd(), "data", "roxwana.db"));
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    const row = db
      .prepare("SELECT model_code FROM products WHERE id = ?")
      .get(productId) as { model_code?: string } | undefined;
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare("DELETE FROM ai_messages WHERE product_id = ?").run(productId);
      db.prepare("DELETE FROM product_images WHERE product_id = ?").run(productId);
      db.prepare("DELETE FROM variants WHERE product_id = ?").run(productId);
      const result = db.prepare("DELETE FROM products WHERE id = ?").run(productId);
      db.exec("COMMIT;");
      return {
        deleted: result.changes > 0,
        modelCode: row?.model_code || "",
      };
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  } finally {
    db.close();
  }
}

function deleteProductFolder(modelCode: string) {
  if (!modelCode) return true;
  const folder = productPackageFolder(modelCode);
  const root = join(PRODUCT_PACKAGE_ROOT, "productos");
  if (folder.startsWith(root) && existsSync(folder)) {
    rmSync(folder, { recursive: true, force: true });
  }
  return !existsSync(folder);
}

function productPackagePlugin(): Plugin {
  return {
    name: "roxwana-product-package",
    configureServer(server) {
      server.middlewares.use("/api/backup/status", async (request, response) => {
        try {
          const payload = request.method === "POST" ? await readRequestBody(request) : {};
          safeJsonResponse(response, backupStatus(payload?.backupRoot));
        } catch (error) {
          response.statusCode = 500;
          safeJsonResponse(response, { error: error instanceof Error ? error.message : String(error) });
        }
      });

      server.middlewares.use("/api/backup/run", async (request, response) => {
        try {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method Not Allowed");
            return;
          }
          const payload = await readRequestBody(request);
          safeJsonResponse(response, runDevBackup(payload?.backupRoot, payload?.reason || "manual"));
        } catch (error) {
          response.statusCode = 500;
          safeJsonResponse(response, { error: error instanceof Error ? error.message : String(error) });
        }
      });

      server.middlewares.use("/api/backup/restore", async (request, response) => {
        try {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method Not Allowed");
            return;
          }
          const payload = await readRequestBody(request);
          safeJsonResponse(response, restoreDevBackup(payload?.backupRoot));
        } catch (error) {
          response.statusCode = 500;
          safeJsonResponse(response, { error: error instanceof Error ? error.message : String(error) });
        }
      });

      server.middlewares.use("/api/product-package", async (request, response) => {
        try {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method Not Allowed");
            return;
          }
          const payload = await readRequestBody(request);
          const result = saveProductPackage(payload);
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(result));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use("/api/product-package-path", (request, response) => {
        const url = new URL(request.url || "", "http://127.0.0.1");
        const folderPath = productPackageFolder(url.searchParams.get("modelCode") || "");
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ folderPath }));
      });

      server.middlewares.use("/api/product-print-files", async (request, response) => {
        try {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method Not Allowed");
            return;
          }
          const payload = await readRequestBody(request);
          const folder = productPackageFolder(payload?.modelCode || "");
          createFolderStructure(folder);
          savePrintFiles(folder, payload?.printFiles || []);
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ folderPath: join(folder, "impresion", "trabajos-para-impresion") }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use("/api/delete-product-package", async (request, response) => {
        try {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method Not Allowed");
            return;
          }
          const payload = await readRequestBody(request);
          const folder = productPackageFolder(payload?.modelCode || "");
          const root = join(PRODUCT_PACKAGE_ROOT, "productos");
          if (folder.startsWith(root) && existsSync(folder)) {
            rmSync(folder, { recursive: true, force: true });
          }
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ deleted: true }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use("/api/delete-product", async (request, response) => {
        try {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method Not Allowed");
            return;
          }
          const payload = await readRequestBody(request);
          const productId = String(payload?.productId || "");
          if (!productId) {
            response.statusCode = 400;
            response.end("Falta el id del producto.");
            return;
          }
          const record = deleteProductRecord(productId);
          const modelCode = record.modelCode || String(payload?.modelCode || "");
          const folderDeleted = deleteProductFolder(modelCode);
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ folderDeleted, deleted: record.deleted }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use("/api/open-product-package", async (request, response) => {
        try {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method Not Allowed");
            return;
          }
          const payload = await readRequestBody(request);
          const folderPath = productPackageFolder(payload.modelCode || "");
          if (!existsSync(folderPath)) {
            response.statusCode = 404;
            response.end("La carpeta del producto todavia no existe.");
            return;
          }
          execFile("explorer.exe", [folderPath]);
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ folderPath }));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), productPackagePlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/ollama": {
        target: "http://127.0.0.1:11434",
        changeOrigin: true,
        headers: {
          origin: "http://localhost:11434",
        },
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
      "/whisper": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/whisper/, ""),
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
