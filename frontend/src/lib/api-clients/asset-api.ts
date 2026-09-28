import type { AssetDetails, AssetFinancialStatements, AssetIcon, AssetInsights, ChartOverlayKey, RangeKey, SimilarAsset, StatementsPeriod } from "@pea/shared";
import { request } from "../api-core";
import { overlaysQuery } from "./chart-query";

export const assetApi = {
  asset: (symbol: string, range: RangeKey, overlays: readonly ChartOverlayKey[] = []) =>
    request<AssetDetails>(`/api/assets/${encodeURIComponent(symbol)}?range=${range}${overlaysQuery(overlays)}`),
  uploadAssetIcon: (symbol: string, file: File) => {
    const formData = new FormData();
    formData.append("icon", file);
    return request<AssetIcon>(`/api/assets/${encodeURIComponent(symbol)}/icon`, { method: "POST", body: formData });
  },
  resetAssetIcon: (symbol: string) => request<undefined>(`/api/assets/${encodeURIComponent(symbol)}/icon`, { method: "DELETE" }),
  statements: (symbol: string, period: StatementsPeriod, signal?: AbortSignal) =>
    request<AssetFinancialStatements>(`/api/assets/${encodeURIComponent(symbol)}/statements?period=${period}`, { signal: signal ?? null }),
  insights: (symbol: string, signal?: AbortSignal) =>
    request<AssetInsights | null>(`/api/assets/${encodeURIComponent(symbol)}/insights`, { signal: signal ?? null }),
  similarAssets: (symbol: string, signal?: AbortSignal) =>
    request<SimilarAsset[]>(`/api/assets/${encodeURIComponent(symbol)}/similar`, { signal: signal ?? null }),
  assetIcons: () => request<{ symbol: string; name: string; icon?: AssetIcon }[]>("/api/asset-icons")
};
