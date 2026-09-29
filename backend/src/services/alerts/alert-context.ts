import { readNextEventDate } from "../../repositories/calendar-events/calendar-events.repository.js";
import { assetRepository } from "../../repositories/market/asset.repository.js";
import { recommendationHistoryRepository } from "../../repositories/market/analysts/recommendation-history.repository.js";
import { movingAverageNow } from "../market/charts/chart-overlays.service.js";
import type { AlertMarketContext } from "./alert-evaluation.js";

/** Cotation fraîchement stockée par le rafraîchissement live. */
export interface AlertQuote {
  symbol: string;
  price?: number | undefined;
  changePercent?: number | undefined;
  fiftyTwoWeekHigh?: number | undefined;
  fiftyTwoWeekLow?: number | undefined;
  currency?: string | undefined;
}

/**
 * Complète la cotation avec les données déjà en base : MM200 (bougies journalières), dernière
 * recommandation des analystes et prochain détachement annoncé. Les lectures coûteuses ne sont
 * faites que si une alerte du symbole en a besoin.
 */
export function buildAlertContext(quote: AlertQuote, needs: { ma200: boolean; recommendation: boolean; exDividend: boolean }, now: Date): AlertMarketContext {
  const asset = needs.recommendation ? assetRepository.findBySymbol(quote.symbol) : undefined;
  return {
    price: quote.price,
    changePercent: quote.changePercent,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    currency: quote.currency,
    ma200: needs.ma200 ? movingAverageNow(quote.symbol, "ma200", now) : undefined,
    recommendationKey: asset ? recommendationHistoryRepository.latestKey(asset.id) : undefined,
    nextExDividendDate: needs.exDividend ? readNextEventDate(quote.symbol, "ex_dividend", now.toISOString()) : undefined
  };
}
