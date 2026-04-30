/**
 * Role du fichier : lire et valider `config.json`, qui pilote les intervals
 * utilises pour construire et servir les charts marche. Le fichier ne contient
 * volontairement aucun champ de marche: le marche reste deduit de l'asset.
 */

import fs from "node:fs";
import { z } from "zod";
import type { RangeKey } from "@pea/shared";
import { config } from "../config.js";

export type StoredChartRange = Extract<RangeKey, "1d" | "1w" | "1m" | "1y" | "ytd" | "all">;
export type ChartInterval = "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1d";

const rangeAliases: Record<string, StoredChartRange> = {
  max: "all",
  all: "all",
  "1d": "1d",
  "1w": "1w",
  "1m": "1m",
  "1y": "1y",
  ytd: "ytd"
};

const chartConfigSchema = z.object({
  charts: z.object({
    "1d": z.object({ interval: z.enum(["5m", "15m", "30m", "1h"]) }),
    "1w": z.object({ interval: z.enum(["5m", "15m", "30m", "1h", "2h", "4h", "1d"]) }),
    "1m": z.object({ interval: z.enum(["15m", "30m", "1h", "2h", "4h", "1d"]) }),
    "1y": z.object({ interval: z.enum(["1d"]) }),
    ytd: z.object({ interval: z.enum(["1h", "2h", "4h", "1d"]) }),
    all: z.object({ interval: z.enum(["1d"]) })
  })
});

export type ChartConfig = z.infer<typeof chartConfigSchema>;

const defaultConfig: ChartConfig = {
  charts: {
    "1d": { interval: "5m" },
    "1w": { interval: "2h" },
    "1m": { interval: "1d" },
    "1y": { interval: "1d" },
    ytd: { interval: "1d" },
    all: { interval: "1d" }
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
    if (!fs.existsSync(config.chartConfigPath)) return defaultConfig;
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
    return this.loadChartConfig().charts[normalizeStoredRange(range)].interval;
  }
}

export const chartConfigService = new ChartConfigService();
