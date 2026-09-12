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
import { apiUrl, dedupedRequest, request, requestHeaders, resolveApiUrl } from "../api-core";
import { isNativeApp } from "../native-auth";

export type { MarketEventPayload } from "@pea/shared";

const sseReconnectDelaysMs = [1_000, 3_000, 10_000, 30_000];
const nativeSseReconnectDelayMs = 1_500;

/** Un événement illisible est ignoré : il ne doit ni lever dans le listener ni couper le flux. */
function parseEventPayload(eventName: string, data: string): { ok: true; payload: unknown } | { ok: false } {
  try {
    return { ok: true, payload: JSON.parse(data) };
  } catch (error) {
    console.warn("Evenement marche illisible ignore.", { eventName, error });
    return { ok: false };
  }
}

export function subscribeMarketEvents(onEvent: (eventName: string, payload: unknown) => void) {
  function dispatch(eventName: string, data: string) {
    const parsed = parseEventPayload(eventName, data);
    if (parsed.ok) onEvent(eventName, parsed.payload);
  }

  if (!isNativeApp()) {
    let closed = false;
    let retryAttempt = 0;
    let retryTimer: number | undefined;
    let eventSource: EventSource | undefined;
    const registeredEvents = new Set<string>();

    function attachEvent(eventName: string) {
      eventSource?.addEventListener(eventName, (event) => {
        dispatch(eventName, String((event as MessageEvent).data));
      });
    }

    function connect() {
      if (closed) return;
      eventSource?.close();
      eventSource = new EventSource(apiUrl("/api/market/events"), { withCredentials: true });
      eventSource.onopen = () => {
        retryAttempt = 0;
      };
      eventSource.onerror = () => {
        if (closed) return;
        scheduleReconnect();
      };
      for (const eventName of registeredEvents) attachEvent(eventName);
    }

    function scheduleReconnect() {
      if (retryTimer !== undefined) return;
      eventSource?.close();
      const delay = sseReconnectDelaysMs[Math.min(retryAttempt, sseReconnectDelaysMs.length - 1)];
      retryAttempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, delay);
    }

    connect();

    return {
      close: () => {
        closed = true;
        if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        eventSource?.close();
      },
      addEventListener: (eventName: string) => {
        // Un second enregistrement ajouterait un listener en double et dupliquerait chaque événement.
        if (registeredEvents.has(eventName)) return;
        registeredEvents.add(eventName);
        attachEvent(eventName);
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
          if (registeredEvents.has(eventName)) dispatch(eventName, data);
        });
      } catch (error) {
        if (closed || controller.signal.aborted) return;
        console.warn("Reconnexion au flux marche apres erreur.", error);
      }
      // Attendre aussi après une fin de flux normale : sinon un serveur qui ferme la connexion
      // immédiatement provoquerait une boucle de reconnexion sans pause.
      if (!closed) await new Promise((resolve) => setTimeout(resolve, nativeSseReconnectDelayMs));
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
