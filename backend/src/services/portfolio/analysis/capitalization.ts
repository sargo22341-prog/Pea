import type { CapitalizationBucket, PositionWithMarket } from "@pea/shared";
import { rawNumber, rawString } from "../../yahoo/utils/raw-values.js";
import type { Fundamentals } from "./portfolio-analysis.helpers.js";

/** Capitalisation minimale (en euros) d'une grande capitalisation. */
export const LARGE_CAP_MIN_EUR = 10_000_000_000;
/** Capitalisation minimale (en euros) d'une capitalisation moyenne ; en dessous, petite capitalisation. */
export const MID_CAP_MIN_EUR = 2_000_000_000;

/**
 * Cours approximatifs vers l'euro des devises de cotation courantes d'un PEA. Les tranches sont
 * séparées d'un facteur 5 : un ordre de grandeur suffit et évite un appel de change. Une devise
 * absente de la table laisse la ligne « non classée » plutôt que de la classer à tort.
 */
const APPROXIMATE_EUR_RATES: Readonly<Record<string, number>> = {
  EUR: 1,
  USD: 0.9,
  GBP: 1.17,
  GBp: 0.0117,
  CHF: 1.05,
  DKK: 0.134,
  SEK: 0.09,
  NOK: 0.085,
  PLN: 0.23,
  CZK: 0.04,
  HUF: 0.0025
};

export function capitalizationBucket(marketCap: number | undefined, currency: string | undefined, etf: boolean): CapitalizationBucket {
  if (etf) return "etf";
  const rate = currency ? APPROXIMATE_EUR_RATES[currency] : undefined;
  if (marketCap === undefined || !Number.isFinite(marketCap) || marketCap <= 0 || rate === undefined) return "unknown";
  const marketCapEur = marketCap * rate;
  if (marketCapEur >= LARGE_CAP_MIN_EUR) return "large";
  return marketCapEur >= MID_CAP_MIN_EUR ? "mid" : "small";
}

/** Tranche d'une ligne d'après la capitalisation du cache fundamentals, exprimée dans sa devise de cotation. */
export function positionCapitalizationBucket(position: PositionWithMarket, fundamentals: Fundamentals | undefined, etf: boolean) {
  const marketCap = rawNumber(fundamentals?.price?.marketCap) ?? rawNumber(fundamentals?.summaryDetail?.marketCap);
  const currency = rawString(fundamentals?.price?.currency) ?? position.quote?.currency ?? position.currency;
  return capitalizationBucket(marketCap, currency, etf);
}

/** Devise de cotation (et non devise d'exposition des sous-jacents d'un ETF). */
export function positionCurrency(position: PositionWithMarket) {
  return position.quote?.currency ?? position.currency;
}
