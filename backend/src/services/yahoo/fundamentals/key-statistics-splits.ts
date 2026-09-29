import { assetRepository } from "../../../repositories/market/asset.repository.js";
import { assetSplitsService, normalizeDetectedSplit } from "../../market/splits/asset-splits.service.js";
import type { YahooSummaryRaw } from "../yahoo.raw.js";
import { rawDate, rawString } from "../utils/raw-values.js";

const SPLIT_FACTOR_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/;

/** Lit `lastSplitFactor` (« 10:1 ») et `lastSplitDate` de `defaultKeyStatistics`. */
function splitFromKeyStatistics(summary: YahooSummaryRaw) {
  const stats = summary.defaultKeyStatistics;
  const match = SPLIT_FACTOR_PATTERN.exec(rawString(stats?.lastSplitFactor) ?? "");
  const date = rawDate(stats?.lastSplitDate);
  if (!match || !date) return undefined;
  return normalizeDetectedSplit({ date, numerator: match[1], denominator: match[2] });
}

/**
 * Contrôle complémentaire des divisions détectées via `chart` : couvre une division plus ancienne
 * que l'historique de dividendes téléchargé. Sans effet si l'actif n'est pas encore connu.
 */
export function recordSplitsFromKeyStatistics(symbol: string, summary: YahooSummaryRaw) {
  const split = splitFromKeyStatistics(summary);
  if (!split) return 0;
  const asset = assetRepository.findBySymbol(symbol);
  if (!asset) return 0;
  return assetSplitsService.recordSplits(asset, [split], "yahoo-key-statistics");
}
