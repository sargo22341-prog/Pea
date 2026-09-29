import { approximateEurRate, type CapitalizationBucket, type PositionWithMarket } from "@pea/shared";
import { rawNumber, rawString } from "../../yahoo/utils/raw-values.js";
import type { Fundamentals } from "./portfolio-analysis.helpers.js";

/** Capitalisation minimale (en euros) d'une grande capitalisation. */
export const LARGE_CAP_MIN_EUR = 10_000_000_000;
/** Capitalisation minimale (en euros) d'une capitalisation moyenne ; en dessous, petite capitalisation. */
export const MID_CAP_MIN_EUR = 2_000_000_000;

/**
 * Les tranches sont séparées d'un facteur 5 : le cours de change approximatif partagé suffit. Une
 * devise inconnue laisse la ligne « non classée » plutôt que de la classer à tort.
 */
export function capitalizationBucket(marketCap: number | undefined, currency: string | undefined, etf: boolean): CapitalizationBucket {
  if (etf) return "etf";
  const rate = approximateEurRate(currency);
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
