import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { AppSettings, ProductDraft, ProductImage } from "../types/product";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = () => typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

const STORAGE_KEY = "roxwana-products-v1";
const DEV_PRODUCT_PACKAGE_ENDPOINT = "/api/product-package";

export interface ProductPackageImage {
  id: string;
  originalName: string;
  finalFilename: string;
  approved: boolean;
  originalPath?: string;
  finalPath?: string;
  originalDataUrl?: string;
  webpDataUrl?: string;
}

export interface ProductPackageBarcode {
  sku: string;
  svg: string;
  pngDataUrl: string;
}

export interface ProductPackagePrintFile {
  id: string;
  originalName: string;
  dataUrl?: string;
}

export interface ProductPackageWhatsAppImage {
  originalName: string;
  dataUrl: string;
}

export interface ProductPackagePayload {
  product: ProductDraft;
  productSheet: string;
  webInfo?: string;
  images: ProductPackageImage[];
  barcodes: ProductPackageBarcode[];
  printFiles?: ProductPackagePrintFile[];
  whatsappImage?: ProductPackageWhatsAppImage;
}

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

function normalizeProductDraft(product: ProductDraft): ProductDraft {
  return {
    ...product,
    publication: {
      whatsapp: Boolean(product.publication?.whatsapp),
      web: Boolean(product.publication?.web),
    },
  };
}

function hydrateDesktopProduct(product: ProductDraft): ProductDraft {
  const normalized = normalizeProductDraft(product);
  if (!isTauri()) return normalized;
  return {
    ...normalized,
    images: normalized.images.map((image) => ({
      ...image,
      previewUrl: image.finalPath ? convertFileSrc(image.finalPath) : undefined,
    })),
  };
}

function hydrateDesktopProducts(products: ProductDraft[]) {
  return products.map(hydrateDesktopProduct);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
}

export async function initializeDesktop() {
  if (!isTauri()) return { mode: "browser" as const, databasePath: "localStorage" };
  return invoke<{ databasePath: string }>("initialize_database");
}

export async function restartApp() {
  if (isTauri()) {
    await invoke<void>("restart_app");
    return;
  }
  window.location.reload();
}

export async function saveProduct(product: ProductDraft) {
  const normalized = normalizeProductDraft(product);
  if (isTauri()) {
    return invoke<{ folderPath: string }>("save_product", { product: packageProduct(normalized) });
  }
  const products = readLocalProducts();
  const index = products.findIndex((item) => item.id === normalized.id);
  if (index >= 0) products[index] = normalized;
  else products.unshift(normalized);
  writeLocalProducts(products);
  return { folderPath: `product-files/${normalized.modelCode}` };
}

export async function listProducts(): Promise<ProductDraft[]> {
  if (isTauri()) return hydrateDesktopProducts(await invoke<ProductDraft[]>("list_products"));
  return readLocalProducts().map(normalizeProductDraft);
}

export interface DeleteProductResult {
  folderDeleted: boolean;
  folderError?: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function deleteProduct(productId: string, modelCode?: string): Promise<DeleteProductResult> {
  const deleteViaDevServer = async () => {
    const response = await fetch("/api/delete-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, modelCode }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "No pude eliminar el producto.");
    }
    return response.json() as Promise<DeleteProductResult>;
  };

  if (isTauri()) {
    await withTimeout(
      invoke<void>("delete_product", { productId }),
      30000,
      "La eliminacion tardo demasiado. Cerra carpetas o archivos abiertos de ese producto e intenta de nuevo.",
    );
    return { folderDeleted: true };
  }
  try {
    return await deleteViaDevServer();
  } catch (error) {
    writeLocalProducts(readLocalProducts().filter((product) => product.id !== productId));
    return {
      folderDeleted: false,
      folderError: errorMessage(error, "No pude eliminar la carpeta del producto."),
    };
  }
}

export async function searchProducts(query: string): Promise<ProductDraft[]> {
  if (isTauri()) return hydrateDesktopProducts(await invoke<ProductDraft[]>("search_products", { query }));
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

function stripTransientImageData(image: ProductImage): ProductImage {
  const { previewUrl, ...rest } = image;
  return rest;
}

function packageProduct(product: ProductDraft): ProductDraft {
  const normalized = normalizeProductDraft(product);
  return {
    ...normalized,
    images: normalized.images.map(stripTransientImageData),
  };
}

async function postDevProductPackage(payload: ProductPackagePayload) {
  const response = await fetch(DEV_PRODUCT_PACKAGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, product: packageProduct(payload.product) }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "No pude crear el paquete del producto.");
  }
  return response.json() as Promise<{ folderPath: string }>;
}

export async function saveProductPackage(payload: ProductPackagePayload) {
  if (isTauri()) {
    return invoke<{ folderPath: string }>("save_product_package", {
      payload: { ...payload, product: packageProduct(payload.product) },
    });
  }
  try {
    return await postDevProductPackage(payload);
  } catch (devError) {
    throw devError;
  }
}

export async function savePrintFiles(modelCode: string, printFiles: ProductPackagePrintFile[]) {
  if (!printFiles.length) return { folderPath: "" };
  if (isTauri()) {
    return invoke<{ folderPath: string }>("save_print_files", { modelCode, printFiles });
  }
  try {
    const response = await fetch("/api/product-print-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelCode, printFiles }),
    });
    if (response.ok) return (await response.json()) as { folderPath: string };
  } catch {
    // Fall back to Tauri when the dev endpoint is not present.
  }
  return { folderPath: `Documentos/ROXWANA Product Manager/productos/${modelCode}/impresion/trabajos-para-impresion` };
}

export async function productPackageFolder(modelCode: string) {
  if (isTauri()) return invoke<{ folderPath: string }>("product_package_folder", { modelCode });
  try {
    const response = await fetch(`/api/product-package-path?modelCode=${encodeURIComponent(modelCode)}`);
    if (response.ok) return (await response.json()) as { folderPath: string };
  } catch {
    // Packaged builds do not expose the dev endpoint.
  }
  return { folderPath: `Documentos/ROXWANA Product Manager/productos/${modelCode}` };
}

export async function openProductPackageFolder(modelCode: string) {
  if (isTauri()) {
    return invoke<{ folderPath: string }>("open_product_package_folder", { modelCode });
  }
  try {
    const response = await fetch("/api/open-product-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelCode }),
    });
    if (response.ok) return (await response.json()) as { folderPath: string };
  } catch {
    // Fall back to Tauri opener when the dev endpoint is not present.
  }
  const result = await productPackageFolder(modelCode);
  return result;
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
  await invoke<void>("open_folder_path", { folderPath: path });
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
    const response = await fetch("/whisper/transcribe", {
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
    const response = await fetch("/whisper/health", {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}
