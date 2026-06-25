export const GARMENT_TYPES = {
  REM: "Remera",
  BZO: "Buzo",
  CAM: "Campera",
  MUS: "Musculosa",
  PAN: "Pantalón",
  GOR: "Gorra",
  ACC: "Accesorio",
} as const;

export const COLOR_CATALOG = {
  BLA: { name: "Blanco", hex: "#f4f1e9" },
  NEG: { name: "Negro", hex: "#070809" },
  GRI: { name: "Gris", hex: "#787b80" },
  AZU: { name: "Azul", hex: "#244a73" },
  ROJ: { name: "Rojo", hex: "#8f2525" },
  VER: { name: "Verde", hex: "#344c38" },
  AMA: { name: "Amarillo", hex: "#d2ac47" },
  BEI: { name: "Beige", hex: "#c7ad86" },
} as const;

export const SIZE_CODES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
export const TECHNIQUES = [
  "DTF",
  "Sublimación",
  "Vinilo",
  "Bordado",
  "Sin estampa",
  "No definido",
] as const;

export const PRODUCT_STATUSES = [
  "draft",
  "en_revision",
  "aprobado",
  "publicado",
  "sin_producir",
  "producido",
  "agotado",
  "pausado",
] as const;

export type GarmentCode = keyof typeof GARMENT_TYPES;
export type ColorCode = keyof typeof COLOR_CATALOG;
export type SizeCode = (typeof SIZE_CODES)[number];
export type Technique = (typeof TECHNIQUES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export type ImageRole =
  | "portada"
  | "espalda remera"
  | "hover"
  | "costado"
  | "espalda modelo"
  | "detalle";

export interface ProductImage {
  id: string;
  colorCode: ColorCode;
  imageNumber: number;
  device: "desktop" | "mobile" | "base";
  role: ImageRole;
  originalName: string;
  originalPath?: string;
  finalFilename: string;
  finalPath?: string;
  previewUrl?: string;
  approved: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  colorCode: ColorCode;
  sizeCode: SizeCode;
  stock: number;
  barcodeValue: string;
}

export interface ProductDraft {
  id: string;
  modelCode: string;
  garmentType: GarmentCode | "";
  modelPrefix: string;
  modelNumber: number;
  modelRaw: string;
  name: string;
  slug: string;
  gender: "hombre" | "mujer" | "unisex" | "no_definido" | "";
  category: string;
  collectionDrop: string;
  price: number;
  previousPrice: number | null;
  status: ProductStatus;
  highlighted: boolean;
  sortOrder: number;
  technique: Technique | "";
  material: string;
  shortDescription: string;
  longDescription: string;
  whatsappText: string;
  tags: string[];
  notes: string;
  colors: ColorCode[];
  sizes: SizeCode[];
  variants: ProductVariant[];
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

export interface MissingQuestion {
  field: keyof ProductDraft | "images" | "stock";
  question: string;
  required: boolean;
  status: "pending" | "answered" | "optional";
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  source?: "ollama" | "local" | "system";
  model?: string;
}

export interface ExtractedBrief {
  garmentType?: GarmentCode;
  category?: string;
  gender?: ProductDraft["gender"];
  colors?: ColorCode[];
  sizes?: SizeCode[];
  technique?: Technique;
  price?: number;
  previousPrice?: number | null;
  stockPerVariant?: number;
  stockBySize?: Partial<Record<SizeCode, number>>;
  modelPrefix?: string;
  name?: string;
  material?: string;
  collectionDrop?: string;
  status?: ProductStatus;
  highlighted?: boolean;
  sortOrder?: number;
  notes?: string;
  styleKeywords?: string[];
  hasFrontPrint?: boolean;
  hasBackPrint?: boolean;
  shortDescription?: string;
  longDescription?: string;
  whatsappText?: string;
  tags?: string[];
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface AppSettings {
  ollamaModel: string;
  ollamaEndpoint: string;
  assistantInstructions: string;
  productRoot: string;
  whisperModel: string;
  whisperLanguage: string;
  creatorActionLabels: boolean;
  backupEnabled: boolean;
  backupFrequencyDays: number;
  backupRoot: string;
}
