import type { AssetEarnings, EarningsQuarter, NextEarnings } from "@pea/shared";
import { rawArray, rawRecord, type YahooSummaryRaw } from "../../yahoo.raw.js";
import { firstRawDate, rawDate, rawNonZeroNumber, rawNumber, rawString } from "../../utils/raw-values.js";

/** Nombre de trimestres publiés affichés. */
export const EARNINGS_QUARTERS_LIMIT = 4;

function surprise(actual: number | undefined, estimate: number | undefined) {
  if (actual === undefined || estimate === undefined || estimate === 0) return undefined;
  return (actual - estimate) / Math.abs(estimate);
}

/** Trimestres de `earningsHistory`, complétés par le graphique `earnings` quand l'historique est vide. */
function quartersFromSummary(summary: YahooSummaryRaw): EarningsQuarter[] {
  const history = rawArray<unknown>(summary.earningsHistory?.history).flatMap((entry): EarningsQuarter[] => {
    const row = rawRecord(entry);
    const endDate = rawDate(row["quarter"]);
    const epsActual = rawNumber(row["epsActual"]);
    const epsEstimate = rawNumber(row["epsEstimate"]);
    if (!endDate || (epsActual === undefined && epsEstimate === undefined)) return [];
    const period = rawString(row["period"]) ?? endDate;
    return [{ period, endDate, epsActual, epsEstimate, surprisePercent: rawNumber(row["surprisePercent"]) ?? surprise(epsActual, epsEstimate) }];
  });
  const quarters = history.length
    ? history
    : rawArray<unknown>(summary.earnings?.earningsChart?.quarterly).flatMap((entry): EarningsQuarter[] => {
        const row = rawRecord(entry);
        const period = rawString(row["date"]);
        // Yahoo met 0 à la place d'un bénéfice inconnu : un couple nul n'est pas une publication.
        const epsActual = rawNonZeroNumber(row["actual"]);
        const epsEstimate = rawNonZeroNumber(row["estimate"]);
        if (!period || (epsActual === undefined && epsEstimate === undefined)) return [];
        return [{ period, endDate: rawDate(row["periodEndDate"]), epsActual, epsEstimate, surprisePercent: surprise(epsActual, epsEstimate) }];
      });
  return quarters
    .sort((a, b) => (a.endDate ?? a.period).localeCompare(b.endDate ?? b.period))
    .slice(-EARNINGS_QUARTERS_LIMIT);
}

/**
 * Prochaine publication : les estimations de `calendarEvents` se rapportent à la date annoncée,
 * elles sont donc écartées avec elle une fois cette date passée.
 */
function nextEarningsFromSummary(summary: YahooSummaryRaw, now: number): NextEarnings | undefined {
  const earnings = summary.calendarEvents?.earnings;
  if (!earnings) return undefined;
  const next: NextEarnings = {
    date: firstRawDate(earnings.earningsDate),
    isEstimate: Boolean(earnings.isEarningsDateEstimate),
    epsAverage: rawNumber(earnings.earningsAverage),
    epsLow: rawNumber(earnings.earningsLow),
    epsHigh: rawNumber(earnings.earningsHigh),
    revenueAverage: rawNumber(earnings.revenueAverage),
    revenueLow: rawNumber(earnings.revenueLow),
    revenueHigh: rawNumber(earnings.revenueHigh)
  };
  if (next.date !== undefined) return new Date(next.date).getTime() >= now ? next : undefined;
  return next.epsAverage !== undefined || next.revenueAverage !== undefined ? next : undefined;
}

/** Résultats publiés et attentes de la prochaine publication ; absent sans aucune donnée. */
export function earningsFromSummary(summary: YahooSummaryRaw, now = Date.now()): AssetEarnings | undefined {
  const quarters = quartersFromSummary(summary);
  const next = nextEarningsFromSummary(summary, now);
  if (!quarters.length && !next) return undefined;
  const currency = rawString(summary.earnings?.financialCurrency) ?? rawString(rawRecord(rawArray<unknown>(summary.earningsHistory?.history)[0])["currency"]);
  return { quarters, next, currency };
}
