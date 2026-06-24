import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const PRODUCT_PACKAGE_ROOT = join(homedir(), "Documents", "ROXWANA Product Manager");

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
          mkdirSync(folderPath, { recursive: true });
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
