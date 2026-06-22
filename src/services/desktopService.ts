import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import type { AppSettings, ProductDraft } from "../types/product";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = () => typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

const STORAGE_KEY = "roxwana-products-v1";

function readLocalProducts(): ProductDraft[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ProductDraft[];
  } catch {
    return [];
  }
}

function writeLocalProducts(products: ProductDraft[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

export async function initializeDesktop() {
  if (!isTauri()) return { mode: "browser" as const, databasePath: "localStorage" };
  return invoke<{ databasePath: string }>("initialize_database");
}

export async function saveProduct(product: ProductDraft) {
  if (isTauri()) {
    return invoke<{ folderPath: string }>("save_product", { product });
  }
  const products = readLocalProducts();
  const index = products.findIndex((item) => item.id === product.id);
  if (index >= 0) products[index] = product;
  else products.unshift(product);
  writeLocalProducts(products);
  return { folderPath: `product-files/${product.modelCode}` };
}

export async function listProducts(): Promise<ProductDraft[]> {
  if (isTauri()) return invoke<ProductDraft[]>("list_products");
  return readLocalProducts();
}

export async function searchProducts(query: string): Promise<ProductDraft[]> {
  if (isTauri()) return invoke<ProductDraft[]>("search_products", { query });
  const normalized = query.toLowerCase().trim();
  if (!normalized) return readLocalProducts();
  return readLocalProducts().filter((product) =>
    [
      product.name,
      product.modelCode,
      product.slug,
      product.technique,
      product.shortDescription,
      ...product.variants.map((variant) => `${variant.sku} ${variant.colorCode} ${variant.sizeCode}`),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

export async function suggestNextModel(prefix: string, garmentType: string): Promise<number> {
  if (isTauri()) return invoke<number>("suggest_next_model", { prefix, garmentType });
  const products = readLocalProducts().filter(
    (item) => item.modelPrefix === prefix && item.garmentType === garmentType,
  );
  return Math.max(0, ...products.map((item) => item.modelNumber)) + 1;
}

export async function createProductFolder(product: ProductDraft, productSheet: string) {
  if (isTauri()) {
    return invoke<{ folderPath: string }>("create_product_folder", { product, productSheet });
  }
  return {
    folderPath: `product-files/${product.modelCode}`,
    browserFallback: true,
  };
}

export async function saveProductFiles(product: ProductDraft, productSheet: string) {
  if (isTauri()) {
    return invoke<{ sheetPath: string }>("write_product_files", { product, productSheet });
  }
  const blob = new Blob([productSheet], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${product.modelCode}-product-sheet.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
  return { sheetPath: anchor.download };
}

export async function openProductFolder(path: string) {
  if (!isTauri()) return false;
  await openPath(path);
  return true;
}

export function exportProductJson(product: ProductDraft) {
  const blob = new Blob([JSON.stringify(product, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${product.modelCode}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function fileToWebp(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 2000;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la conversión WebP.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo convertir la imagen."))),
      "image/webp",
      0.9,
    ),
  );
}

export async function persistProductImage(
  modelCode: string,
  originalName: string,
  finalFilename: string,
  file: File,
) {
  if (!isTauri()) {
    return {
      originalPath: "",
      finalPath: "",
      previewUrl: URL.createObjectURL(file),
    };
  }
  const [originalBuffer, webpBlob] = await Promise.all([file.arrayBuffer(), fileToWebp(file)]);
  const webpBuffer = await webpBlob.arrayBuffer();
  const result = await invoke<{ originalPath: string; finalPath: string }>("save_product_image", {
    modelCode,
    originalName,
    finalFilename,
    originalBytes: Array.from(new Uint8Array(originalBuffer)),
    webpBytes: Array.from(new Uint8Array(webpBuffer)),
  });
  return {
    ...result,
    previewUrl: convertFileSrc(result.finalPath),
  };
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function saveBarcodeFiles(
  modelCode: string,
  sku: string,
  svg: string,
  pngDataUrl: string,
) {
  if (isTauri()) {
    return invoke<{ svgPath: string; pngPath: string }>("save_barcode_files", {
      modelCode,
      sku,
      svg,
      pngDataUrl,
    });
  }
  downloadBlob(`${sku}.svg`, new Blob([svg], { type: "image/svg+xml" }));
  const response = await fetch(pngDataUrl);
  downloadBlob(`${sku}.png`, await response.blob());
  return { svgPath: `${sku}.svg`, pngPath: `${sku}.png` };
}

export async function transcribeAudio(
  blob: Blob,
  context: string,
  settings: AppSettings,
): Promise<{ text: string; language: string }> {
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  if (!isTauri()) {
    const response = await fetch("http://127.0.0.1:8765/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "audio/wav",
        "X-Whisper-Language": settings.whisperLanguage,
        "X-Whisper-Context": encodeURIComponent(context.slice(-500)),
      },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) {
      throw new Error("El motor de voz de ROXWANA no está iniciado.");
    }
    return response.json() as Promise<{ text: string; language: string }>;
  }
  return invoke<{ text: string; language: string }>("transcribe_audio", {
    audioBytes: bytes,
    context,
    language: settings.whisperLanguage,
  });
}

export async function checkWhisperStatus() {
  if (isTauri()) return true;
  try {
    const response = await fetch("http://127.0.0.1:8765/health", {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}
