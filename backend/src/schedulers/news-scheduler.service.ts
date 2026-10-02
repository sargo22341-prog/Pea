import { config } from "../config.js";
import { prefetchUsersNews } from "../services/news/news-prefetch.service.js";
import { logger } from "../services/shared/logger.service.js";
import { getZonedDateParts } from "../services/timezone/date-time.service.js";
import { runWithYahooUsageSource } from "../services/yahoo/yahoo-usage-context.js";

const tickIntervalMs = 15 * 60 * 1000;
/** Un flux plus récent que cet âge n'est pas re-téléchargé par le préchargement. */
export const newsPrefetchIntervalMs = 90 * 60 * 1000;
/** Fenêtre (heure locale de l'application) où les actualités sont préchargées. */
const prefetchStartHour = 7;
const prefetchEndHour = 22;

/** Vrai pendant la fenêtre de préchargement, dans le fuseau de l'application. */
export function isNewsPrefetchWindow(now: Date, timezone = config.appTimezone) {
  const { hour } = getZonedDateParts(now, timezone);
  return hour >= prefetchStartHour && hour < prefetchEndHour;
}

/**
 * Précharge en journée les actualités des positions détenues et le flux global, pour que la page
 * Actualités serve son cache au lieu d'attendre Yahoo. Le premier tick part au démarrage.
 */
export class NewsSchedulerService {
  private timer?: NodeJS.Timeout | undefined;
  private inFlightTick?: Promise<void> | undefined;
  private lastRunAt?: number | undefined;
  private abortController = new AbortController();

  start() {
    if (this.timer) return;
    this.abortController = new AbortController();
    this.timer = setInterval(() => void this.runTick(), tickIntervalMs);
    this.timer.unref();
    void this.runTick();
    logger.info("news", "news scheduler started", { intervalMs: tickIntervalMs, prefetchIntervalMs: newsPrefetchIntervalMs, prefetchStartHour, prefetchEndHour });
  }

  /** Arrête le planificateur ; le préchargement en cours s'interrompt après le flux en cours. */
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.abortController.abort();
    await this.inFlightTick;
  }

  private runTick() {
    this.inFlightTick ??= this.tick().finally(() => { this.inFlightTick = undefined; });
    return this.inFlightTick;
  }

  async tick(now = new Date()) {
    if (!isNewsPrefetchWindow(now)) return;
    if (this.lastRunAt !== undefined && now.getTime() - this.lastRunAt < newsPrefetchIntervalMs) return;
    this.lastRunAt = now.getTime();
    // Tick lancé sans attente par setInterval : un rejet non géré arrêterait le processus.
    try {
      const result = await runWithYahooUsageSource("tache scheduler: news-prefetch", () => prefetchUsersNews(newsPrefetchIntervalMs / 1000, this.abortController.signal));
      logger.info("news", "news prefetch completed", { ...result });
    } catch (error) {
      logger.error("news", "news prefetch failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const newsScheduler = new NewsSchedulerService();
