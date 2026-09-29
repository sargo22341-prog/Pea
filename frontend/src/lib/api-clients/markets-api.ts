import type { MarketListId, MarketListResponse, MarketOverviewResponse } from "@pea/shared";
import { dedupedRequest } from "../api-core";

export const marketsApi = {
  marketOverview: (signal?: AbortSignal) => dedupedRequest<MarketOverviewResponse>("/api/markets/overview", signal),
  marketList: (id: MarketListId, peaOnly: boolean, signal?: AbortSignal) =>
    dedupedRequest<MarketListResponse>(`/api/market-lists/${id}${peaOnly ? "?peaOnly=true" : ""}`, signal)
};
