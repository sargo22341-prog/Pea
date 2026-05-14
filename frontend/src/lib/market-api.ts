import type {
  AssetChartDto,
  CalendarEvent,
  DividendEvent,
  EnrichedSearchResult,
  MarketListId,
  MarketListResponse,
  NewsArticle,
  NewsAssetsPage,
  NewsFeedPage,
  Quote,
  RangeKey,
  SearchResult,
  TopAndLosersResponse,
  WatchlistItem
} from "@pea/shared";
import { baseUrl, dedupedRequest, request } from "./api-core";

export type { MarketEventPayload } from "@pea/shared";

export const marketApi = {
  search: (q: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  enrichedSearch: (q: string, signal?: AbortSignal) =>
    request<EnrichedSearchResult[]>(`/api/search/enriched?q=${encodeURIComponent(q.trim())}`, { signal }),
  quote: (symbol: string) => request<Quote>(`/api/quote/${encodeURIComponent(symbol)}`),
  marketFeatures: () => request<{ liveRefreshEnabled: boolean }>("/api/market/features"),
  marketEventsUrl: () => `${baseUrl}/api/market/events`,
  requestChartRefresh: (input: { scope: "asset"; symbol: string; range?: "1d" } | { scope: "portfolio" | "watchlist"; range?: "1d" }) =>
    request<{ status: string }>("/api/market/chart-refresh", { method: "POST", body: JSON.stringify(input) }),
  history: (symbol: string, range: RangeKey) =>
    request<AssetChartDto>(`/api/history/${encodeURIComponent(symbol)}?range=${range}`),
  dividends: (symbol: string) => request<DividendEvent[]>(`/api/dividends/${encodeURIComponent(symbol)}`),
  news: (symbol: string) => request<NewsArticle[]>(`/api/news/${encodeURIComponent(symbol)}`),
  globalNews: (page: number, signal?: AbortSignal) => request<NewsFeedPage>(`/api/news-global?page=${page}`, { signal }),
  assetNews: (limit = 8, offset = 0, signal?: AbortSignal) =>
    request<NewsAssetsPage>(`/api/news-assets?limit=${limit}&offset=${offset}`, { signal }),
  calendarEvents: (signal?: AbortSignal) => dedupedRequest<CalendarEvent[]>("/api/calendar-events", signal),
  calendarEventsForSymbol: (symbol: string, signal?: AbortSignal) => dedupedRequest<CalendarEvent[]>(`/api/calendar-events/${encodeURIComponent(symbol)}`, signal),
  topAndLosers: (signal?: AbortSignal) => dedupedRequest<TopAndLosersResponse>("/api/top-and-losers", signal),
  marketList: (id: MarketListId, signal?: AbortSignal) => dedupedRequest<MarketListResponse>(`/api/market-lists/${id}`, signal),
  watchlist: (range: RangeKey = "1d", signal?: AbortSignal) => dedupedRequest<WatchlistItem[]>(`/api/watchlist?range=${range}`, signal),
  addWatchlist: (item: Pick<SearchResult, "symbol" | "name" | "exchange" | "currency">) =>
    request<WatchlistItem>(`/api/watchlist/${encodeURIComponent(item.symbol)}`, { method: "POST", body: JSON.stringify(item) }),
  removeWatchlist: (symbol: string) => request<void>(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" })
};
