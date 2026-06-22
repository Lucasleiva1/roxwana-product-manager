import { describe, expect, it } from "vitest";
import {
  generateVariants,
  makeModelCode,
  makeProductSheet,
  parseNaturalBrief,
  slugify,
  validateProduct,
} from "./productLogic";
import { makeEmptyDraft } from "./productLogic";

describe("lógica de producto ROXWANA", () => {
  it("normaliza un brief natural", () => {
    const brief = parseNaturalBrief(
      "Remera negra oversize skull, DTF, talles S M L XL, 2 por talle, precio 29900",
    );
    expect(brief.garmentType).toBe("REM");
    expect(brief.colors).toEqual(["NEG"]);
    expect(brief.sizes).toEqual(["S", "M", "L", "XL"]);
    expect(brief.stockPerVariant).toBe(2);
    expect(brief.modelPrefix).toBe("SRK");
  });

  it("genera modelo, slug y SKU deterministas", () => {
    const model = makeModelCode("REM", "SRK004");
    expect(model).toBe("RXW-REM-SRK004");
    expect(slugify("Remera Ácida Rock 004")).toBe("remera-acida-rock-004");
    expect(generateVariants(model, ["NEG"], ["M"], [], 3)[0].sku).toBe("RXW-REM-SRK004-NEG-M");
  });

  it("exporta las columnas de variante en orden SKU | TALLE | COLOR | STOCK", () => {
    const sheet = makeProductSheet(makeEmptyDraft());
    expect(sheet).toContain("RXW-REM-SRK004-NEG-M | M | NEG | 2");
  });

  it("bloquea modelos y SKU ya registrados", () => {
    const draft = makeEmptyDraft();
    const issues = validateProduct(
      draft,
      ["RXW-REM-SRK004-NEG-M"],
      ["RXW-REM-SRK004"],
    );
    expect(issues.some((issue) => issue.message.includes("modelo ya existe"))).toBe(true);
    expect(issues.some((issue) => issue.message === "SKU duplicado.")).toBe(true);
  });
});
