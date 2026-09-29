import { CHART_OVERLAY_KEYS, DAY_MS, type AssetChartDto, type ChartOverlayKey } from "@pea/shared";
import { z } from "zod";
import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import { assetRepository } from "../../../repositories/market/asset.repository.js";
import { CALENDAR_DAYS_PER_TRADING_DAY, MOVING_AVERAGE_WINDOWS, movingAverageAt } from "./moving-average.js";

/** Les moyennes mobiles se calculent sur les bougies journalières de l'historique complet. */
const DAILY_RANGE = "all";
const DAILY_INTERVAL = "1d";

const overlaysSchema = z
  .string()
  .max(32)
  .optional()
  .transform((value) => (value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []))
  .pipe(z.array(z.enum(CHART_OVERLAY_KEYS)));

/** Lit `?overlays=ma50,ma200` ; un calque inconnu est rejeté (400) plutôt qu'ignoré. */
export function parseChartOverlays(value: unknown): ChartOverlayKey[] {
  return [...new Set(overlaysSchema.parse(value))];
}

/**
 * Ajoute au graphique les moyennes mobiles demandées, alignées point par point sur les instants
 * affichés (après réduction de la série). Sans demande, le graphique est rendu inchangé.
 */
export function withMovingAverages(chart: AssetChartDto, overlays: readonly ChartOverlayKey[]): AssetChartDto {
  const firstTimestamp = chart.timestamps[0];
  if (!overlays.length || firstTimestamp === undefined) return chart;
  const asset = assetRepository.findBySymbol(chart.symbol);
  if (!asset) return chart;
  const longestWindow = Math.max(...overlays.map((key) => MOVING_AVERAGE_WINDOWS[key]));
  const sinceIso = new Date(firstTimestamp - Math.ceil(longestWindow * CALENDAR_DAYS_PER_TRADING_DAY) * DAY_MS).toISOString();
  const closes = candleRepository
    .readCandles(asset.id, DAILY_RANGE, DAILY_INTERVAL, sinceIso)
    .map((candle) => ({ time: new Date(candle.date).getTime(), close: candle.close }));
  const movingAverages: NonNullable<AssetChartDto["movingAverages"]> = {};
  for (const key of overlays) movingAverages[key] = movingAverageAt(chart.timestamps, closes, MOVING_AVERAGE_WINDOWS[key]);
  return { ...chart, movingAverages };
}

/** Moyenne mobile d'un actif à un instant (dernières clôtures journalières stockées), sans appel Yahoo. */
export function movingAverageNow(symbol: string, key: ChartOverlayKey, at: Date): number | undefined {
  const asset = assetRepository.findBySymbol(symbol);
  if (!asset) return undefined;
  const window = MOVING_AVERAGE_WINDOWS[key];
  const sinceIso = new Date(at.getTime() - Math.ceil(window * CALENDAR_DAYS_PER_TRADING_DAY) * DAY_MS).toISOString();
  const closes = candleRepository
    .readCandles(asset.id, DAILY_RANGE, DAILY_INTERVAL, sinceIso)
    .map((candle) => ({ time: new Date(candle.date).getTime(), close: candle.close }));
  return movingAverageAt([at.getTime()], closes, window)[0] ?? undefined;
}
