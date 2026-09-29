import {
  SCREENER_MAX_PRESETS_PER_USER,
  SCREENER_MAX_RESULTS,
  type ScreenerFilters,
  type ScreenerOptions,
  type ScreenerPreset,
  type ScreenerQuery,
  type ScreenerResponse,
  type ScreenerRow
} from "@pea/shared";
import { screenerPresetsRepository, type ScreenerPresetRow } from "../../repositories/screener/screener-presets.repository.js";
import { buildScreenerQuery } from "../../repositories/screener/screener-query.js";
import { screenerRepository, type ScreenerDbRow } from "../../repositories/screener/screener.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { isProbablyPeaEligible } from "../assets/peaEligibility.js";

const ETF_QUOTE_TYPES = new Set(["ETF", "MUTUALFUND"]);

function finite(value: number | null) {
  return value !== null && Number.isFinite(value) ? value : undefined;
}

export function toScreenerRow(row: ScreenerDbRow): ScreenerRow {
  const trailingPE = finite(row.trailing_pe);
  return {
    symbol: row.symbol,
    name: row.name,
    isEtf: ETF_QUOTE_TYPES.has(row.quote_type),
    peaEligible: isProbablyPeaEligible({
      symbol: row.symbol,
      name: row.name,
      exchange: row.exchange ?? undefined,
      currency: row.currency ?? "",
      quoteType: row.quote_type,
      ...(row.country ? { country: row.country } : {})
    }),
    sector: row.sector ?? undefined,
    country: row.country ?? undefined,
    currency: row.currency ?? undefined,
    price: finite(row.price),
    // Même règle que la fiche actif : un PER négatif ou nul est « non significatif ».
    trailingPE: trailingPE !== undefined && trailingPE > 0 ? trailingPE : undefined,
    dividendYield: finite(row.dividend_yield),
    marketCap: finite(row.market_cap),
    change52w: finite(row.change_52w),
    distanceFromHigh: finite(row.distance_from_high)
  };
}

function toPreset(row: ScreenerPresetRow): ScreenerPreset {
  return { id: row.id, name: row.name, filters: JSON.parse(row.filters_json) as ScreenerFilters, createdAt: row.created_at };
}

export const screenerService = {
  /** Filtres SQL puis éligibilité PEA (règle unique `peaEligibility.ts`), limité à `SCREENER_MAX_RESULTS`. */
  search(query: ScreenerQuery): ScreenerResponse {
    const rows = screenerRepository.run(buildScreenerQuery(query))
      .map(toScreenerRow)
      .filter((row) => !query.filters.peaOnly || row.peaEligible);
    return { rows: rows.slice(0, SCREENER_MAX_RESULTS), total: rows.length, truncated: rows.length > SCREENER_MAX_RESULTS };
  },

  options(): ScreenerOptions {
    return screenerRepository.options();
  },

  listPresets(userId: number): ScreenerPreset[] {
    return screenerPresetsRepository.list(userId).map(toPreset);
  },

  savePreset(userId: number, name: string, filters: ScreenerFilters): ScreenerPreset {
    if (!screenerPresetsRepository.exists(userId, name) && screenerPresetsRepository.count(userId) >= SCREENER_MAX_PRESETS_PER_USER) {
      throw new HttpError(400, `Nombre maximal de filtres enregistres atteint (${SCREENER_MAX_PRESETS_PER_USER}).`);
    }
    return toPreset(screenerPresetsRepository.save(userId, name, JSON.stringify(filters)));
  },

  /** 404 pour un préréglage inexistant ou appartenant à un autre utilisateur (aucune fuite d'existence). */
  deletePreset(userId: number, id: number) {
    if (!screenerPresetsRepository.delete(userId, id)) throw new HttpError(404, "Filtre enregistre introuvable.");
  }
};
