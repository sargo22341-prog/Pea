import type {
  InstrumentKind,
  PeaEligibilityResult,
  PeaRankingResult,
  Quote,
  SearchResult
} from "@pea/shared";
import peaAssets from "../../data/pea-actio-etf.json" with { type: "json" };

export type SearchAsset = Pick<SearchResult, "symbol" | "name" | "exchange" | "quoteType" | "currency"> & {
  country?: string;
};

export type QuoteAsset = Pick<Quote, "symbol" | "name" | "exchange" | "currency"> & {
  quoteType?: string;
  country?: string;
};

const EEA_SUFFIXES = [".PA", ".AS", ".BR", ".DE", ".MI", ".MC", ".LS", ".VI", ".HE", ".ST", ".CO", ".OL", ".IR"];
const EEA_COUNTRIES = new Set([
  "FR",
  "FRANCE",
  "NL",
  "NETHERLANDS",
  "BE",
  "BELGIUM",
  "DE",
  "GERMANY",
  "IT",
  "ITALY",
  "ES",
  "SPAIN",
  "PT",
  "PORTUGAL",
  "IE",
  "IRELAND",
  "LU",
  "LUXEMBOURG",
  "AT",
  "AUSTRIA",
  "FI",
  "FINLAND",
  "SE",
  "SWEDEN",
  "DK",
  "DENMARK",
  "NO",
  "NORWAY"
]);

const US_EXCHANGES = ["NYSE", "NASDAQ", "AMEX", "NMS", "NYQ", "ASE", "NGM", "NCM", "PCX"];
const EEA_EXCHANGE_HINTS = [
  "PARIS",
  "EURONEXT",
  "AMSTERDAM",
  "BRUSSELS",
  "XETRA",
  "MILAN",
  "MADRID",
  "LISBON",
  "VIENNA",
  "HELSINKI",
  "STOCKHOLM",
  "COPENHAGEN",
  "OSLO",
  "DUBLIN"
];
const ETF_NAME_HINTS = ["ETF", "UCITS", "MSCI", "S&P", "STOXX", "NASDAQ", "AMUNDI", "LYXOR", "ISHARES", "XTRACKERS", "VANGUARD"];
const EXCLUDED_NAME_HINTS = ["WARRANT", "CERTIFICATE", "ETN", "ETC", "PREFERRED", "PREF"];
const ADR_HINTS = [" ADR", "SPONSORED ADR", "ADS"];

export const PEA_STOCK_WHITELIST = new Set(["TTE.PA", "AI.PA", "MC.PA", "OR.PA", "ASML.AS"]);
export const PEA_ETF_WHITELIST = new Set(["CW8.PA", "EWLD.PA", "PAEEM.PA", "PSP5.PA"]);
export const PEA_BLACKLIST = new Set(["AAPL", "AMZN", "MSFT", "GOOGL", "META", "NVDA", "TTE"]);

interface RawPeaAsset {
  code?: string | null;
  symbol?: string | null;
}

export function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeYahooSymbol(symbol: string): string {
  return safeString(symbol).toUpperCase().replace(/\s+/g, "");
}

const LOCAL_PEA_SYMBOLS = new Set(
  Object.entries(peaAssets as unknown as Record<string, RawPeaAsset>).flatMap(([code, item]) =>
    [code, item.code, item.symbol].map((value) => normalizeYahooSymbol(value ?? "")).filter(Boolean)
  )
);

export function rankAssetForPea(asset: SearchAsset | QuoteAsset): PeaRankingResult {
  const eligibility = evaluatePeaEligibility(asset);
  switch (eligibility.status) {
    case "eligible":
      return { score: 100, group: "pea_whitelist", reasons: eligibility.reasons };
    case "likely_eligible":
      return { score: 80, group: "likely_pea_stock", reasons: eligibility.reasons };
    case "not_eligible":
      return {
        score: isUsMarket(asset) ? 20 : 0,
        group: isUsMarket(asset) ? "us_market" : "not_eligible",
        reasons: eligibility.reasons
      };
    case "unknown":
      if (isUcitsEtf(asset)) return { score: 60, group: "ucits_etf_unknown", reasons: eligibility.reasons };
      if (isEeaMarket(asset)) return { score: 70, group: "european_market", reasons: eligibility.reasons };
      return { score: isUsMarket(asset) ? 20 : 40, group: isUsMarket(asset) ? "us_market" : "unknown", reasons: eligibility.reasons };
  }
}

export function sortAssetsForPea<T extends SearchAsset | QuoteAsset>(assets: T[]): T[] {
  return [...assets].sort((a, b) => {
    const rankA = rankAssetForPea(a);
    const rankB = rankAssetForPea(b);
    if (rankA.score !== rankB.score) return rankB.score - rankA.score;
    return normalizeYahooSymbol(a.symbol).localeCompare(normalizeYahooSymbol(b.symbol));
  });
}

export function evaluatePeaEligibility(asset: SearchAsset | QuoteAsset): PeaEligibilityResult {
  const symbol = normalizeYahooSymbol(asset.symbol);
  const name = asset.name;
  const exchange = safeString(asset.exchange);
  const reasons: string[] = [];
  const warnings: string[] = [];
  const kind = detectInstrumentKind(asset);

  const base = {
    symbol: asset.symbol,
    normalizedSymbol: symbol,
    name: safeString(name),
    currency: safeString(asset.currency),
    exchange,
    country: asset.country,
    quoteType: safeString(asset.quoteType),
    kind,
    reasons,
    warnings,
    source: "yahoo-finance2-plus-local-rules" as const
  };

  if (LOCAL_PEA_SYMBOLS.has(symbol)) {
    reasons.push("Present dans le catalogue PEA local");
    return { ...base, status: "eligible", confidence: "high" };
  }

  if (PEA_STOCK_WHITELIST.has(symbol) || PEA_ETF_WHITELIST.has(symbol)) {
    reasons.push("Présent dans la whitelist PEA locale");
    return { ...base, status: "eligible", confidence: "high" };
  }

  if (PEA_BLACKLIST.has(symbol)) {
    reasons.push("Présent dans la blacklist PEA locale");
    return { ...base, status: "not_eligible", confidence: "high" };
  }

  if (isAdr(asset)) {
    reasons.push("ADR ou instrument assimilé détecté");
    return { ...base, status: "not_eligible", confidence: "high" };
  }

  if (isExcludedInstrument(asset)) {
    reasons.push("Instrument exclu détecté");
    return { ...base, status: "not_eligible", confidence: "medium" };
  }

  if (kind === "etf") {
    if (isUcitsEtf(asset) && isEeaMarket(asset)) {
      reasons.push("ETF UCITS européen détecté");
      warnings.push("ETF UCITS détecté, mais éligibilité PEA à vérifier auprès du broker");
      return { ...base, status: "unknown", confidence: "medium" };
    }

    if (!isEeaMarket(asset)) {
      reasons.push("ETF ou fonds cote hors marche EEE");
      return { ...base, status: "not_eligible", confidence: isUsMarket(asset) ? "medium" : "high" };
    }

    reasons.push("ETF détecté sans validation PEA locale");
    warnings.push("Éligibilité PEA ETF à vérifier auprès du broker");
    return { ...base, status: "unknown", confidence: "low" };
  }

  if (hasBlacklistedUnderlyingOnEuropeanVenue(asset)) {
    reasons.push("Sous-jacent US détecté sur une place européenne");
    warnings.push("Instrument européen sur action US: éligibilité PEA à vérifier, non prioritaire");
    return { ...base, status: "unknown", confidence: "medium" };
  }

  if (isUsMarket(asset)) {
    reasons.push("Symbole ou place de cotation US détecté");
    return { ...base, status: "not_eligible", confidence: "high" };
  }

  if (kind === "stock" && (isEeaCountry(asset.country) || isEeaMarket(asset))) {
    reasons.push("Action cotee sur un marche EEE compatible PEA probable");
    return { ...base, status: "likely_eligible", confidence: isEeaCountry(asset.country) ? "high" : "medium" };
  }

  if (kind === "stock") {
    reasons.push("Action non detectee sur un marche EEE");
    return { ...base, status: "not_eligible", confidence: "high" };
  }

  if (isEeaMarket(asset)) {
    reasons.push("Marche EEE detecte, donnees insuffisantes pour conclure");
    return { ...base, status: "unknown", confidence: "medium" };
  }

  reasons.push("Données insuffisantes pour déterminer l’éligibilité PEA");
  return { ...base, status: "unknown", confidence: "low" };
}

function detectInstrumentKind(asset: SearchAsset | QuoteAsset): InstrumentKind {
  const quoteType = safeString(asset.quoteType).toUpperCase();
  const name = safeString(asset.name).toUpperCase();

  if (quoteType === "ETF" || ETF_NAME_HINTS.some((hint) => name.includes(hint))) return "etf";
  if (quoteType === "MUTUALFUND" || quoteType === "FUND") return "fund";
  if (quoteType === "REIT" || name.includes(" REIT")) return "reit";
  if (isAdr(asset)) return "adr";
  if (quoteType === "EQUITY") return "stock";
  return "unknown";
}

function isEeaMarket(asset: SearchAsset | QuoteAsset) {
  const symbol = normalizeYahooSymbol(asset.symbol);
  const exchange = safeString(asset.exchange).toUpperCase();
  return EEA_SUFFIXES.some((suffix) => symbol.endsWith(suffix)) || EEA_EXCHANGE_HINTS.some((hint) => exchange.includes(hint));
}

function isUsMarket(asset: SearchAsset | QuoteAsset) {
  const symbol = normalizeYahooSymbol(asset.symbol);
  const exchange = safeString(asset.exchange).toUpperCase();
  const quoteType = safeString(asset.quoteType).toUpperCase();
  const hasEeaSuffix = EEA_SUFFIXES.some((suffix) => symbol.endsWith(suffix));
  return ((!symbol.includes(".") && !hasEeaSuffix && ["EQUITY", "ETF"].includes(quoteType ?? "")) || US_EXCHANGES.some((hint) => exchange.includes(hint)));
}

function isEeaCountry(country?: string) {
  return safeString(country) ? EEA_COUNTRIES.has(safeString(country).toUpperCase()) : false;
}

function isUcitsEtf(asset: SearchAsset | QuoteAsset) {
  return detectInstrumentKind(asset) === "etf" && safeString(asset.name).toUpperCase().includes("UCITS");
}

function isAdr(asset: SearchAsset | QuoteAsset) {
  const name = safeString(asset.name).toUpperCase();
  return ADR_HINTS.some((hint) => name.includes(hint));
}

function isExcludedInstrument(asset: SearchAsset | QuoteAsset) {
  const name = safeString(asset.name).toUpperCase();
  return EXCLUDED_NAME_HINTS.some((hint) => name.includes(hint)) || detectInstrumentKind(asset) === "fund" || detectInstrumentKind(asset) === "reit";
}

function hasBlacklistedUnderlyingOnEuropeanVenue(asset: SearchAsset | QuoteAsset) {
  const symbol = normalizeYahooSymbol(asset.symbol);
  const suffix = EEA_SUFFIXES.find((candidate) => symbol.endsWith(candidate));
  if (!suffix) return false;
  const baseSymbol = symbol.slice(0, -suffix.length).replace(/^\d+/, "");
  return PEA_BLACKLIST.has(baseSymbol);
}
