import type { AssetDetails } from "@pea/shared";

export type AssetTabId = "overview" | "fundamentals" | "analysts" | "dividends" | "news" | "composition" | "performance";

export const DEFAULT_ASSET_TAB: AssetTabId = "overview";
/** Paramètre d'URL qui porte l'onglet actif : partageable et compatible avec le bouton retour. */
export const ASSET_TAB_PARAM = "tab";

const ASSET_TAB_IDS: readonly AssetTabId[] = ["overview", "fundamentals", "analysts", "dividends", "news", "composition", "performance"];

function hasFundDetailsBlock(asset: AssetDetails) {
  const fund = asset.fundDetails;
  return (fund?.holdings?.length ?? 0) > 0 || (fund?.sectorWeightings?.length ?? 0) > 0 || fund?.allocation !== undefined;
}

function hasFundPerformance(asset: AssetDetails) {
  const fund = asset.fundDetails;
  return fund?.trailingReturns !== undefined || (fund?.annualReturns?.length ?? 0) > 0 || fund?.risk !== undefined;
}

/**
 * Onglets affichés pour un actif : un onglet sans aucune donnée est masqué. Les ETF remplacent
 * « Fondamentaux » et « Analystes » par « Composition » et « Performance ».
 */
export function availableAssetTabs(asset: AssetDetails, options: { newsEnabled: boolean }): AssetTabId[] {
  const tabs: AssetTabId[] = ["overview"];
  if (asset.isEtf) {
    if (hasFundDetailsBlock(asset)) tabs.push("composition");
    if (hasFundPerformance(asset)) tabs.push("performance");
  } else {
    if (asset.valuation !== undefined || asset.financialHealth !== undefined || (asset.financials?.length ?? 0) > 0) tabs.push("fundamentals");
    if (asset.analystConsensus !== undefined || asset.analystTrend !== undefined || asset.earnings !== undefined) tabs.push("analysts");
  }
  if (asset.dividends.length > 0) tabs.push("dividends");
  if (options.newsEnabled && asset.news.length > 0) tabs.push("news");
  return tabs;
}

/** Onglet demandé dans l'URL s'il existe pour cet actif, sinon l'aperçu. */
export function resolveAssetTab(requested: string | null, available: readonly AssetTabId[]): AssetTabId {
  const known = ASSET_TAB_IDS.find((id) => id === requested);
  return known && available.includes(known) ? known : DEFAULT_ASSET_TAB;
}
