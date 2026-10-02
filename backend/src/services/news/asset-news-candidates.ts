import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { assetNewsRepository } from "../../repositories/news/asset-news.repository.js";

export interface AssetNewsPositionRow {
  symbol: string;
  name: string;
  quantity: number;
  average_buy_price: number;
  updated_at: string;
}

export interface AssetNewsCandidate {
  symbol: string;
  name: string;
  query: string;
  positionValue: number;
}

/** Fonds dont les actualités « entreprise » n'ont pas de sens (indices, trackers). */
const skippedFundSymbols = new Set(["CW8.PA", "PE500.PA", "WPEA.PA"]);
const fundNamePattern = /\b(ETF|UCITS|MSCI|S&P|STOXX|AMUNDI|LYXOR|ISHARES|VANGUARD|XTRACKERS)\b/i;

/**
 * Indique si un actif doit etre ignore pour les news specifiques.
 */
export function shouldSkipAssetSpecificNews(asset: { symbol: string; name?: string; quoteType?: string | undefined; assetType?: string | undefined }) {
  const quoteType = (asset.quoteType ?? "").toUpperCase();
  const assetType = (asset.assetType ?? "").toUpperCase();
  return (
    assetType === "ETF" ||
    assetType === "FUND" ||
    quoteType.includes("ETF") ||
    quoteType.includes("FUND") ||
    fundNamePattern.test(asset.name ?? "") ||
    skippedFundSymbols.has(asset.symbol.toUpperCase())
  );
}

/**
 * Nettoie un nom Yahoo pour en faire une requete news d'entreprise.
 */
export function companyNewsQuery(name: string | undefined, symbol: string) {
  return (name || symbol)
    .replace(/^L['’]\s*/i, "")
    .replace(/^COMPAGNIE DE\s+/i, "")
    .replace(/\b(SA|SE|S\.A\.|N\.V\.|NV|PLC|ORDINARY SHARES?)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, "")
    .replace(/[.,]+$/g, "")
    .trim();
}

/** Positions de l'utilisateur, lues en base sans enrichissement Yahoo. */
export function listAssetNewsPositions(userId: number): AssetNewsPositionRow[] {
  return portfolioRepository.listPositions(userId);
}

/**
 * Actions détenues pour lesquelles chercher des actualités, des plus grosses positions aux plus
 * petites. Les ETF et fonds sont écartés à partir des métadonnées déjà stockées.
 */
export function listAssetNewsCandidates(positions: AssetNewsPositionRow[]) {
  let skippedFunds = 0;
  const candidates: AssetNewsCandidate[] = [];
  for (const position of positions) {
    const metadata = assetNewsRepository.readMetadata(position.symbol);
    const name = metadata.name ?? position.name;
    if (shouldSkipAssetSpecificNews({ symbol: position.symbol, name, quoteType: metadata.quoteType, assetType: metadata.assetType })) {
      skippedFunds += 1;
      continue;
    }
    candidates.push({
      symbol: position.symbol,
      name: position.name,
      query: companyNewsQuery(name, position.symbol),
      positionValue: position.quantity * position.average_buy_price
    });
  }
  return { candidates: candidates.sort((a, b) => b.positionValue - a.positionValue), skippedFunds };
}
