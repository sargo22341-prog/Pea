import type { ChartOverlayKey } from "@pea/shared";

/**
 * Moyennes mobiles simples calculées localement sur les clôtures journalières stockées.
 * Aucun appel Yahoo : les bougies `all / 1d` sont déjà en base.
 */

export interface DailyClose {
  /** Début de la bougie journalière (ms). */
  time: number;
  close: number;
}

/** Fenêtres proposées sur le graphique de cours (jours de bourse). */
export const MOVING_AVERAGE_WINDOWS: Readonly<Record<ChartOverlayKey, number>> = { ma50: 50, ma200: 200 };

/**
 * Jours calendaires à relire avant le premier point affiché pour disposer de `window` séances :
 * week-ends et jours fériés compris, 1,6 jour calendaire par séance suffit largement.
 */
export const CALENDAR_DAYS_PER_TRADING_DAY = 1.6;

/** Première clôture d'index > `time` (recherche dichotomique, clôtures triées). */
function firstIndexAfter(closes: DailyClose[], time: number) {
  let low = 0;
  let high = closes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((closes[middle]?.time ?? Number.POSITIVE_INFINITY) <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Pour chaque instant affiché, moyenne des `window` dernières clôtures connues à cet instant.
 * Les clôtures illisibles sont ignorées (trous) ; `null` tant que l'historique est trop court.
 */
export function movingAverageAt(timestamps: number[], dailyCloses: DailyClose[], window: number): (number | null)[] {
  const closes = dailyCloses
    .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.close))
    .sort((a, b) => a.time - b.time);
  const prefix = [0];
  for (const row of closes) prefix.push((prefix.at(-1) ?? 0) + row.close);

  return timestamps.map((timestamp) => {
    const count = firstIndexAfter(closes, timestamp);
    if (window <= 0 || count < window) return null;
    return ((prefix[count] ?? 0) - (prefix[count - window] ?? 0)) / window;
  });
}
