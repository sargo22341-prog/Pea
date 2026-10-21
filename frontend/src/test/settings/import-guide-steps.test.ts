import { describe, expect, it } from "vitest";
import enSettings from "../../i18n/locales/en/settings.json";
import frSettings from "../../i18n/locales/fr/settings.json";
import { guideStepStatus, IMPORT_GUIDE_STEPS, stepEffects } from "../../pages/settings/components/import-guide/import-guide-steps";

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

describe("import guide steps", () => {
  it("derives the visual status of each step", () => {
    const seen = new Set([0, 1]);
    expect(guideStepStatus(1, 1, seen)).toBe("current");
    expect(guideStepStatus(0, 1, seen)).toBe("seen");
    expect(guideStepStatus(3, 1, seen)).toBe("upcoming");
  });

  it("lists the distinct effects of a step in legend order", () => {
    const cash = IMPORT_GUIDE_STEPS.find((step) => step.id === "cash");
    expect(cash && stepEffects(cash)).toEqual(["write", "verify", "flag"]);
  });

  it("orders the four imports as on the settings page", () => {
    expect(IMPORT_GUIDE_STEPS.filter((step) => step.isImport).map((step) => step.id)).toEqual(["csv", "avis", "coupons", "cash"]);
  });

  it("has a French and English text for every step point", () => {
    const fr = new Set(keysOf(frSettings.importGuide));
    expect(keysOf(enSettings.importGuide).sort()).toEqual([...fr].sort());
    for (const step of IMPORT_GUIDE_STEPS) {
      for (const point of step.points) expect(fr.has(`steps.${step.id}.points.${point.key}`)).toBe(true);
    }
  });
});
