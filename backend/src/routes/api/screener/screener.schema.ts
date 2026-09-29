import { z } from "zod";
import {
  SCREENER_ASSET_TYPES,
  SCREENER_LIMITS,
  SCREENER_PRESET_NAME_MAX_LENGTH,
  SCREENER_SORT_KEYS,
  SCREENER_TEXT_FILTER_MAX_LENGTH
} from "@pea/shared";

interface Limit {
  readonly min: number;
  readonly max: number;
}

/** Nombre borné, accepté en chaîne (paramètre d'URL) comme en nombre (préréglage JSON). */
const bounded = (limit: Limit) => z.coerce.number().min(limit.min).max(limit.max).optional();
const flag = z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")]).optional();
const text = z.string().trim().min(1).max(SCREENER_TEXT_FILTER_MAX_LENGTH).optional();

/** Filtres du screener : clés inconnues refusées, chaque valeur bornée (voir `SCREENER_LIMITS`). */
export const screenerFiltersSchema = z.strictObject({
  peaOnly: flag,
  assetType: z.enum(SCREENER_ASSET_TYPES).optional(),
  sector: text,
  country: text,
  minDividendYield: bounded(SCREENER_LIMITS.dividendYield),
  minTrailingPE: bounded(SCREENER_LIMITS.trailingPE),
  maxTrailingPE: bounded(SCREENER_LIMITS.trailingPE),
  minMarketCap: bounded(SCREENER_LIMITS.marketCap),
  maxMarketCap: bounded(SCREENER_LIMITS.marketCap),
  minChange52w: bounded(SCREENER_LIMITS.change52w),
  maxChange52w: bounded(SCREENER_LIMITS.change52w),
  maxDistanceFromHigh: bounded(SCREENER_LIMITS.distanceFromHigh)
}).refine((filters) => filters.minTrailingPE === undefined || filters.maxTrailingPE === undefined || filters.minTrailingPE <= filters.maxTrailingPE, { message: "PER minimum superieur au maximum", path: ["minTrailingPE"] })
  .refine((filters) => filters.minMarketCap === undefined || filters.maxMarketCap === undefined || filters.minMarketCap <= filters.maxMarketCap, { message: "Capitalisation minimum superieure au maximum", path: ["minMarketCap"] })
  .refine((filters) => filters.minChange52w === undefined || filters.maxChange52w === undefined || filters.minChange52w <= filters.maxChange52w, { message: "Variation minimum superieure au maximum", path: ["minChange52w"] });

/** `GET /api/screener?…` : filtres, tri et sens dans l'URL. */
export function parseScreenerQuery(query: Record<string, unknown>) {
  const { sort, direction, ...filters } = query;
  return {
    filters: screenerFiltersSchema.parse(filters),
    sort: z.enum(SCREENER_SORT_KEYS).default("marketCap").parse(sort),
    direction: z.enum(["asc", "desc"]).default("desc").parse(direction)
  };
}

export const presetBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(SCREENER_PRESET_NAME_MAX_LENGTH),
  filters: screenerFiltersSchema
});

export const presetParamsSchema = z.object({ id: z.coerce.number().int().positive() });
