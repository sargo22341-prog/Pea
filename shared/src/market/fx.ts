/**
 * Cours approximatifs vers l'euro des devises de cotation courantes. Un ordre de grandeur suffit
 * pour classer ou trier des capitalisations sans appel de change ; une devise absente de la table
 * reste « non convertible » plutôt que d'être comparée à tort.
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
  HUF: 0.0025,
  CAD: 0.65,
  AUD: 0.6,
  JPY: 0.006,
  HKD: 0.115,
  KRW: 0.00065
};

/** Cours approximatif d'une devise vers l'euro ; `undefined` pour une devise inconnue. */
export function approximateEurRate(currency: string | undefined): number | undefined {
  return currency === undefined ? undefined : APPROXIMATE_EUR_RATES[currency];
}

/** Devises convertibles, avec leur cours approximatif (pour construire une conversion SQL). */
export function approximateEurRates(): readonly (readonly [currency: string, rate: number])[] {
  return Object.entries(APPROXIMATE_EUR_RATES);
}
