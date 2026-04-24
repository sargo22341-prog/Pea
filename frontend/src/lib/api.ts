import type {
  AssetDetails,
  CreatePositionInput,
  DividendEvent,
  EnrichedSearchResult,
  HistoryPoint,
  PortfolioDividends,
  PortfolioPerformancePoint,
  PortfolioSummary,
  Quote,
  RangeKey,
  SearchResult,
  UpdatePositionInput,
  WatchlistItem
} from "@pea/shared";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Erreur API ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  search: (q: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  enrichedSearch: (q: string) => request<EnrichedSearchResult[]>(`/api/search/enriched?q=${encodeURIComponent(q)}`),
  quote: (symbol: string) => request<Quote>(`/api/quote/${encodeURIComponent(symbol)}`),
  history: (symbol: string, range: RangeKey) =>
    request<HistoryPoint[]>(`/api/history/${encodeURIComponent(symbol)}?range=${range}`),
  dividends: (symbol: string) => request<DividendEvent[]>(`/api/dividends/${encodeURIComponent(symbol)}`),
  portfolio: () => request<PortfolioSummary>("/api/portfolio"),
  addPosition: (input: CreatePositionInput) =>
    request("/api/portfolio/positions", { method: "POST", body: JSON.stringify(input) }),
  updatePosition: (id: number, input: UpdatePositionInput) =>
    request(`/api/portfolio/positions/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deletePosition: (id: number) => request<void>(`/api/portfolio/positions/${id}`, { method: "DELETE" }),
  performance: (range: RangeKey) => request<PortfolioPerformancePoint[]>(`/api/portfolio/performance?range=${range}`),
  portfolioDividends: () => request<PortfolioDividends>("/api/portfolio/dividends"),
  asset: (symbol: string, range: RangeKey) => request<AssetDetails>(`/api/assets/${encodeURIComponent(symbol)}?range=${range}`),
  watchlist: () => request<WatchlistItem[]>("/api/watchlist"),
  addWatchlist: (item: Pick<SearchResult, "symbol" | "name" | "exchange" | "currency">) =>
    request<WatchlistItem>(`/api/watchlist/${encodeURIComponent(item.symbol)}`, { method: "POST", body: JSON.stringify(item) }),
  removeWatchlist: (symbol: string) => request<void>(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" })
};
