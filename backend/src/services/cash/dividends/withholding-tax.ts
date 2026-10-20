import type { WithholdingBasis } from "@pea/shared";
import { isValidIsin, normalizeIsin } from "../../../utils/isin.js";

/**
 * Retenue à la source estimée sur un dividende encaissé dans un PEA.
 *
 * Dans un PEA, la retenue prélevée par le pays de la société n'est ni récupérable ni imputable :
 * elle est définitivement perdue, et les courtiers appliquent en pratique le taux domestique de
 * ce pays (sans réduction conventionnelle à la source). La fiscalité française (prélèvements
 * sociaux) ne s'applique qu'au retrait et n'est jamais déduite ici.
 *
 * Taux domestiques des dividendes versés à des non-résidents, vérifiés le 2026-10-20 :
 * - PwC Worldwide Tax Summaries (Italie 26 %, revue 02/2026 ; Portugal 25 %, revue 07/2026) ;
 * - pea.fr, guide fiscalité PEA (Allemagne 26,375 %, Pays-Bas 15 %, Italie 26 %, Espagne 19 %) ;
 * - administrations fiscales nationales : Belgique (précompte mobilier 30 %), Irlande (DWT 25 %),
 *   Luxembourg (15 %), Autriche (KESt 27,5 %).
 * Ces taux évoluent : la proposition reste modifiable avant validation.
 */
export const WITHHOLDING_RATES_VERIFIED_AT = "2026-10-20";

interface CountryWithholding {
  rate: number;
  /** Taux incertain pour une partie des titres du pays (fonds exonérés, par exemple). */
  needsReview: boolean;
}

/** Société française : aucune retenue dans un PEA. */
export const FRANCE_WITHHOLDING_RATE = 0;
/** Allemagne : Kapitalertragsteuer 25 % + Solidaritätszuschlag 5,5 % de cet impôt. */
export const GERMANY_WITHHOLDING_RATE = 0.26375;
export const NETHERLANDS_WITHHOLDING_RATE = 0.15;
export const ITALY_WITHHOLDING_RATE = 0.26;
export const SPAIN_WITHHOLDING_RATE = 0.19;
export const BELGIUM_WITHHOLDING_RATE = 0.3;
/** Irlande : les sociétés subissent 25 %, mais les fonds (ETF UCITS distribuants) en sont exonérés. */
export const IRELAND_WITHHOLDING_RATE = 0.25;
/** Luxembourg : 15 % pour les sociétés, mais les SICAV et ETF luxembourgeois en sont exonérés. */
export const LUXEMBOURG_WITHHOLDING_RATE = 0.15;
export const PORTUGAL_WITHHOLDING_RATE = 0.25;
export const AUSTRIA_WITHHOLDING_RATE = 0.275;

const countryWithholdings: Readonly<Record<string, CountryWithholding>> = {
  FR: { rate: FRANCE_WITHHOLDING_RATE, needsReview: false },
  DE: { rate: GERMANY_WITHHOLDING_RATE, needsReview: false },
  NL: { rate: NETHERLANDS_WITHHOLDING_RATE, needsReview: false },
  IT: { rate: ITALY_WITHHOLDING_RATE, needsReview: false },
  ES: { rate: SPAIN_WITHHOLDING_RATE, needsReview: false },
  BE: { rate: BELGIUM_WITHHOLDING_RATE, needsReview: false },
  IE: { rate: IRELAND_WITHHOLDING_RATE, needsReview: true },
  LU: { rate: LUXEMBOURG_WITHHOLDING_RATE, needsReview: true },
  PT: { rate: PORTUGAL_WITHHOLDING_RATE, needsReview: false },
  AT: { rate: AUSTRIA_WITHHOLDING_RATE, needsReview: false }
};

/**
 * Pays de cotation déduit du suffixe Yahoo, faute d'ISIN : il diffère parfois du pays de la
 * société (Airbus, néerlandaise, cote à Paris), la proposition est donc toujours à vérifier.
 */
const listingCountries: Readonly<Record<string, string>> = {
  PA: "FR",
  DE: "DE",
  F: "DE",
  AS: "NL",
  MI: "IT",
  MC: "ES",
  BR: "BE",
  IR: "IE",
  LS: "PT",
  VI: "AT"
};

export interface WithholdingEstimate {
  country?: string | undefined;
  rate: number;
  basis: WithholdingBasis;
  needsReview: boolean;
}

function listingCountry(symbol: string) {
  const dot = symbol.lastIndexOf(".");
  return dot === -1 ? undefined : listingCountries[symbol.slice(dot + 1).toUpperCase()];
}

/**
 * Taux de retenue d'un titre : pays du préfixe ISIN quand il est connu (avis d'opéré importé),
 * sinon pays de cotation. Un pays absent de la table donne 0 % et un montant à vérifier.
 */
export function estimateWithholding(isin: string | null | undefined, symbol: string): WithholdingEstimate {
  const normalizedIsin = isin ? normalizeIsin(isin) : undefined;
  const fromIsin = normalizedIsin && isValidIsin(normalizedIsin) ? normalizedIsin.slice(0, 2) : undefined;
  const country = fromIsin ?? listingCountry(symbol);
  const basis: WithholdingBasis = fromIsin ? "isin" : country ? "listing" : "unknown";
  const known = country === undefined ? undefined : countryWithholdings[country];
  if (!known) return { country, rate: 0, basis, needsReview: true };
  return { country, rate: known.rate, basis, needsReview: known.needsReview || basis !== "isin" };
}
