import { invoke } from "@tauri-apps/api/core";
import {
  COLOR_CATALOG,
  GARMENT_TYPES,
  PRODUCT_STATUSES,
  SIZE_CODES,
  TECHNIQUES,
  type AppSettings,
  type AssistantMessage,
  type ExtractedBrief,
  type ProductDraft,
} from "../types/product";
import { parseNaturalBrief } from "../lib/productLogic";
import { isTauri } from "./desktopService";

export interface OllamaStatus {
  connected: boolean;
  models: string[];
  error?: string;
}

export interface ProductAssistantResult {
  reply: string;
  data: ExtractedBrief;
  source: "ollama" | "local";
  model?: string;
  error?: string;
}

interface ProductAssistantContext {
  currentDraft: ProductDraft;
  products: ProductDraft[];
  messages: AssistantMessage[];
}

export const RECOMMENDED_OLLAMA_MODELS = [
  { name: "qwen3.5:4b", label: "Qwen 3.5 · 4B", kind: "local" },
  { name: "gemma3:4b", label: "Gemma 3 · 4B", kind: "local" },
  { name: "minimax-m3:cloud", label: "MiniMax M3 · Cloud", kind: "cloud" },
] as const;

function resolveOllamaEndpoint(endpoint: string) {
  if (typeof window === "undefined") return endpoint.replace(/\/$/, "");
  return isTauri() ? endpoint.replace(/\/$/, "") : "/ollama";
}

function parseRequestBody(body: RequestInit["body"] | undefined) {
  if (!body) return null;
  if (typeof body !== "string") {
    throw new Error("El puente local de Ollama solo acepta cuerpos JSON.");
  }
  return JSON.parse(body);
}

async function requestOllamaJson<T>(
  endpoint: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (isTauri()) {
    return invoke<T>("ollama_request", {
      endpoint,
      path,
      method: options.method || "GET",
      body: parseRequestBody(options.body),
    });
  }
  const response = await fetch(`${resolveOllamaEndpoint(endpoint)}${path}`, options);
  if (!response.ok) throw new Error(`Ollama respondió ${response.status}`);
  return response.json() as Promise<T>;
}

export async function checkOllamaStatus(endpoint = "http://localhost:11434"): Promise<OllamaStatus> {
  try {
    const data = await requestOllamaJson<{ models?: Array<{ name: string }> }>(endpoint, "/api/tags", {
      signal: AbortSignal.timeout(5000),
    });
    return {
      connected: true,
      models: data.models?.map((model) => model.name) ?? [],
    };
  } catch (error) {
    return {
      connected: false,
      models: [],
      error: error instanceof Error ? error.message : "Ollama no disponible",
    };
  }
}

export async function listLocalModels(endpoint?: string) {
  return (await checkOllamaStatus(endpoint)).models;
}

export async function warmOllamaModel(settings: AppSettings) {
  if (!settings.ollamaModel) throw new Error("No hay un modelo de Ollama seleccionado.");
  await requestOllamaJson(settings.ollamaEndpoint, "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.ollamaModel,
      prompt: "",
      stream: false,
      keep_alive: "30m",
      options: { num_ctx: 4096, num_predict: 1 },
    }),
    signal: AbortSignal.timeout(180000),
  });
}

function compactProduct(product: ProductDraft) {
  return {
    id: product.id,
    modelCode: product.modelCode,
    garmentType: product.garmentType,
    modelPrefix: product.modelPrefix,
    modelNumber: product.modelNumber,
    name: product.name,
    slug: product.slug,
    gender: product.gender,
    category: product.category,
    collectionDrop: product.collectionDrop,
    price: product.price,
    previousPrice: product.previousPrice,
    status: product.status,
    highlighted: product.highlighted,
    sortOrder: product.sortOrder,
    technique: product.technique,
    material: product.material,
    shortDescription: product.shortDescription,
    longDescription: product.longDescription,
    whatsappText: product.whatsappText,
    tags: product.tags,
    notes: product.notes,
    colors: product.colors,
    sizes: product.sizes,
    variants: product.variants.map(({ sku, colorCode, sizeCode, stock }) => ({
      sku,
      colorCode,
      sizeCode,
      stock,
    })),
    images: product.images.map(({ imageNumber, colorCode, role, approved, finalFilename }) => ({
      imageNumber,
      colorCode,
      role,
      approved,
      finalFilename,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function assistantPrompt(input: string, instructions: string, context: ProductAssistantContext) {
  const recentMessages = context.messages.slice(-10).map(({ role, content }) => ({ role, content }));
  const products = context.products.map(compactProduct);
  const totalStock = products.reduce(
    (total, product) =>
      total + product.variants.reduce((productTotal, variant) => productTotal + variant.stock, 0),
    0,
  );

  return `${instructions}

Sos la inteligencia operativa de ROXWANA Product Manager. La aplicación te entrega abajo su
contexto real: ficha activa, catálogo guardado, variantes, SKU, stock, imágenes y conversación.
Stock 0 significa stock indefinido o producto a pedido, no significa agotado.
Usalo para responder consultas y editar la ficha. No digas que necesitás "entrar" a otra pantalla:
si el dato figura en el contexto, ya lo tenés. Si no figura, decí con claridad que no está registrado.

Reglas:
- Respondé al pedido real del usuario con lenguaje natural, no con una confirmación prefabricada.
- Para preguntas sobre catálogo, stock, precios o SKU, calculá la respuesta usando la base incluida.
- Si el usuario modifica el producto activo, devolvé en "updates" sólo los campos que pidió cambiar.
- Si menciona una lista de colores o talles, esa lista reemplaza la selección actual.
- No inventes precio, stock, material, colección, proveedor ni técnica.
- Podés sugerir nombre, categoría, textos y prefijo de estilo cuando haya evidencia suficiente.
- Nunca generes el número de modelo ni el SKU final: el sistema los asigna y valida como únicos.
- ROXWANA no vende prendas oversize; no agregues ese término.
- Hacé como máximo una pregunta concreta cuando falte un dato necesario.
- No afirmes que guardaste, borraste o exportaste algo: esas acciones las ejecuta la aplicación.

Respondé SOLO JSON válido con esta forma:
{
  "reply": "respuesta natural y útil para mostrar en el chat",
  "updates": {
    "garmentType": "REM|BZO|CAM|MUS|PAN|GOR|ACC",
    "category": "string",
    "gender": "hombre|mujer|unisex|no_definido",
    "colors": ["NEG"],
    "sizes": ["S","M"],
    "technique": "DTF|Sublimación|Vinilo|Bordado|Sin estampa|No definido",
    "price": 29000,
    "previousPrice": 35000,
    "stockPerVariant": 2,
    "stockBySize": {"S": 2, "M": 4},
    "modelPrefix": "SRK",
    "name": "string",
    "material": "string",
    "collectionDrop": "string",
    "status": "draft|en_revision|aprobado|publicado|sin_producir|producido|agotado|pausado",
    "highlighted": true,
    "sortOrder": 1,
    "notes": "string",
    "styleKeywords": ["rock","urbano"],
    "shortDescription": "string",
    "longDescription": "string",
    "whatsappText": "string",
    "tags": ["string"]
  }
}
Omití de "updates" cualquier propiedad no solicitada o no confirmada. Para una consulta que no
edita la ficha, devolvé "updates": {}.

RESUMEN DE BASE:
${JSON.stringify({ productCount: products.length, totalStock })}

CATÁLOGO COMPLETO GUARDADO:
${JSON.stringify(products)}

FICHA ACTIVA:
${JSON.stringify(compactProduct(context.currentDraft))}

CONVERSACIÓN RECIENTE:
${JSON.stringify(recentMessages)}

MENSAJE ACTUAL:
${input}`;
}

function sanitizeBrief(value: unknown): ExtractedBrief {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const result: ExtractedBrief = {};
  if (typeof input.garmentType === "string" && input.garmentType in GARMENT_TYPES) {
    result.garmentType = input.garmentType as ExtractedBrief["garmentType"];
  }
  if (typeof input.category === "string") result.category = input.category.trim();
  if (
    typeof input.gender === "string" &&
    ["hombre", "mujer", "unisex", "no_definido"].includes(input.gender)
  ) {
    result.gender = input.gender as ExtractedBrief["gender"];
  }
  if (Array.isArray(input.colors)) {
    const colors = input.colors.filter(
      (color): color is keyof typeof COLOR_CATALOG =>
        typeof color === "string" && color in COLOR_CATALOG,
    );
    if (colors.length) result.colors = [...new Set(colors)];
  }
  if (Array.isArray(input.sizes)) {
    const sizes = input.sizes.filter(
      (size): size is (typeof SIZE_CODES)[number] =>
        typeof size === "string" && SIZE_CODES.includes(size as (typeof SIZE_CODES)[number]),
    );
    if (sizes.length) result.sizes = [...new Set(sizes)];
  }
  if (
    typeof input.technique === "string" &&
    TECHNIQUES.includes(input.technique as (typeof TECHNIQUES)[number])
  ) {
    result.technique = input.technique as ExtractedBrief["technique"];
  }
  if (typeof input.price === "number" && Number.isFinite(input.price)) result.price = input.price;
  if (input.previousPrice === null) result.previousPrice = null;
  else if (typeof input.previousPrice === "number" && Number.isFinite(input.previousPrice)) {
    result.previousPrice = input.previousPrice;
  }
  if (typeof input.stockPerVariant === "number" && Number.isFinite(input.stockPerVariant)) {
    result.stockPerVariant = Math.max(0, Math.trunc(input.stockPerVariant));
  }
  if (input.stockBySize && typeof input.stockBySize === "object") {
    const stockBySize = Object.fromEntries(
      Object.entries(input.stockBySize as Record<string, unknown>)
        .filter(
          ([size, stock]) =>
            SIZE_CODES.includes(size as (typeof SIZE_CODES)[number]) &&
            typeof stock === "number" &&
            Number.isFinite(stock),
        )
        .map(([size, stock]) => [size, Math.max(0, Math.trunc(stock as number))]),
    );
    if (Object.keys(stockBySize).length) result.stockBySize = stockBySize;
  }
  if (typeof input.modelPrefix === "string") {
    const prefix = input.modelPrefix.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (prefix) result.modelPrefix = prefix;
  }
  for (const field of [
    "name",
    "material",
    "collectionDrop",
    "notes",
    "shortDescription",
    "longDescription",
    "whatsappText",
  ] as const) {
    if (typeof input[field] === "string") result[field] = input[field].trim();
  }
  if (
    typeof input.status === "string" &&
    PRODUCT_STATUSES.includes(input.status as (typeof PRODUCT_STATUSES)[number])
  ) {
    result.status = input.status as ExtractedBrief["status"];
  }
  if (typeof input.highlighted === "boolean") result.highlighted = input.highlighted;
  if (typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)) {
    result.sortOrder = Math.trunc(input.sortOrder);
  }
  if (Array.isArray(input.styleKeywords)) {
    result.styleKeywords = input.styleKeywords.filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim()),
    );
  }
  if (Array.isArray(input.tags)) {
    result.tags = input.tags.filter(
      (item): item is string =>
        typeof item === "string" && Boolean(item.trim()) && !/^over\s*size$/i.test(item),
    );
  }
  return result;
}

function mergeBriefs(localData: ExtractedBrief, modelData: ExtractedBrief): ExtractedBrief {
  return {
    ...localData,
    ...modelData,
    colors: modelData.colors ?? localData.colors,
    sizes: modelData.sizes ?? localData.sizes,
    stockBySize: modelData.stockBySize ?? localData.stockBySize,
    styleKeywords: modelData.styleKeywords ?? localData.styleKeywords,
    name: modelData.name ?? localData.name,
    modelPrefix: modelData.modelPrefix ?? localData.modelPrefix,
  };
}

function extractionPrompt(input: string, instructions: string, currentDraft?: ProductDraft) {
  return `${instructions}

Actuá como editor de la ficha actual. Interpretá el mensaje como una modificación incremental.
Devolvé únicamente las propiedades que el usuario pidió agregar o cambiar. Si menciona talles o
colores, devolvé la lista completa indicada para reemplazar la selección actual. Respetá correcciones
como "cambiá", "ahora", "sacá" o "dejá". Nunca inventes material, stock, precio, colección,
proveedor ni técnica. El SKU definitivo lo genera el sistema.
ROXWANA actualmente no vende prendas oversize: ignorá ese estilo y nunca lo agregues al nombre,
las etiquetas ni las descripciones.

Respondé SOLO JSON válido con esta forma:
{
  "garmentType": "REM|BZO|CAM|MUS|PAN|GOR|ACC",
  "category": "string",
  "gender": "hombre|mujer|unisex|no_definido",
  "colors": ["NEG"],
  "sizes": ["S","M"],
  "technique": "DTF|Sublimación|Vinilo|Bordado|Sin estampa|No definido",
  "price": 29900,
  "previousPrice": 35000,
  "stockPerVariant": 2,
  "stockBySize": {"S": 2, "M": 4},
  "name": "string",
  "material": "string",
  "collectionDrop": "string",
  "status": "draft|en_revision|aprobado|publicado|sin_producir|producido|agotado|pausado",
  "highlighted": true,
  "sortOrder": 1,
  "notes": "string",
  "styleKeywords": ["rock","urbano"],
  "hasFrontPrint": true,
  "hasBackPrint": true
}

Omití las propiedades desconocidas.

Ficha actual:
${currentDraft ? JSON.stringify({
    garmentType: currentDraft.garmentType,
    category: currentDraft.category,
    gender: currentDraft.gender,
    colors: currentDraft.colors,
    sizes: currentDraft.sizes,
    technique: currentDraft.technique,
    price: currentDraft.price,
    previousPrice: currentDraft.previousPrice,
    stock: currentDraft.variants.map(({ colorCode, sizeCode, stock }) => ({ colorCode, sizeCode, stock })),
    name: currentDraft.name,
    material: currentDraft.material,
    collectionDrop: currentDraft.collectionDrop,
    status: currentDraft.status,
    highlighted: currentDraft.highlighted,
    sortOrder: currentDraft.sortOrder,
    notes: currentDraft.notes,
  }) : "Sin ficha previa"}

Mensaje:
${input}`;
}

async function ollamaJson<T>(
  prompt: string,
  settings: AppSettings,
  format: "json" | undefined = "json",
  images: string[] = [],
): Promise<T> {
  const payload = await requestOllamaJson<{ response: string }>(settings.ollamaEndpoint, "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.ollamaModel,
      prompt,
      stream: false,
      format,
      think: false,
      keep_alive: "30m",
      options: {
        temperature: 0.2,
        num_ctx: 4096,
        num_predict: 700,
      },
      ...(images.length ? { images } : {}),
    }),
    signal: AbortSignal.timeout(180000),
  });
  const cleaned = payload.response
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

export async function runProductAssistant(
  input: string,
  settings: AppSettings,
  context: ProductAssistantContext,
  images: string[] = [],
): Promise<ProductAssistantResult> {
  const localData = parseNaturalBrief(input);
  const status = await checkOllamaStatus(settings.ollamaEndpoint);
  if (!status.connected) {
    return {
      reply:
        "Ollama no está conectado. Apliqué únicamente los datos que pude reconocer con reglas locales; no voy a hacer pasar esa respuesta por inteligencia artificial.",
      data: localData,
      source: "local",
      error: status.error,
    };
  }
  if (!settings.ollamaModel || !status.models.includes(settings.ollamaModel)) {
    return {
      reply: `El modelo "${settings.ollamaModel || "sin seleccionar"}" no está disponible en Ollama. Elegí uno instalado desde Ajustes.`,
      data: localData,
      source: "local",
      error: "Modelo no disponible",
    };
  }

  try {
    const result = await ollamaJson<{ reply?: unknown; updates?: unknown }>(
      assistantPrompt(input, settings.assistantInstructions, context),
      settings,
      "json",
      images,
    );
    const modelData = sanitizeBrief(result.updates);
    const reply =
      typeof result.reply === "string" && result.reply.trim()
        ? result.reply.trim()
        : "Procesé el pedido con el modelo, pero no devolvió una respuesta legible.";
    return {
      reply,
      data: modelData,
      source: "ollama",
      model: settings.ollamaModel,
    };
  } catch (error) {
    return {
      reply:
        "El modelo de Ollama no logró completar la respuesta. Apliqué sólo lo detectado localmente y dejé el resto intacto.",
      data: localData,
      source: "local",
      model: settings.ollamaModel,
      error: error instanceof Error ? error.message : "Error de Ollama",
    };
  }
}

export async function extractProductFieldsFromNaturalInput(
  input: string,
  settings: AppSettings,
  images: string[] = [],
  currentDraft?: ProductDraft,
): Promise<{ data: ExtractedBrief; source: "ollama" | "local" }> {
  const localData = parseNaturalBrief(input);
  const status = await checkOllamaStatus(settings.ollamaEndpoint);
  if (status.connected && settings.ollamaModel) {
    try {
      const data = sanitizeBrief(await ollamaJson<ExtractedBrief>(
        extractionPrompt(input, settings.assistantInstructions, currentDraft),
        settings,
        "json",
        images,
      ));
      return {
        data: mergeBriefs(localData, data),
        source: "ollama",
      };
    } catch {
      // La extracción local mantiene el flujo disponible y no inventa datos.
    }
  }
  return { data: localData, source: "local" };
}

export async function generateProductDescription(
  draft: ProductDraft,
  settings: AppSettings,
  tone: string,
  instruction = "",
) {
  const prompt = `${settings.assistantInstructions}
Redactá para ROXWANA en español rioplatense. Tono: ${tone}.
${instruction ? `Pedido actual del usuario: ${instruction}` : "Generá una nueva versión de los textos."}
No inventes materiales ni prestaciones. No menciones ni sugieras prendas oversize.
Devolvé SOLO JSON:
{"shortDescription":"...","longDescription":"...","whatsappText":"...","tags":["..."]}
Datos: ${JSON.stringify({
    name: draft.name,
    garment: draft.garmentType,
    colors: draft.colors,
    technique: draft.technique,
    material: draft.material,
    tags: draft.tags,
    currentShortDescription: draft.shortDescription,
    currentLongDescription: draft.longDescription,
    currentWhatsappText: draft.whatsappText,
  })}`;
  const generated = await ollamaJson<{
    shortDescription: string;
    longDescription: string;
    whatsappText: string;
    tags: string[];
  }>(prompt, settings);
  const cleanText = (value: string) =>
    value
      .replace(/\b(?:de\s+)?calce\s+oversize\b/gi, "de identidad urbana")
      .replace(/\boversize\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  return {
    shortDescription: cleanText(generated.shortDescription),
    longDescription: cleanText(generated.longDescription),
    whatsappText: cleanText(generated.whatsappText),
    tags: generated.tags.filter((tag) => !/^over\s*size$/i.test(tag)),
  };
}

export async function reviseSingleField(
  field: "shortDescription" | "longDescription" | "whatsappText",
  currentValue: string,
  instruction: string,
  settings: AppSettings,
) {
  const prompt = `${settings.assistantInstructions}
Reescribí solo el campo "${field}" siguiendo esta indicación: ${instruction}
No inventes datos y no menciones ni sugieras prendas oversize. Devolvé SOLO JSON: {"value":"..."}
Texto actual: ${currentValue}`;
  const result = await ollamaJson<{ value: string }>(prompt, settings);
  return result.value
    .replace(/\b(?:de\s+)?calce\s+oversize\b/gi, "de identidad urbana")
    .replace(/\boversize\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function suggestProductField(
  field: keyof ProductDraft,
  draft: ProductDraft,
  settings: AppSettings,
) {
  const prompt = `${settings.assistantInstructions}
Sugerí un único valor para el campo "${field}" del producto.
Usá solamente los datos confirmados. Si no alcanza la información, devolvé el valor actual.
Respondé SOLO JSON válido: {"value":"..."}
Producto: ${JSON.stringify(draft)}`;
  const result = await ollamaJson<{ value: string }>(prompt, settings);
  return result.value;
}

export function askMissingQuestions(draft: ProductDraft) {
  return [
    {
      field: "garmentType",
      question: "¿Qué tipo de producto es?",
      required: true,
      missing: !draft.garmentType,
    },
    {
      field: "colors",
      question: "¿En qué color o colores está disponible?",
      required: true,
      missing: !draft.colors.length,
    },
    {
      field: "sizes",
      question: "¿Qué talles tiene disponibles?",
      required: true,
      missing: !draft.sizes.length,
    },
    {
      field: "price",
      question: "¿Qué precio tiene el producto?",
      required: true,
      missing: !draft.price,
    },
    {
      field: "material",
      question: "¿Cuál es el material exacto? Si no estás seguro, queda como No definido.",
      required: false,
      missing: !draft.material || draft.material === "No definido",
    },
    {
      field: "gender",
      question: "¿La prenda es para hombre, mujer o unisex?",
      required: false,
      missing: !draft.gender || draft.gender === "no_definido",
    },
    {
      field: "technique",
      question: "¿Qué técnica lleva: DTF, sublimación, vinilo, bordado o sin estampa?",
      required: false,
      missing: !draft.technique || draft.technique === "No definido",
    },
    {
      field: "name",
      question: "¿Qué nombre querés ponerle al producto?",
      required: false,
      missing: !draft.name,
    },
    {
      field: "stock",
      question: "¿Cuántas unidades hay disponibles por talle?",
      required: false,
      missing: !draft.variants.length,
    },
    {
      field: "collectionDrop",
      question: "¿Pertenece a algún drop o colección?",
      required: false,
      missing: !draft.collectionDrop,
    },
    {
      field: "images",
      question: "Falta asignar una imagen 01 como portada.",
      required: false,
      missing: !draft.images.some((image) => image.imageNumber === 1),
    },
  ].filter((item) => item.missing);
}
