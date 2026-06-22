import { create } from "zustand";
import {
  applyBriefToDraft,
  generateDescriptions,
  generateVariants,
  makeEmptyDraft,
  makeModelCode,
  makeModelRaw,
  slugify,
} from "../lib/productLogic";
import type {
  AppSettings,
  AssistantMessage,
  ColorCode,
  ExtractedBrief,
  ProductDraft,
  ProductImage,
  SizeCode,
} from "../types/product";

const defaultInstructions = `Sos el asistente interno de ROXWANA Product Manager.
Tu trabajo es acelerar la creación de productos de indumentaria rock urbana.
Preguntá solo lo necesario, no inventes datos, y marcá como "No definido" lo que el usuario no confirmó.
Nunca decidas el SKU final: sugerí datos y dejá que el sistema valide la base local.
Usá español rioplatense claro, directo y sin exageraciones comerciales vacías.`;

interface ProductState {
  draft: ProductDraft;
  messages: AssistantMessage[];
  settings: AppSettings;
  manualMode: boolean;
  selectedTone: "rockera" | "comercial" | "minimal";
  folderPath: string;
  setDraft: (draft: ProductDraft) => void;
  patchDraft: (patch: Partial<ProductDraft>) => void;
  applyExtractedBrief: (brief: ExtractedBrief) => void;
  setColors: (colors: ColorCode[]) => void;
  setSizes: (sizes: SizeCode[]) => void;
  setVariantStock: (sku: string, stock: number) => void;
  addImage: (image: ProductImage) => void;
  patchImage: (id: string, patch: Partial<ProductImage>) => void;
  removeImage: (id: string) => void;
  regenerateDescriptions: (tone?: "rockera" | "comercial" | "minimal") => void;
  addMessage: (message: Omit<AssistantMessage, "id" | "timestamp">) => void;
  setManualMode: (manual: boolean) => void;
  setTone: (tone: "rockera" | "comercial" | "minimal") => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setFolderPath: (path: string) => void;
  resetDraft: () => void;
}

const settingsFromStorage = (): AppSettings => {
  const defaults: AppSettings = {
    ollamaModel: "qwen3.5:4b",
    ollamaEndpoint: "http://localhost:11434",
    assistantInstructions: defaultInstructions,
    productRoot: "product-files",
    whisperPythonPath:
      "C:\\Users\\jaell\\Desktop\\PAGINAS WEB Y APP\\wisperSolution\\ScribeFloat\\venv\\Scripts\\python.exe",
    whisperModel: "small",
    whisperLanguage: "es",
  };
  try {
    const stored = JSON.parse(localStorage.getItem("roxwana-settings-v1") || "{}");
    const settings = { ...defaults, ...stored };
    if (!settings.ollamaModel) settings.ollamaModel = defaults.ollamaModel;
    localStorage.setItem("roxwana-settings-v1", JSON.stringify(settings));
    return settings;
  } catch {
    return defaults;
  }
};

export const useProductStore = create<ProductState>((set, get) => ({
  draft: makeEmptyDraft(),
  messages: [
    {
      id: "assistant-welcome",
      role: "assistant",
      content:
        "Contame qué producto querés crear. También podés adjuntar una imagen o hablarme: voy a completar la ficha y preguntarte solo lo que falte.",
      timestamp: new Date().toISOString(),
    },
  ],
  settings: settingsFromStorage(),
  manualMode: false,
  selectedTone: "rockera",
  folderPath: "",
  setDraft: (draft) => set({ draft }),
  patchDraft: (patch) =>
    set((state) => {
      const next = { ...state.draft, ...patch, updatedAt: new Date().toISOString() };
      if (patch.name !== undefined && patch.slug === undefined) next.slug = slugify(patch.name);
      if (
        patch.garmentType !== undefined ||
        patch.modelPrefix !== undefined ||
        patch.modelNumber !== undefined
      ) {
        next.modelRaw = makeModelRaw(next.modelPrefix, next.modelNumber);
        next.modelCode = makeModelCode(next.garmentType, next.modelRaw);
        next.variants = generateVariants(
          next.modelCode,
          next.colors,
          next.sizes,
          state.draft.variants,
        );
      }
      return { draft: next };
    }),
  applyExtractedBrief: (brief) => set((state) => ({ draft: applyBriefToDraft(state.draft, brief) })),
  setColors: (colors) =>
    set((state) => ({
      draft: {
        ...state.draft,
        colors,
        variants: generateVariants(
          state.draft.modelCode,
          colors,
          state.draft.sizes,
          state.draft.variants,
        ),
      },
    })),
  setSizes: (sizes) =>
    set((state) => ({
      draft: {
        ...state.draft,
        sizes,
        variants: generateVariants(
          state.draft.modelCode,
          state.draft.colors,
          sizes,
          state.draft.variants,
        ),
      },
    })),
  setVariantStock: (sku, stock) =>
    set((state) => ({
      draft: {
        ...state.draft,
        variants: state.draft.variants.map((variant) =>
          variant.sku === sku ? { ...variant, stock: Math.max(0, stock) } : variant,
        ),
      },
    })),
  addImage: (image) =>
    set((state) => ({ draft: { ...state.draft, images: [...state.draft.images, image] } })),
  patchImage: (id, patch) =>
    set((state) => ({
      draft: {
        ...state.draft,
        images: state.draft.images.map((image) => (image.id === id ? { ...image, ...patch } : image)),
      },
    })),
  removeImage: (id) =>
    set((state) => ({
      draft: {
        ...state.draft,
        images: state.draft.images.filter((image) => image.id !== id),
      },
    })),
  regenerateDescriptions: (tone = get().selectedTone) =>
    set((state) => ({
      selectedTone: tone,
      draft: { ...state.draft, ...generateDescriptions(state.draft, tone) },
    })),
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...message, id: `message-${crypto.randomUUID()}`, timestamp: new Date().toISOString() },
      ],
    })),
  setManualMode: (manualMode) => set({ manualMode }),
  setTone: (selectedTone) => set({ selectedTone }),
  setSettings: (settings) =>
    set((state) => {
      const next = { ...state.settings, ...settings };
      localStorage.setItem("roxwana-settings-v1", JSON.stringify(next));
      return { settings: next };
    }),
  setFolderPath: (folderPath) => set({ folderPath }),
  resetDraft: () => set({ draft: makeEmptyDraft(), folderPath: "" }),
}));
