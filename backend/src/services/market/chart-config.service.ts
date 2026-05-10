/**
 * Role du fichier : lire et valider `config.json`, qui pilote les intervals
 * utilises pour construire et servir les charts marche. Le fichier ne contient
 * volontairement aucun champ de marche: le marche reste deduit de l'asset.
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { RangeKey } from "@pea/shared";
import { config } from "../../config.js";

export type StoredChartRange = "1d" | "1w" | "1m" | "all";
export type ChartInterval = "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1d";

const rangeAliases: Record<string, StoredChartRange> = {
  max: "all",
  all: "all",
  "1d": "1d",
  "1w": "1w",
  "1m": "1m",
  "1y": "all",
  "1a": "all",
  "5y": "all",
  "5a": "all",
  "10y": "all",
  "10a": "all",
  ytd: "all"
};

const chartConfigSchema = z.object({
  charts: z.object({
    "1d": z.object({ interval: z.enum(["5m", "15m", "30m", "1h"]) }),
    "1w": z.object({ interval: z.enum(["5m", "15m", "30m", "1h", "2h", "4h", "1d"]) }),
    "1m": z.object({ interval: z.enum(["15m", "30m", "1h", "2h", "4h", "1d"]) })
  }),
  marketLiveRefresh: z.object({
    snapshotsIntervalMinutes: z.number().positive().default(5),
    portfolioChartsIntervalMinutes: z.number().positive().default(30),
    lazyChartRefreshThresholdRatio: z.number().positive().max(1).default(0.3)
  }).default({
    snapshotsIntervalMinutes: 5,
    portfolioChartsIntervalMinutes: 30,
    lazyChartRefreshThresholdRatio: 0.3
  })
});

export type ChartConfig = z.infer<typeof chartConfigSchema>;

const defaultConfig: ChartConfig = {
  charts: {
    "1d": { interval: "5m" },
    "1w": { interval: "2h" },
    "1m": { interval: "4h" }
  },
  marketLiveRefresh: {
    snapshotsIntervalMinutes: 5,
    portfolioChartsIntervalMinutes: 30,
    lazyChartRefreshThresholdRatio: 0.3
  }
};

export function normalizeStoredRange(range: RangeKey | string): StoredChartRange {
  return rangeAliases[String(range).toLowerCase()] ?? "1m";
}

export class ChartConfigService {
  /**
   * Charge le fichier config.json et retombe sur la configuration documentee si
   * le fichier est absent. Les erreurs de format restent explicites.
   */
  loadChartConfig(): ChartConfig {
    if (!fs.existsSync(config.chartConfigPath)) {
      fs.mkdirSync(path.dirname(config.chartConfigPath), { recursive: true });
      fs.writeFileSync(config.chartConfigPath, `${JSON.stringify(defaultConfig, null, 2)}\n`);
      return defaultConfig;
    }
    const raw = JSON.parse(fs.readFileSync(config.chartConfigPath, "utf8"));
    return this.validateChartConfig(raw);
  }

  /**
   * Valide les intervals configurables par l'utilisateur.
   */
  validateChartConfig(value: unknown): ChartConfig {
    return chartConfigSchema.parse(value);
  }

  /**
   * Retourne l'interval effectif pour une range. `max` est accepte comme alias
   * historique de `all`.
   */
  getIntervalForRange(range: RangeKey | string): ChartInterval {
    const storedRange = normalizeStoredRange(range);
    if (storedRange === "all") return "1d";
    return this.loadChartConfig().charts[storedRange].interval;
  }

  getMarketLiveRefreshConfig() {
    return this.loadChartConfig().marketLiveRefresh;
  }

  getSnapshotRefreshIntervalMs() {
    return this.getMarketLiveRefreshConfig().snapshotsIntervalMinutes * 60 * 1000;
  }

  getPortfolioChartRefreshIntervalMs() {
    return this.getMarketLiveRefreshConfig().portfolioChartsIntervalMinutes * 60 * 1000;
  }

  getLazyChartRefreshThresholdMs() {
    const live = this.getMarketLiveRefreshConfig();
    return live.portfolioChartsIntervalMinutes * live.lazyChartRefreshThresholdRatio * 60 * 1000;
  }
}

export const chartConfigService = new ChartConfigService();
