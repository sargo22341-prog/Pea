import type { PortfolioDividendEvent } from "@pea/shared";
import { describe, expect, it } from "vitest";
import { projectDividendYear, projectionBasisYears } from "../../pages/dividends/utils/projectDividendYear";

const TARGET_YEAR = 2027;

function event(overrides: Partial<PortfolioDividendEvent> & { date: string; year: number }): PortfolioDividendEvent {
  return {
    symbol: "AIR.PA",
    name: "Airbus",
    amountPerShare: 1,
    quantity: 10,
    totalAmount: 10,
    currency: "EUR",
    status: "real",
    ...overrides
  };
}

describe("projectDividendYear", () => {
  it("reprend le calendrier de l'annee de base en appliquant la croissance observee", () => {
    const projected = projectDividendYear(
      [
        event({ date: "2025-05-20T00:00:00.000Z", year: 2025, amountPerShare: 1, quantity: 8, totalAmount: 8 }),
        event({ date: "2026-05-20T00:00:00.000Z", year: 2026, amountPerShare: 1.2, quantity: 10, totalAmount: 12, status: "estimated" })
      ],
      TARGET_YEAR
    );

    expect(projected).toHaveLength(1);
    expect(projected[0].date).toBe("2027-05-20T00:00:00.000Z");
    expect(projected[0].year).toBe(TARGET_YEAR);
    expect(projected[0].amountPerShare).toBeCloseTo(1.44, 6);
    expect(projected[0].totalAmount).toBeCloseTo(14.4, 6);
    expect(projected[0].projected).toBe(true);
    expect(projected[0].status).toBe("estimated");
  });

  it("conserve chaque detachement de l'annee de base et les trie par date", () => {
    const projected = projectDividendYear(
      [
        event({ date: "2026-09-10T00:00:00.000Z", year: 2026, amountPerShare: 0.5, symbol: "BNP.PA" }),
        event({ date: "2026-03-10T00:00:00.000Z", year: 2026, amountPerShare: 0.5, symbol: "BNP.PA" })
      ],
      TARGET_YEAR
    );

    expect(projected.map((item) => item.date)).toEqual([
      "2027-03-10T00:00:00.000Z",
      "2027-09-10T00:00:00.000Z"
    ]);
  });

  it("applique la derniere quantite connue plutot que celle d'un detachement passe", () => {
    const projected = projectDividendYear(
      [
        event({ date: "2026-03-10T00:00:00.000Z", year: 2026, amountPerShare: 1, quantity: 5, totalAmount: 5 }),
        event({ date: "2026-09-10T00:00:00.000Z", year: 2026, amountPerShare: 1, quantity: 20, totalAmount: 20 })
      ],
      TARGET_YEAR
    );

    expect(projected.every((item) => item.quantity === 20)).toBe(true);
    expect(projected.reduce((sum, item) => sum + item.totalAmount, 0)).toBeCloseTo(40, 6);
  });

  it("borne une croissance aberrante dans les deux sens", () => {
    const hausse = projectDividendYear(
      [
        event({ date: "2025-05-20T00:00:00.000Z", year: 2025, amountPerShare: 1 }),
        event({ date: "2026-05-20T00:00:00.000Z", year: 2026, amountPerShare: 3 })
      ],
      TARGET_YEAR
    );
    const baisse = projectDividendYear(
      [
        event({ date: "2025-05-20T00:00:00.000Z", year: 2025, amountPerShare: 4 }),
        event({ date: "2026-05-20T00:00:00.000Z", year: 2026, amountPerShare: 1 })
      ],
      TARGET_YEAR
    );

    expect(hausse[0].amountPerShare).toBeCloseTo(4.5, 6);
    expect(baisse[0].amountPerShare).toBeCloseTo(0.5, 6);
  });

  it("projette sans croissance quand l'annee de reference est absente", () => {
    const projected = projectDividendYear([event({ date: "2026-05-20T00:00:00.000Z", year: 2026, amountPerShare: 2 })], TARGET_YEAR);

    expect(projected[0].amountPerShare).toBeCloseTo(2, 6);
  });

  it("ignore un actif sans dividende sur l'annee de base", () => {
    const projected = projectDividendYear(
      [
        event({ date: "2025-05-20T00:00:00.000Z", year: 2025, symbol: "ORA.PA" }),
        event({ date: "2026-05-20T00:00:00.000Z", year: 2026, amountPerShare: 0, symbol: "SAN.PA" })
      ],
      TARGET_YEAR
    );

    expect(projected).toEqual([]);
  });

  it("ramene le 29 fevrier au 28 et ecarte une date invalide", () => {
    const projected = projectDividendYear(
      [
        event({ date: "2028-02-29T00:00:00.000Z", year: 2028, symbol: "TTE.PA" }),
        event({ date: "date-invalide", year: 2028, symbol: "ENGI.PA" })
      ],
      2029
    );

    expect(projected).toHaveLength(1);
    expect(projected[0].date).toBe("2029-02-28T00:00:00.000Z");
  });

  it("expose les annees servant de base et de reference", () => {
    expect(projectionBasisYears(TARGET_YEAR)).toEqual({ base: 2026, reference: 2025 });
  });
});
