import { describe, expect, it } from "vitest";
import {
  formatStockQuantity,
  formatStockSummary,
  generateDescriptions,
  generateVariants,
  applyBriefToDraft,
  makeModelCode,
  makeProductSheet,
  parseNaturalBrief,
  suggestProductName,
  slugify,
  validateProduct,
} from "./productLogic";
import { makeEmptyDraft } from "./productLogic";
import { askMissingQuestions } from "../services/ollamaService";

const draftWithUniqueModel = () => ({
  ...makeEmptyDraft(),
  garmentType: "REM" as const,
  modelPrefix: "RCK",
  modelNumber: 1,
  modelRaw: "RCK001",
  modelCode: "RXW-REM-RCK001",
});

describe("lógica de producto ROXWANA", () => {
  it("normaliza un brief natural", () => {
    const brief = parseNaturalBrief(
      "Remera negra urbana skull, DTF, talles S M L XL, 2 por talle, precio 29900",
    );
    expect(brief.garmentType).toBe("REM");
    expect(brief.colors).toEqual(["NEG"]);
    expect(brief.sizes).toEqual(["S", "M", "L", "XL"]);
    expect(brief.stockPerVariant).toBe(2);
    expect(brief.modelPrefix).toBe("SRK");
  });

  it("ignora oversize porque no es una opción comercial actual", () => {
    const brief = parseNaturalBrief("Remera negra oversize, talles S y M");
    expect(brief.styleKeywords).toBeUndefined();
    expect(suggestProductName(brief)).not.toContain("Oversize");
    expect(makeEmptyDraft().tags).not.toContain("oversize");
  });

  it("interpreta cambios incrementales sin pisar nombre ni modelo", () => {
    const brief = parseNaturalBrief("Ahora dejá solamente los talles S, M y L");
    expect(brief.sizes).toEqual(["S", "M", "L"]);
    expect(brief.name).toBeUndefined();
    expect(brief.modelPrefix).toBeUndefined();
  });

  it("extrae el nombre sin conservar la preposición", () => {
    expect(parseNaturalBrief("Cambiá el nombre a Fuego Nocturno").name).toBe("Fuego Nocturno");
  });

  it("entiende un precio enviado como respuesta corta", () => {
    expect(parseNaturalBrief("35000").price).toBe(35000);
    expect(parseNaturalBrief("$ 35.000 pesos").price).toBe(35000);
  });

  it("pregunta primero el precio cuando la descripción básica ya está completa", () => {
    const draft = applyBriefToDraft(makeEmptyDraft(), {
      garmentType: "REM",
      colors: ["BLA"],
      sizes: ["L", "XL"],
      material: "algodon",
    });
    expect(askMissingQuestions(draft)[0]?.field).toBe("price");
    expect(askMissingQuestions(draft)[0]?.question).toBe("¿Qué precio tiene el producto?");
  });

  it("aplica stock nuevo a variantes existentes", () => {
    const draft = draftWithUniqueModel();
    const updated = applyBriefToDraft(draft, {
      garmentType: "REM",
      colors: ["NEG"],
      sizes: ["S", "M", "L"],
      stockPerVariant: 7,
    });
    expect(updated.variants).toHaveLength(3);
    expect(updated.variants.every((variant) => variant.stock === 7)).toBe(true);
  });

  it("aplica datos completos y stock distinto por talle", () => {
    const draft = draftWithUniqueModel();
    const updated = applyBriefToDraft(draft, {
      name: "Fuego Negro",
      material: "algodon",
      collectionDrop: "Invierno 2026",
      status: "en_revision",
      highlighted: true,
      garmentType: "REM",
      colors: ["NEG"],
      sizes: ["S", "M"],
      stockBySize: { S: 2, M: 5 },
    });
    expect(updated.name).toBe("Fuego Negro");
    expect(updated.collectionDrop).toBe("Invierno 2026");
    expect(updated.status).toBe("en_revision");
    expect(updated.highlighted).toBe(true);
    expect(updated.variants.map((variant) => variant.stock)).toEqual([2, 5]);
  });

  it("genera modelo, slug y SKU deterministas", () => {
    const model = makeModelCode("REM", "SRK004");
    expect(model).toBe("RXW-REM-SRK004");
    expect(slugify("Remera Ácida Rock 004")).toBe("remera-acida-rock-004");
    expect(generateVariants(model, ["NEG"], ["M"], [], 3)[0].sku).toBe("RXW-REM-SRK004-NEG-M");
  });

  it("exporta las columnas de variante en orden SKU | TALLE | COLOR | STOCK", () => {
    const draft = applyBriefToDraft(draftWithUniqueModel(), {
      garmentType: "REM",
      colors: ["NEG"],
      sizes: ["M"],
      stockPerVariant: 2,
    });
    const sheet = makeProductSheet(draft);
    expect(sheet).toContain("RXW-REM-RCK001-NEG-M | M | NEG | 2");
  });

  it("trata stock cero como indefinido y no como sin stock", () => {
    const draft = applyBriefToDraft(draftWithUniqueModel(), {
      garmentType: "REM",
      colors: ["NEG"],
      sizes: ["S", "M"],
    });
    const issues = validateProduct({
      ...draft,
      name: "Producto a pedido",
      gender: "unisex",
      technique: "DTF",
      price: 10000,
    });
    expect(formatStockQuantity(0)).toBe("Indefinido");
    expect(formatStockSummary(draft)).toBe("Indefinido");
    expect(issues.some((issue) => issue.field === "stock")).toBe(false);
    expect(makeProductSheet(draft)).toContain("indefinido");
  });

  it("regenera una versión local diferente de la descripción", () => {
    const draft = makeEmptyDraft();
    const first = generateDescriptions(draft, "rockera");
    const second = generateDescriptions({ ...draft, ...first }, "rockera");
    expect(second.shortDescription).not.toBe(first.shortDescription);
    expect(second.longDescription).not.toBe(first.longDescription);
  });

  it("bloquea modelos y SKU ya registrados", () => {
    const draft = applyBriefToDraft(draftWithUniqueModel(), {
      garmentType: "REM",
      colors: ["NEG"],
      sizes: ["M"],
      stockPerVariant: 2,
    });
    const issues = validateProduct(
      draft,
      ["RXW-REM-RCK001-NEG-M"],
      ["RXW-REM-RCK001"],
    );
    expect(issues.some((issue) => issue.message.includes("modelo ya existe"))).toBe(true);
    expect(issues.some((issue) => issue.message === "SKU duplicado.")).toBe(true);
  });

  it("inicia una ficha nueva sin datos precargados", () => {
    const draft = makeEmptyDraft();
    expect(draft).toMatchObject({
      modelCode: "",
      garmentType: "",
      modelPrefix: "",
      modelNumber: 0,
      name: "",
      slug: "",
      gender: "",
      category: "",
      price: 0,
      technique: "",
      material: "",
      colors: [],
      sizes: [],
      variants: [],
      tags: [],
    });
  });

  it("no crea variantes ni SKU incompletos antes de tener un modelo único", () => {
    expect(generateVariants("", ["NEG"], ["M"], [], 0)).toEqual([]);
    expect(generateVariants("RXW-REM-RCK001", [], ["M"], [], 0)).toEqual([]);
    expect(generateVariants("RXW-REM-RCK001", ["NEG"], [], [], 0)).toEqual([]);
  });

  it("elimina del borrador los SKU de colores o talles quitados", () => {
    const variants = generateVariants("RXW-REM-RCK001", ["NEG"], ["S", "M"], [], 0);
    const updated = generateVariants("RXW-REM-RCK001", ["NEG"], ["M"], variants, 0);
    expect(updated.map((variant) => variant.sku)).toEqual(["RXW-REM-RCK001-NEG-M"]);
  });
});
