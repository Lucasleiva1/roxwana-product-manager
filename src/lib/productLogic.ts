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

export function parsePriceInput(value: string | number | null | undefined) {
  return Number(String(value ?? "").replace(/\D/g, ""));
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
  } else if (/\bgorra\b|\bcap\b/.test(plain)) {
    extracted.garmentType = "GOR";
    extracted.category = "gorras";
  } else if (/\baccesorio\b|\bllavero\b|\bbolso\b|\bmochila\b/.test(plain)) {
    extracted.garmentType = "ACC";
    extracted.category = "accesorios";
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

  const priceMatch = plain.match(/(?:precio(?:\s+actual)?(?:\s+de)?\s*|vale\s*|cuesta\s*)\$?\s*(\d[\d.]*)/);
  const standalonePriceMatch = plain.match(/^\s*\$?\s*(\d{4,7}|\d{1,3}(?:\.\d{3})+)\s*(?:pesos?)?\s*$/);
  const detectedPrice = priceMatch ?? standalonePriceMatch;
  if (detectedPrice) extracted.price = Number(detectedPrice[1].replace(/\./g, ""));

  const previousPriceMatch = plain.match(/(?:precio\s+anterior|antes\s+costaba)\s*\$?\s*(\d[\d.]*)/);
  if (previousPriceMatch) extracted.previousPrice = Number(previousPriceMatch[1].replace(/\./g, ""));

  const stockMatch = plain.match(/(?:stock\s*(?:de)?\s*)?(\d+)\s*(?:por|x)\s*(?:cada\s+)?talle/);
  if (stockMatch) extracted.stockPerVariant = Number(stockMatch[1]);
  const stockBySize = [...plain.matchAll(/(?:talle\s+)?(xxxl|xxl|xl|xs|s|m|l)\s*(?:con|:|=|tiene)?\s*(\d+)\s*(?:unidades?|de stock)?/g)];
  if (stockBySize.length) {
    extracted.stockBySize = Object.fromEntries(
      stockBySize.map((match) => [match[1].toUpperCase(), Number(match[2])]),
    ) as ExtractedBrief["stockBySize"];
  }

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
  }

  if (/\brock\b|\brockero\b|\brockera\b/.test(plain)) extracted.styleKeywords?.push("rock");
  if (/\burbano\b|\bstreet\b/.test(plain)) extracted.styleKeywords?.push("urbano");

  if (/adelante|frente|frontal/.test(plain)) extracted.hasFrontPrint = true;
  if (/espalda|dorso|trasera/.test(plain)) extracted.hasBackPrint = true;

  const materialMatch = plain.match(/\b(algodon(?:\s+\d+\/\d+)?|modal|poliester|frisa|jersey|gabardina|denim|cuero|lino)\b/);
  if (materialMatch) extracted.material = materialMatch[1];

  const explicitName = input.match(/(?:nombre|se llama|llam(?:ala|alo|ado|ada))\s*(?:a|como|es|:)?\s*["“]?([^,"”.\n]+)["”]?/i);
  if (explicitName?.[1]) extracted.name = explicitName[1].trim();

  const categoryMatch = input.match(/categor[ií]a\s*(?:es|:)?\s*([^,.\n]+)/i);
  if (categoryMatch?.[1]) extracted.category = categoryMatch[1].trim();

  const collectionMatch = input.match(/(?:colecci[oó]n|drop)\s*(?:es|:)?\s*([^,.\n]+)/i);
  if (collectionMatch?.[1]) extracted.collectionDrop = collectionMatch[1].trim();

  if (/\bno\s+destacad[oa]\b|\bquita\w*\s+(?:de\s+)?destacad[oa]\b/.test(plain)) extracted.highlighted = false;
  else if (/\bdestacad[oa]\b|\bmarcal[oa]?\s+como\s+destacad[oa]\b/.test(plain)) extracted.highlighted = true;

  const statusAliases = [
    ["en revision", "en_revision"],
    ["sin producir", "sin_producir"],
    ["producido", "producido"],
    ["publicado", "publicado"],
    ["aprobado", "aprobado"],
    ["agotado", "agotado"],
    ["pausado", "pausado"],
    ["borrador", "draft"],
  ] as const;
  const detectedStatus = statusAliases.find(([label]) => new RegExp(`\\b${label}\\b`).test(plain));
  if (detectedStatus) extracted.status = detectedStatus[1];

  const notesMatch = input.match(/(?:nota|notas|anot[aá])\s*(?:es|:|que)?\s*([^.\n]+)/i);
  if (notesMatch?.[1]) extracted.notes = notesMatch[1].trim();

  const orderMatch = plain.match(/(?:orden|posicion)\s*(?:es|:)?\s*(\d+)/);
  if (orderMatch) extracted.sortOrder = Number(orderMatch[1]);

  if (!extracted.styleKeywords?.length) delete extracted.styleKeywords;
  return extracted;
}

export function suggestProductName(brief: ExtractedBrief) {
  const garment = brief.garmentType ? GARMENT_TYPES[brief.garmentType] : "Producto";
  const style = brief.styleKeywords ?? [];
  const tokens = [
    garment,
    style.includes("skull") ? "Rock Skull" : style.includes("motero") ? "Motero" : "Rock",
  ].filter(Boolean);
  return tokens.join(" ");
}

export function makeModelRaw(prefix: string, modelNumber: number) {
  if (!prefix || modelNumber <= 0) return "";
  return `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, "")}${String(modelNumber).padStart(3, "0")}`;
}

export function makeModelCode(garmentType: string, modelRaw: string) {
  if (!garmentType || !modelRaw) return "";
  return `RXW-${garmentType.toUpperCase()}-${modelRaw.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
}

export function generateVariants(
  modelCode: string,
  colors: ColorCode[],
  sizes: SizeCode[],
  current: ProductVariant[],
  defaultStock = 0,
) {
  if (!modelCode || !colors.length || !sizes.length) return [];
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

export function totalDefinedStock(product: Pick<ProductDraft, "variants">) {
  return product.variants.reduce((sum, variant) => sum + Math.max(0, variant.stock), 0);
}

export function hasDefinedStock(product: Pick<ProductDraft, "variants">) {
  return product.variants.some((variant) => variant.stock > 0);
}

export function hasSellableVariants(product: Pick<ProductDraft, "variants">) {
  return product.variants.length > 0;
}

export function formatStockQuantity(stock: number) {
  return stock > 0 ? `${stock} unidades` : "Indefinido";
}

export function formatStockSummary(product: Pick<ProductDraft, "variants">) {
  const total = totalDefinedStock(product);
  if (total > 0) return `${total} unidades`;
  return product.variants.length ? "Indefinido" : "Sin variantes";
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
  const garmentType = brief.garmentType ?? draft.garmentType;
  const modelPrefix = (brief.modelPrefix ?? draft.modelPrefix) || (garmentType ? "RCK" : "");
  const modelNumber = draft.modelNumber;
  const modelRaw = makeModelRaw(modelPrefix, modelNumber);
  const modelCode = makeModelCode(garmentType, modelRaw);
  const colors = brief.colors?.length ? brief.colors : draft.colors;
  const sizes = brief.sizes?.length ? brief.sizes : draft.sizes;
  const name = brief.name || draft.name;
  let variants = generateVariants(modelCode, colors, sizes, draft.variants, brief.stockPerVariant ?? 0);

  if (brief.stockPerVariant !== undefined) {
    variants = variants.map((variant) => ({ ...variant, stock: brief.stockPerVariant! }));
  }
  if (brief.stockBySize) {
    variants = variants.map((variant) => ({
      ...variant,
      stock: brief.stockBySize?.[variant.sizeCode] ?? variant.stock,
    }));
  }

  return {
    ...draft,
    garmentType,
    category: brief.category ?? draft.category,
    gender: brief.gender ?? draft.gender,
    colors,
    sizes,
    technique: brief.technique ?? draft.technique,
    price: brief.price ?? draft.price,
    previousPrice: brief.previousPrice !== undefined ? brief.previousPrice : draft.previousPrice,
    material: brief.material ?? draft.material,
    collectionDrop: brief.collectionDrop ?? draft.collectionDrop,
    status: brief.status ?? draft.status,
    highlighted: brief.highlighted ?? draft.highlighted,
    sortOrder: brief.sortOrder ?? draft.sortOrder,
    notes: brief.notes ?? draft.notes,
    shortDescription: brief.shortDescription ?? draft.shortDescription,
    longDescription: brief.longDescription ?? draft.longDescription,
    whatsappText: brief.whatsappText ?? draft.whatsappText,
    modelPrefix,
    modelNumber,
    modelRaw,
    modelCode,
    name,
    slug: slugify(name),
    tags: [...new Set([...(brief.tags ?? draft.tags ?? []), ...(brief.styleKeywords ?? [])])]
      .filter((tag) => !/^over\s*size$/i.test(tag)),
    variants,
    updatedAt: new Date().toISOString(),
  };
}

function readableList(items: string[]) {
  const cleanItems = items.map((item) => item.trim()).filter(Boolean);
  if (cleanItems.length <= 1) return cleanItems[0] ?? "";
  return `${cleanItems.slice(0, -1).join(", ")} y ${cleanItems[cleanItems.length - 1]}`;
}

function definedText(value?: string | null) {
  const clean = String(value ?? "").trim();
  return clean && clean !== "No definido" && clean !== "no_definido" ? clean : "";
}

function techniqueText(technique: ProductDraft["technique"]) {
  const clean = definedText(technique);
  if (!clean) return "";
  if (clean === "Sin estampa") return "lisa, sin estampa";
  return `con técnica ${clean}`;
}

export function generateDescriptions(draft: ProductDraft, tone: "rockera" | "comercial" | "minimal" = "comercial") {
  const garmentName = draft.garmentType ? GARMENT_TYPES[draft.garmentType] : "Producto";
  const garment = garmentName.toLowerCase();
  const displayName = definedText(draft.name) || garmentName;
  const colorNames = draft.colors.map((code) => COLOR_CATALOG[code].name.toLowerCase());
  const colors = readableList(colorNames);
  const sizes = readableList([...draft.sizes]);
  const material = definedText(draft.material);
  const technique = techniqueText(draft.technique);
  const collection = definedText(draft.collectionDrop);
  const gender = definedText(draft.gender);
  const article = ["REM", "CAM", "MUS", "GOR"].includes(draft.garmentType) ? "una" : "un";
  const materialPart = material ? ` de ${material}` : "";
  const colorPart = colors ? ` en ${colors}` : "";
  const techniquePart = technique ? `, ${technique}` : "";
  const sizeSentence = sizes ? `Talles disponibles: ${sizes}.` : "";
  const colorSentence = colors ? `Disponible en ${colors}.` : "";
  const collectionSentence = collection ? `Parte del drop ${collection}.` : "";
  const genderSentence = gender ? `Pensada para ${gender}.` : "";

  const primaryShortDescription =
    tone === "minimal"
      ? `${displayName}: ${garment}${materialPart}${colorPart}${techniquePart}, con presencia urbana ROXWANA.`
      : tone === "rockera"
        ? `${displayName}: ${garment}${materialPart}${colorPart}${techniquePart}, cómoda y con actitud rock urbana.`
        : `${displayName}: ${garment}${materialPart}${colorPart}${techniquePart}, fácil de combinar y lista para destacar.`;
  const alternateShortDescription =
    tone === "minimal"
      ? `${garmentName}${materialPart}${colorPart}${techniquePart}. Diseño limpio, urbano y directo para uso diario.`
      : tone === "rockera"
        ? `${displayName} suma identidad ROXWANA con ${garment}${materialPart}${colorPart}, comodidad y carácter.`
        : `${displayName} combina comodidad, estilo urbano y detalles reales de la ficha para vender mejor.`;
  const primaryLongDescription =
    tone === "minimal"
      ? `${displayName} es ${article} ${garment}${materialPart}${colorPart}${techniquePart}, con una estética limpia y fácil de usar.\n\n${colorSentence} ${sizeSentence} ${genderSentence} ${collectionSentence}`.trim()
      : tone === "rockera"
        ? `${displayName} lleva la identidad ROXWANA a ${article} ${garment}${materialPart}${colorPart}${techniquePart}. Es una pieza cómoda, urbana y con presencia para armar looks con carácter.\n\n${colorSentence} ${sizeSentence} ${genderSentence} ${collectionSentence}`.trim()
        : `${displayName} es ${article} ${garment}${materialPart}${colorPart}${techniquePart}, pensada para sumar comodidad y estilo urbano sin complicar el look.\n\n${colorSentence} ${sizeSentence} ${genderSentence} ${collectionSentence}`.trim();
  const alternateLongDescription =
    tone === "minimal"
      ? `${displayName} funciona como básico urbano de ROXWANA: ${garment}${materialPart}${colorPart}${techniquePart}, directo y fácil de combinar.\n\n${colorSentence} ${sizeSentence} ${genderSentence} ${collectionSentence}`.trim()
      : tone === "rockera"
        ? `${displayName} mezcla comodidad y actitud en ${article} ${garment}${materialPart}${colorPart}${techniquePart}. Tiene presencia sin exagerar y acompaña bien looks urbanos de todos los días.\n\n${colorSentence} ${sizeSentence} ${genderSentence} ${collectionSentence}`.trim()
        : `${displayName} está pensada para venderse como una prenda versátil: ${garment}${materialPart}${colorPart}${techniquePart}, cómoda y clara para el uso diario.\n\n${colorSentence} ${sizeSentence} ${genderSentence} ${collectionSentence}`.trim();
  const useAlternate = draft.shortDescription === primaryShortDescription;

  return {
    shortDescription: useAlternate ? alternateShortDescription : primaryShortDescription,
    longDescription: (useAlternate ? alternateLongDescription : primaryLongDescription).replace(/[ \t]{2,}/g, " "),
    whatsappText: useAlternate
      ? `Hola, quiero consultar disponibilidad de ${displayName}${colors ? ` en ${colors}` : ""}${sizes ? `, talles ${sizes}` : ""}.`
      : `Hola, me interesa ${displayName}. ¿Me pasan colores, talles disponibles y forma de compra?`,
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
  if (!draft.garmentType) issues.push({ field: "garmentType", message: "Falta el tipo de prenda.", severity: "error" });
  if (!draft.gender) issues.push({ field: "gender", message: "Falta el género.", severity: "error" });
  if (!draft.technique) issues.push({ field: "technique", message: "Falta la técnica.", severity: "error" });
  if (!draft.colors.length) issues.push({ field: "colors", message: "Falta seleccionar un color.", severity: "error" });
  if (!draft.sizes.length) issues.push({ field: "sizes", message: "Falta seleccionar un talle.", severity: "error" });
  if (!draft.price) issues.push({ field: "price", message: "Falta el precio.", severity: "error" });
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
    .map((variant) => `  ${variant.sku} | ${variant.sizeCode} | ${variant.colorCode} | ${variant.stock > 0 ? variant.stock : "indefinido"}`)
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

export function makeWebProductInfo(draft: ProductDraft) {
  const colorNames = draft.colors.map((code) => COLOR_CATALOG[code].name).join(", ") || "Sin colores";
  const sizes = draft.sizes.join(", ") || "Sin talles";
  const variants = draft.variants.length
    ? draft.variants
        .map((variant) => {
          const color = COLOR_CATALOG[variant.colorCode]?.name ?? variant.colorCode;
          return `- ${variant.sku}: ${color} / ${variant.sizeCode} / ${formatStockQuantity(variant.stock)}`;
        })
        .join("\n")
    : "- Sin variantes";
  const tags = draft.tags.length ? draft.tags.map((tag) => `#${tag}`).join(" ") : "Sin tags";

  return [
    "INFORMACION PARA WEB",
    "",
    `Nombre: ${draft.name || "Sin nombre"}`,
    `Codigo: ${draft.modelCode || "Sin codigo"}`,
    `Slug: ${draft.slug || "Sin slug"}`,
    `Precio: ${draft.price || ""}`,
    `Precio anterior: ${draft.previousPrice ?? ""}`,
    `Estado: ${draft.status}`,
    `Categoria: ${draft.category || ""}`,
    `Genero: ${draft.gender || ""}`,
    `Tecnica: ${draft.technique || ""}`,
    `Material: ${draft.material || ""}`,
    `Coleccion / drop: ${draft.collectionDrop || ""}`,
    `Destacado: ${draft.highlighted ? "si" : "no"}`,
    `Orden: ${draft.sortOrder}`,
    "",
    `Colores: ${colorNames}`,
    `Talles: ${sizes}`,
    `Stock: ${formatStockSummary(draft)}`,
    "",
    "Descripcion corta:",
    draft.shortDescription || "",
    "",
    "Descripcion larga:",
    draft.longDescription || "",
    "",
    "Texto WhatsApp:",
    draft.whatsappText || "",
    "",
    "Variantes:",
    variants,
    "",
    `Tags: ${tags}`,
    "",
    "Notas internas:",
    draft.notes || "",
  ].join("\n");
}

export function makeEmptyDraft(): ProductDraft {
  const now = new Date().toISOString();
  return {
    id: uid("product"),
    modelCode: "",
    garmentType: "",
    modelPrefix: "",
    modelNumber: 0,
    modelRaw: "",
    name: "",
    slug: "",
    gender: "",
    category: "",
    collectionDrop: "",
    price: 0,
    previousPrice: null,
    status: "draft",
    highlighted: false,
    sortOrder: 0,
    technique: "",
    material: "",
    shortDescription: "",
    longDescription: "",
    whatsappText: "",
    publication: {
      whatsapp: false,
      web: false,
    },
    tags: [],
    notes: "",
    colors: [],
    sizes: [],
    variants: [],
    images: [],
    createdAt: now,
    updatedAt: now,
  };
}
