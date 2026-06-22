import type { AppSettings, ExtractedBrief, ProductDraft } from "../types/product";
import { parseNaturalBrief } from "../lib/productLogic";

export interface OllamaStatus {
  connected: boolean;
  models: string[];
  error?: string;
}

export const RECOMMENDED_OLLAMA_MODELS = [
  { name: "qwen3.5:4b", label: "Qwen 3.5 · 4B", kind: "local" },
  { name: "gemma3:4b", label: "Gemma 3 · 4B", kind: "local" },
  { name: "minimax-m3:cloud", label: "MiniMax M3 · Cloud", kind: "cloud" },
] as const;

export async function checkOllamaStatus(endpoint = "http://localhost:11434"): Promise<OllamaStatus> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { models?: Array<{ name: string }> };
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

function extractionPrompt(input: string, instructions: string) {
  return `${instructions}

Extraé únicamente datos expresados o inferibles con alta confianza. Nunca inventes material, stock,
precio, colección, proveedor o técnica. El SKU definitivo lo genera el sistema, no vos.

Respondé SOLO JSON válido con esta forma:
{
  "garmentType": "REM|BZO|CAM|MUS|PAN|GOR|ACC",
  "category": "string",
  "gender": "hombre|mujer|unisex|no_definido",
  "colors": ["NEG"],
  "sizes": ["S","M"],
  "technique": "DTF|Sublimación|Vinilo|Bordado|Sin estampa|No definido",
  "price": 29900,
  "stockPerVariant": 2,
  "modelPrefix": "SRK",
  "name": "string",
  "material": "string",
  "collectionDrop": "string",
  "styleKeywords": ["rock","urbano"],
  "hasFrontPrint": true,
  "hasBackPrint": true
}

Omití las propiedades desconocidas.

Brief:
${input}`;
}

async function ollamaJson<T>(
  prompt: string,
  settings: AppSettings,
  format: "json" | undefined = "json",
  images: string[] = [],
): Promise<T> {
  const response = await fetch(`${settings.ollamaEndpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.ollamaModel,
      prompt,
      stream: false,
      format,
      think: false,
      options: { temperature: 0.2 },
      ...(images.length ? { images } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Ollama respondió ${response.status}`);
  const payload = (await response.json()) as { response: string };
  return JSON.parse(payload.response) as T;
}

export async function extractProductFieldsFromNaturalInput(
  input: string,
  settings: AppSettings,
  images: string[] = [],
): Promise<{ data: ExtractedBrief; source: "ollama" | "local" }> {
  const status = await checkOllamaStatus(settings.ollamaEndpoint);
  if (status.connected && settings.ollamaModel) {
    try {
      const data = await ollamaJson<ExtractedBrief>(
        extractionPrompt(input, settings.assistantInstructions),
        settings,
        "json",
        images,
      );
      return { data, source: "ollama" };
    } catch {
      // La extracción local mantiene el flujo disponible y no inventa datos.
    }
  }
  return { data: parseNaturalBrief(input), source: "local" };
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
No inventes materiales ni prestaciones. Devolvé SOLO JSON:
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
  return ollamaJson<{
    shortDescription: string;
    longDescription: string;
    whatsappText: string;
    tags: string[];
  }>(prompt, settings);
}

export async function reviseSingleField(
  field: "shortDescription" | "longDescription" | "whatsappText",
  currentValue: string,
  instruction: string,
  settings: AppSettings,
) {
  const prompt = `${settings.assistantInstructions}
Reescribí solo el campo "${field}" siguiendo esta indicación: ${instruction}
No inventes datos. Devolvé SOLO JSON: {"value":"..."}
Texto actual: ${currentValue}`;
  const result = await ollamaJson<{ value: string }>(prompt, settings);
  return result.value;
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
      field: "gender",
      question: "¿La prenda es para hombre, mujer o unisex?",
      required: true,
      missing: draft.gender === "no_definido",
    },
    {
      field: "name",
      question: "¿Querés usar el nombre sugerido o escribir otro?",
      required: true,
      missing: !draft.name,
    },
    {
      field: "material",
      question: "¿Cuál es el material exacto? Si no estás seguro, queda como No definido.",
      required: false,
      missing: !draft.material || draft.material === "No definido",
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
