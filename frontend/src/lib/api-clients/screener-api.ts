import type { ScreenerFilters, ScreenerOptions, ScreenerPreset, ScreenerQuery, ScreenerResponse } from "@pea/shared";
import { request } from "../api-core";

/** Paramètres d'URL du screener : seules les valeurs renseignées sont transmises. */
export function screenerSearchParams({ filters, sort, direction }: ScreenerQuery) {
  const params = new URLSearchParams({ sort, direction });
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === false || (key === "assetType" && value === "all")) continue;
    params.set(key, String(value));
  }
  return params;
}

export const screenerApi = {
  screener: (query: ScreenerQuery, signal?: AbortSignal) =>
    request<ScreenerResponse>(`/api/screener?${screenerSearchParams(query).toString()}`, signal ? { signal } : undefined),
  screenerOptions: (signal?: AbortSignal) => request<ScreenerOptions>("/api/screener/options", signal ? { signal } : undefined),
  screenerPresets: (signal?: AbortSignal) => request<ScreenerPreset[]>("/api/screener/presets", signal ? { signal } : undefined),
  saveScreenerPreset: (name: string, filters: ScreenerFilters) =>
    request<ScreenerPreset>("/api/screener/presets", { method: "POST", body: JSON.stringify({ name, filters }) }),
  deleteScreenerPreset: (id: number) => request<undefined>(`/api/screener/presets/${encodeURIComponent(String(id))}`, { method: "DELETE" })
};
