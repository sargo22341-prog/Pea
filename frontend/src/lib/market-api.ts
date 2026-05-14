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
import { apiUrl, dedupedRequest, request, requestHeaders, resolveApiUrl } from "./api-core";
import { isNativeApp } from "./native-auth";

export type { MarketEventPayload } from "@pea/shared";

export function subscribeMarketEvents(onEvent: (eventName: string, payload: unknown) => void) {
  if (!isNativeApp()) {
    const eventSource = new EventSource(apiUrl("/api/market/events"), { withCredentials: true });
    return {
      close: () => eventSource.close(),
      addEventListener: (eventName: string) => {
        eventSource.addEventListener(eventName, (event) => {
          onEvent(eventName, JSON.parse((event as MessageEvent).data));
        });
      }
    };
  }

  let closed = false;
  let controller: AbortController | undefined;
  const registeredEvents = new Set<string>();

  async function connectLoop() {
    while (!closed) {
      controller = new AbortController();
      try {
        const url = await resolveApiUrl("/api/market/events");
        const response = await fetch(url, {
          headers: await requestHeaders({ headers: { Accept: "text/event-stream" } }),
          credentials: "include",
          signal: controller.signal
        });
        if (!response.ok || !response.body) throw new Error(`Flux marche indisponible (${response.status}).`);
        await readEventStream(response.body, (eventName, data) => {
          if (!registeredEvents.has(eventName)) return;
          onEvent(eventName, JSON.parse(data));
        });
      } catch (error) {
        if (closed || controller.signal.aborted) return;
        console.warn("Reconnexion au flux marche apres erreur.", error);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  void connectLoop();

  return {
    close: () => {
      closed = true;
      controller?.abort();
    },
    addEventListener: (eventName: string) => {
      registeredEvents.add(eventName);
    }
  };
}

async function readEventStream(stream: ReadableStream<Uint8Array>, onEvent: (eventName: string, data: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  const dataLines: string[] = [];

  function flushEvent() {
    if (!dataLines.length) return;
    onEvent(eventName, dataLines.join("\n"));
    eventName = "message";
    dataLines.length = 0;
  }

  while (true) {
    const { value, done } = await reader.read();
    buffer += value ? decoder.decode(value, { stream: !done }) : decoder.decode();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line) {
        flushEvent();
      } else if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }

    if (done) {
      flushEvent();
      break;
    }
  }
}

export const marketApi = {
  search: (q: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  enrichedSearch: (q: string, signal?: AbortSignal) =>
    request<EnrichedSearchResult[]>(`/api/search/enriched?q=${encodeURIComponent(q.trim())}`, { signal }),
  quote: (symbol: string) => request<Quote>(`/api/quote/${encodeURIComponent(symbol)}`),
  marketFeatures: () => request<{ liveRefreshEnabled: boolean }>("/api/market/features"),
  marketEventsUrl: () => apiUrl("/api/market/events"),
  subscribeMarketEvents,
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
