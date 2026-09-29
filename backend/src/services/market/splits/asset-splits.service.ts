import { DAY_MS } from "@pea/shared";
import { assetSplitsRepository, type AssetSplitSource } from "../../../repositories/market/splits/asset-splits.repository.js";
import { logger } from "../../shared/logger.service.js";

/**
 * Écart maximal entre deux dates d'une même division venant de sources différentes : le module
 * `chart` date la division à l'ouverture du marché, `defaultKeyStatistics` à minuit UTC. Sans
 * cette tolérance, une même division enregistrée deux fois serait appliquée deux fois.
 */
const SPLIT_DATE_TOLERANCE_DAYS = 3;
/** Deux ratios plus proches que cette marge sont considérés identiques (arrondis Yahoo). */
const RATIO_EPSILON = 1e-6;

export interface DetectedSplit {
  date: string;
  numerator: number;
  denominator: number;
}

/** Normalise une division détectée : jour UTC AAAA-MM-JJ et ratio strictement positif, différent de 1. */
export function normalizeDetectedSplit(input: { date: unknown; numerator: unknown; denominator: unknown }): DetectedSplit | undefined {
  const time = input.date instanceof Date ? input.date.getTime() : typeof input.date === "string" ? new Date(input.date).getTime() : Number.NaN;
  const numerator = Number(input.numerator);
  const denominator = Number(input.denominator);
  if (!Number.isFinite(time) || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return undefined;
  if (numerator <= 0 || denominator <= 0 || Math.abs(numerator / denominator - 1) < RATIO_EPSILON) return undefined;
  return { date: new Date(time).toISOString().slice(0, 10), numerator, denominator };
}

function sameSplit(a: DetectedSplit, b: DetectedSplit) {
  const days = Math.abs(Date.parse(`${a.date}T00:00:00.000Z`) - Date.parse(`${b.date}T00:00:00.000Z`)) / DAY_MS;
  return days <= SPLIT_DATE_TOLERANCE_DAYS && Math.abs(a.numerator / a.denominator - b.numerator / b.denominator) < RATIO_EPSILON;
}

export class AssetSplitsService {
  /**
   * Enregistre les divisions encore inconnues d'un actif. Aucune transaction n'est modifiée :
   * chaque utilisateur concerné devra valider l'ajustement.
   */
  recordSplits(asset: { id: number; symbol: string }, splits: DetectedSplit[], source: AssetSplitSource) {
    const known: DetectedSplit[] = assetSplitsRepository.listByAsset(asset.id).map((row) => ({
      date: row.split_date,
      numerator: row.numerator,
      denominator: row.denominator
    }));
    let inserted = 0;
    for (const split of splits) {
      if (known.some((existing) => sameSplit(existing, split))) continue;
      if (assetSplitsRepository.insert(asset.id, { ...split, source })) {
        inserted += 1;
        known.push(split);
        logger.info("market-data", "stock split detected", { symbol: asset.symbol, date: split.date, ratio: `${split.numerator}:${split.denominator}`, source });
      }
    }
    return inserted;
  }
}

export const assetSplitsService = new AssetSplitsService();
