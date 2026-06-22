import { z } from "zod";
import {
  COLOR_CATALOG,
  GARMENT_TYPES,
  SIZE_CODES,
  type ColorCode,
  type ExtractedBrief,
  type ImageRole,
  type ProductDraft,
  type ProductImage,
  type ProductVariant,
  type SizeCode,
  type ValidationIssue,
} from "../types/product";

export const MODEL_PREFIXES = {
  LISAH: "Lisa Hombre",
  LISAM: "Lisa Mujer",
  LISAU: "Lisa Unisex",
  SRK: "Skull Rock",
  MTR: "Motero",
  PLY: "Playero",
  RCK: "Rock genérico",
  BND: "Banda / inspiración musical",
  FLM: "Flamero / fuego",
  TXT: "Texto protagonista",
} as const;

const COLOR_ALIASES: Record<string, ColorCode> = {
  blanco: "BLA",
  blanca: "BLA",
  white: "BLA",
  bla: "BLA",
  negro: "NEG",
  negra: "NEG",
  black: "NEG",
  neg: "NEG",
  gris: "GRI",
  gray: "GRI",
  grey: "GRI",
  gri: "GRI",
  azul: "AZU",
  blue: "AZU",
  azu: "AZU",
  rojo: "ROJ",
  roja: "ROJ",
  red: "ROJ",
  roj: "ROJ",
  verde: "VER",
  green: "VER",
  ver: "VER",
  amarillo: "AMA",
  amarilla: "AMA",
  yellow: "AMA",
  ama: "AMA",
  beige: "BEI",
  bei: "BEI",
};

const SIZE_ORDER = new Map(SIZE_CODES.map((size, index) => [size, index]));

export const productDraftSchema = z.object({
  modelCode: z.string().regex(/^RXW-[A-Z0-9]+-[A-Z0-9]+$/, "Código de modelo inválido"),
  garmentType: z.enum(Object.keys(GARMENT_TYPES) as [keyof typeof GARMENT_TYPES, ...(keyof typeof GARMENT_TYPES)[]]),
  modelPrefix: z.string().regex(/^[A-Z0-9]+$/),
  modelNumber: z.number().int().positive(),
  modelRaw: z.string().regex(/^[A-Z0-9]+$/),
  name: z.string().min(3),
  slug: z.string().min(3),
  price: z.number().nonnegative(),
  colors: z.array(z.enum(Object.keys(COLOR_CATALOG) as [ColorCode, ...ColorCode[]])).min(1),
  sizes: z.array(z.enum(SIZE_CODES as unknown as [SizeCode, ...SizeCode[]])).min(1),
});

export function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function normalizeColor(input: string): ColorCode | undefined {
  const key = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (key.toUpperCase() in COLOR_CATALOG) return key.toUpperCase() as ColorCode;
  return COLOR_ALIASES[key];
}

export function parseNaturalBrief(input: string): ExtractedBrief {
  const plain = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const extracted: ExtractedBrief = { styleKeywords: [] };

  if (/\bremera\b|\btee\b|\bt-?shirt\b/.test(plain)) {
    extracted.garmentType = "REM";
    extracted.category = "remeras";
  } else if (/\bbuzo\b|\bhoodie\b/.test(plain)) {
    extracted.garmentType = "BZO";
    extracted.category = "buzos";
  } else if (/\bcampera\b|\bchaqueta\b/.test(plain)) {
    extracted.garmentType = "CAM";
    extracted.category = "camperas";
  } else if (/\bmusculosa\b/.test(plain)) {
    extracted.garmentType = "MUS";
    extracted.category = "musculosas";
  } else if (/\bpantalon\b|\bjogger\b/.test(plain)) {
    extracted.garmentType = "PAN";
    extracted.category = "pantalones";
  }

  const detectedColors = Object.keys(COLOR_ALIASES)
    .filter((alias) => new RegExp(`\\b${alias}\\b`, "i").test(plain))
    .map((alias) => COLOR_ALIASES[alias]);
  if (detectedColors.length) extracted.colors = [...new Set(detectedColors)];

  const sizeMatches = plain.toUpperCase().match(/\b(?:XXXL|XXL|XL|XS|S|M|L)\b/g);
  if (sizeMatches?.length) {
    extracted.sizes = [...new Set(sizeMatches as SizeCode[])].sort(
      (a, b) => (SIZE_ORDER.get(a) ?? 99) - (SIZE_ORDER.get(b) ?? 99),
    );
  }
  if (/s\s*(?:a|al|-)\s*xl/.test(plain)) extracted.sizes = ["S", "M", "L", "XL"];
  if (/xs\s*(?:a|al|-)\s*xxl/.test(plain)) extracted.sizes = ["XS", "S", "M", "L", "XL", "XXL"];

  const priceMatch = plain.match(/(?:precio\s*)?\$?\s*(\d{4,7})(?!\s*(?:por|x)\s*talle)/);
  if (priceMatch) extracted.price = Number(priceMatch[1]);

  const stockMatch = plain.match(/(\d+)\s*(?:por|x)\s*talle/);
  if (stockMatch) extracted.stockPerVariant = Number(stockMatch[1]);

  if (/\bunisex\b/.test(plain)) extracted.gender = "unisex";
  else if (/\bmujer\b|\bfemenin/.test(plain)) extracted.gender = "mujer";
  else if (/\bhombre\b|\bmasculin/.test(plain)) extracted.gender = "hombre";

  if (/\bdtf\b/.test(plain)) extracted.technique = "DTF";
  else if (/\bsublim/.test(plain)) extracted.technique = "Sublimación";
  else if (/\bvinilo\b/.test(plain)) extracted.technique = "Vinilo";
  else if (/\bbordad/.test(plain)) extracted.technique = "Bordado";
  else if (/sin estampa/.test(plain)) extracted.technique = "Sin estampa";

  if (/\bskull\b|\bcalavera\b|\bcraneo\b/.test(plain)) {
    extracted.modelPrefix = "SRK";
    extracted.styleKeywords?.push("skull");
  } else if (/\bmoto\b|\bmotero\b|\bbiker\b/.test(plain)) {
    extracted.modelPrefix = "MTR";
    extracted.styleKeywords?.push("motero");
  } else if (/\bfuego\b|\bllama\b|\bflame\b/.test(plain)) {
    extracted.modelPrefix = "FLM";
    extracted.styleKeywords?.push("fuego");
  } else if (/\bbanda\b|\brock band\b/.test(plain)) {
    extracted.modelPrefix = "BND";
    extracted.styleKeywords?.push("banda");
  } else if (/\blisa\b|sin diseno/.test(plain)) {
    extracted.modelPrefix =
      extracted.gender === "hombre" ? "LISAH" : extracted.gender === "mujer" ? "LISAM" : "LISAU";
  } else {
    extracted.modelPrefix = "RCK";
  }

  if (/\brock\b|\brockero\b|\brockera\b/.test(plain)) extracted.styleKeywords?.push("rock");
  if (/\burbano\b|\bstreet\b/.test(plain)) extracted.styleKeywords?.push("urbano");
  if (/\boversize\b|\bover size\b/.test(plain)) extracted.styleKeywords?.push("oversize");

  extracted.hasFrontPrint = /adelante|frente|frontal/.test(plain);
  extracted.hasBackPrint = /espalda|dorso|trasera/.test(plain);

  const materialMatch = plain.match(/\b(algodon(?:\s+\d+\/\d+)?|modal|poliester|frisa|jersey)\b/);
  if (materialMatch) extracted.material = materialMatch[1];

  extracted.name = suggestProductName(extracted);
  return extracted;
}

export function suggestProductName(brief: ExtractedBrief) {
  const garment = brief.garmentType ? GARMENT_TYPES[brief.garmentType] : "Producto";
  const style = brief.styleKeywords ?? [];
  const tokens = [
    garment,
    style.includes("oversize") ? "Oversize" : "",
    style.includes("skull") ? "Rock Skull" : style.includes("motero") ? "Motero" : "Rock",
  ].filter(Boolean);
  return tokens.join(" ");
}

export function makeModelRaw(prefix: string, modelNumber: number) {
  return `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, "")}${String(modelNumber).padStart(3, "0")}`;
}

export function makeModelCode(garmentType: string, modelRaw: string) {
  return `RXW-${garmentType.toUpperCase()}-${modelRaw.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
}

export function generateVariants(
  modelCode: string,
  colors: ColorCode[],
  sizes: SizeCode[],
  current: ProductVariant[],
  defaultStock = 0,
) {
  const stockByKey = new Map(current.map((variant) => [`${variant.colorCode}-${variant.sizeCode}`, variant.stock]));
  return colors.flatMap((colorCode) =>
    sizes.map((sizeCode) => {
      const sku = `${modelCode}-${colorCode}-${sizeCode}`;
      return {
        id: uid("variant"),
        sku,
        colorCode,
        sizeCode,
        stock: stockByKey.get(`${colorCode}-${sizeCode}`) ?? defaultStock,
        barcodeValue: sku,
      } satisfies ProductVariant;
    }),
  );
}

export function roleForImageNumber(imageNumber: number): ImageRole {
  if (imageNumber === 1) return "portada";
  if (imageNumber === 2) return "espalda remera";
  if (imageNumber === 3) return "hover";
  if (imageNumber === 4) return "costado";
  if (imageNumber === 5) return "espalda modelo";
  return "detalle";
}

export function imageFilename(colorCode: ColorCode, imageNumber: number, device: ProductImage["device"]) {
  return `${colorCode.toLowerCase()}-${String(imageNumber).padStart(2, "0")}-${device}.webp`;
}

export function applyBriefToDraft(draft: ProductDraft, brief: ExtractedBrief): ProductDraft {
  const modelPrefix = brief.modelPrefix ?? draft.modelPrefix;
  const garmentType = brief.garmentType ?? draft.garmentType;
  const modelRaw = makeModelRaw(modelPrefix, draft.modelNumber);
  const modelCode = makeModelCode(garmentType, modelRaw);
  const colors = brief.colors?.length ? brief.colors : draft.colors;
  const sizes = brief.sizes?.length ? brief.sizes : draft.sizes;
  const name = brief.name || draft.name;

  return {
    ...draft,
    garmentType,
    category: brief.category ?? draft.category,
    gender: brief.gender ?? draft.gender,
    colors,
    sizes,
    technique: brief.technique ?? draft.technique,
    price: brief.price ?? draft.price,
    material: brief.material ?? draft.material,
    collectionDrop: brief.collectionDrop ?? draft.collectionDrop,
    modelPrefix,
    modelRaw,
    modelCode,
    name,
    slug: slugify(name),
    tags: [...new Set([...(draft.tags ?? []), ...(brief.styleKeywords ?? [])])],
    variants: generateVariants(modelCode, colors, sizes, draft.variants, brief.stockPerVariant ?? 0),
    updatedAt: new Date().toISOString(),
  };
}

export function generateDescriptions(draft: ProductDraft, tone: "rockera" | "comercial" | "minimal" = "rockera") {
  const garment = GARMENT_TYPES[draft.garmentType].toLowerCase();
  const colorNames = draft.colors.map((code) => COLOR_CATALOG[code].name.toLowerCase()).join(" y ");
  const material = draft.material && draft.material !== "No definido" ? ` en ${draft.material}` : "";
  const technique = draft.technique !== "No definido" ? ` con terminación ${draft.technique}` : "";
  const style = draft.tags.includes("oversize") ? "de calce oversize" : "de identidad urbana";
  const primaryShortDescription =
    tone === "minimal"
      ? `${GARMENT_TYPES[draft.garmentType]} ${colorNames} ${style}${technique}.`
      : `${GARMENT_TYPES[draft.garmentType]} ${colorNames} ${style}${technique}, creada para llevar el pulso ROXWANA.`;
  const alternateShortDescription =
    tone === "minimal"
      ? `${draft.name}: ${garment} ${colorNames}${material}, ${style}.`
      : `${draft.name} combina actitud rockera, ${style} y una presencia pensada para destacar.`;
  const primaryLongDescription =
    tone === "comercial"
      ? `${draft.name} es una ${garment}${material} pensada para acompañarte todos los días. Su estética rock urbana, su calce cómodo y sus terminaciones cuidadas la convierten en una pieza fácil de combinar y difícil de ignorar.`
      : tone === "minimal"
        ? `${draft.name}. ${GARMENT_TYPES[draft.garmentType]}${material}, ${style}${technique}. Diseño ROXWANA de presencia limpia y carácter urbano.`
        : `${draft.name} nace del lado más crudo de ROXWANA. Una ${garment}${material} ${style}${technique}, con una presencia que no pide permiso. Hecha para looks urbanos, noches largas y volumen alto.`;
  const alternateLongDescription =
    tone === "comercial"
      ? `${draft.name} lleva la identidad ROXWANA a una ${garment}${material} versátil y cómoda. Su diseño urbano${technique} funciona como protagonista del look y se adapta con facilidad a distintas combinaciones.`
      : tone === "minimal"
        ? `${draft.name} reúne una silueta ${style}${material}${technique}. Una pieza urbana, directa y fiel al lenguaje visual de ROXWANA.`
        : `${draft.name} cruza calle, volumen y actitud en una ${garment}${material} ${style}${technique}. Una pieza ROXWANA para vestirse con carácter y dejar que el diseño hable primero.`;
  const useAlternate = draft.shortDescription === primaryShortDescription;

  return {
    shortDescription: useAlternate ? alternateShortDescription : primaryShortDescription,
    longDescription: useAlternate ? alternateLongDescription : primaryLongDescription,
    whatsappText: useAlternate
      ? `Hola, quiero saber qué talles y colores tienen disponibles de ${draft.name}.`
      : `Quiero consultar por ${draft.name}. ¿Me pasan disponibilidad de talles y colores?`,
  };
}

export function validateProduct(
  draft: ProductDraft,
  knownSkus: string[] = [],
  knownModelCodes: string[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const result = productDraftSchema.safeParse(draft);
  if (!result.success) {
    result.error.issues.forEach((issue) =>
      issues.push({ field: issue.path.join("."), message: issue.message, severity: "error" }),
    );
  }
  if (!draft.modelCode.startsWith("RXW-")) {
    issues.push({ field: "modelCode", message: "El código debe comenzar con RXW.", severity: "error" });
  }
  if (knownModelCodes.includes(draft.modelCode)) {
    issues.push({ field: "modelCode", message: "El código de modelo ya existe en la base.", severity: "error" });
  }
  if (draft.modelRaw.includes("-")) {
    issues.push({ field: "modelRaw", message: "El modelo no puede contener guiones internos.", severity: "error" });
  }
  const localSkus = new Set<string>();
  draft.variants.forEach((variant) => {
    if (!variant.sku.startsWith(`${draft.modelCode}-`)) {
      issues.push({ field: variant.sku, message: "El SKU no comienza con el código del modelo.", severity: "error" });
    }
    if (!draft.colors.includes(variant.colorCode) || !draft.sizes.includes(variant.sizeCode)) {
      issues.push({ field: variant.sku, message: "La variante usa color o talle no declarado.", severity: "error" });
    }
    if (knownSkus.includes(variant.sku) || localSkus.has(variant.sku)) {
      issues.push({ field: variant.sku, message: "SKU duplicado.", severity: "error" });
    }
    if (variant.stock < 0) {
      issues.push({ field: variant.sku, message: "El stock no puede ser negativo.", severity: "error" });
    }
    localSkus.add(variant.sku);
  });
  if (!draft.name.trim()) issues.push({ field: "name", message: "Falta el nombre visible.", severity: "error" });
  if (!draft.price) issues.push({ field: "price", message: "Falta el precio.", severity: "error" });
  if (!draft.variants.some((variant) => variant.stock > 0)) {
    issues.push({ field: "stock", message: "Todavía no hay stock cargado.", severity: "error" });
  }
  if (!draft.images.some((image) => image.imageNumber === 1)) {
    issues.push({ field: "images", message: "Falta una imagen 01 de portada.", severity: "warning" });
  }
  if (draft.colors.length > 1 && draft.images.some((image) => !image.colorCode)) {
    issues.push({ field: "images", message: "Las imágenes deben indicar color.", severity: "error" });
  }
  return issues;
}

export function makeProductSheet(draft: ProductDraft) {
  const indentLong = (draft.longDescription || "").split("\n").map((line) => `  ${line}`).join("\n");
  const variants = draft.variants
    .map((variant) => `  ${variant.sku} | ${variant.sizeCode} | ${variant.colorCode} | ${variant.stock}`)
    .join("\n");
  const images = draft.images
    .sort((a, b) => a.imageNumber - b.imageNumber)
    .map((image) => `  ${image.finalFilename} = ${image.role}`)
    .join("\n");

  return [
    "ROXWANA Product Sheet v1",
    `codigo: ${draft.modelCode}`,
    `nombre: ${draft.name}`,
    `slug: ${draft.slug}`,
    `prenda: ${draft.garmentType}`,
    `genero: ${draft.gender}`,
    `estado: ${draft.status}`,
    `precio: ${draft.price || ""}`,
    `precio_anterior: ${draft.previousPrice ?? ""}`,
    `categoria: ${draft.category}`,
    `drop: ${draft.collectionDrop}`,
    `destacado: ${draft.highlighted}`,
    `orden: ${draft.sortOrder}`,
    `colores: ${draft.colors.join(", ")}`,
    `talles: ${draft.sizes.join(", ")}`,
    `descripcion_corta: ${draft.shortDescription}`,
    "descripcion_larga: |",
    indentLong,
    `whatsapp: ${draft.whatsappText}`,
    "variantes:",
    variants,
    "imagenes:",
    images,
  ].join("\n");
}

export function makeEmptyDraft(): ProductDraft {
  const now = new Date().toISOString();
  const modelRaw = "SRK004";
  const modelCode = makeModelCode("REM", modelRaw);
  return {
    id: uid("product"),
    modelCode,
    garmentType: "REM",
    modelPrefix: "SRK",
    modelNumber: 4,
    modelRaw,
    name: "Remera Oversize Rock Skull",
    slug: "remera-oversize-rock-skull",
    gender: "unisex",
    category: "remeras",
    collectionDrop: "",
    price: 29900,
    previousPrice: null,
    status: "draft",
    highlighted: false,
    sortOrder: 0,
    technique: "DTF",
    material: "No definido",
    shortDescription: "",
    longDescription: "",
    whatsappText: "",
    tags: ["rock", "skull", "oversize", "urbano"],
    notes: "",
    colors: ["NEG"],
    sizes: ["S", "M", "L", "XL"],
    variants: generateVariants(modelCode, ["NEG"], ["S", "M", "L", "XL"], [], 2),
    images: [],
    createdAt: now,
    updatedAt: now,
  };
}
