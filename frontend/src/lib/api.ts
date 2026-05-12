/**
 * Rôle du fichier : centraliser les appels HTTP frontend vers l'API backend et
 * typer les réponses déjà transformées en DTO légers.
 */

import type {
  AssetDetails,
  AssetChartDto,
  AssetIcon,
  AuthMe,
  BoursoramaImportRow,
  BoursoramaUpdateRow,
  CreatePositionInput,
  DataConstructionJobDto,
  DashboardSortKey,
  WatchlistSortKey,
  DividendEvent,
  EditablePortfolioTransaction,
  EnrichedSearchResult,
  MarketListId,
  MarketListResponse,
  NewsArticle,
  NewsAssetsPage,
  NewsFeedPage,
  NewsLanguage,
  PortfolioDividends,
  PortfolioAnalysis,
  PortfolioPerformancePoint,
  PortfolioChartDto,
  PortfolioFullDto,
  PositionRangePerformance,
  PortfolioSummary,
  ParsedAvisOperation,
  CalendarEvent,
  Quote,
  RangeKey,
  SearchResult,
  UpdatePositionInput,
  SortDirection,
  TopAndLosersResponse,
  TrackedMarketsSettingsDto,
  User,
  WatchlistItem,
  YahooUsageCallDto,
  YahooUsageStatsDto
} from "@pea/shared";

export type MarketDataRebuildRange = "1d" | "1w" | "1m" | "all" | "all_ranges";
export interface YahooUsageStatsFilters {
  dateFrom?: string;
  dateTo?: string;
  method?: string;
  module?: string;
  ticker?: string;
  source?: string;
  success?: boolean;
  groupBy?: "hour" | "day" | "method" | "module" | "ticker";
  id?: number;
  limit?: number;
}

function yahooUsageQuery(filters: YahooUsageStatsFilters) {
  const params = new URLSearchParams();
  if (filters.id !== undefined) params.set("id", String(filters.id));
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.method) params.set("method", filters.method);
  if (filters.module) params.set("module", filters.module);
  if (filters.ticker) params.set("ticker", filters.ticker);
  if (filters.source) params.set("source", filters.source);
  if (filters.success !== undefined) params.set("success", String(filters.success));
  if (filters.groupBy) params.set("groupBy", filters.groupBy);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  return params.toString();
}
export type MarketEventPayload = {
  type:
    | "market-snapshot-updated"
    | "portfolio-market-updated"
    | "watchlist-market-updated"
    | "portfolio-assets-updated"
    | "watchlist-assets-updated"
    | "portfolio-chart-refresh-started"
    | "portfolio-performance-refresh-started"
    | "asset-chart-refresh-started"
    | "watchlist-chart-refresh-started"
    | "portfolio-chart-updated"
    | "portfolio-performance-updated"
    | "asset-chart-updated"
    | "watchlist-chart-updated"
    | "dashboard-chart-updated"
    | "analysis-updated"
    | "dividends-updated"
    | "scheduler-health-updated";
  markets: string[];
  symbols?: string[];
  symbol?: string;
  range?: string;
  updatedAt?: string;
  startedAt?: string;
};

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * Crée une erreur standardisée lorsqu'une requête est annulée.
 *
 * @returns Erreur DOM compatible avec les traitements React.
 */
function abortError() {
  return new DOMException("Requete annulee", "AbortError");
}

/**
 * Associe un signal d'annulation à une promesse existante.
 *
 * @param promise Promesse d'appel API.
 * @param signal Signal optionnel fourni par un hook.
 * @returns Promesse annulable.
 */
function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      signal.addEventListener("abort", () => reject(abortError()), { once: true });
    })
  ]);
}

/**
 * Déduplique les requêtes GET simultanées vers le même chemin.
 *
 * @param path Chemin API relatif.
 * @param signal Signal d'annulation optionnel.
 * @returns Promesse partagée tant que la requête est en vol.
 */
function dedupedRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  let existing = inFlightRequests.get(path) as Promise<T> | undefined;
  if (!existing) {
    existing = request<T>(path).finally(() => {
      inFlightRequests.delete(path);
    });
    inFlightRequests.set(path, existing);
  }

  return withAbort(existing, signal);
}

/**
 * Exécute un appel HTTP avec gestion JSON, cookies et erreurs applicatives.
 *
 * @param path Chemin API relatif.
 * @param init Options fetch optionnelles.
 * @returns Corps JSON typé ou undefined pour les réponses 204.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers };
  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    credentials: "include",
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
  enrichedSearch: (q: string, signal?: AbortSignal) =>
    request<EnrichedSearchResult[]>(`/api/search/enriched?q=${encodeURIComponent(q.trim())}`, { signal }),
  // Compat: kept for scripts/tests and older UI paths; current screens mostly consume richer asset/dashboard endpoints.
  quote: (symbol: string) => request<Quote>(`/api/quote/${encodeURIComponent(symbol)}`),
  // Compat: SSE is always available behind auth; this endpoint only exposes live-refresh feature flags.
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
  portfolio: (range?: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PortfolioSummary>(`/api/portfolio${range ? `?range=${range}` : ""}`, signal),
  portfolioFull: (range: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PortfolioFullDto>(`/api/portfolio/full?range=${range}`, signal),
  addPosition: (input: CreatePositionInput) =>
    request("/api/portfolio/positions", { method: "POST", body: JSON.stringify(input) }),
  updatePosition: (id: number, input: UpdatePositionInput) =>
    request(`/api/portfolio/positions/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deletePosition: (id: number) => request<void>(`/api/portfolio/positions/${id}`, { method: "DELETE" }),
  positionTransactions: (id: number) => request<EditablePortfolioTransaction[]>(`/api/portfolio/positions/${id}/transactions`),
  createPositionTransaction: (
    positionId: number,
    input: { tradedAt: string; type: "buy" | "sell"; quantity: number; price: number; totalFees?: number; currency: string }
  ) =>
    request<EditablePortfolioTransaction[]>(`/api/portfolio/positions/${positionId}/transactions`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updatePositionTransaction: (
    positionId: number,
    transactionId: string,
    input: { tradedAt: string; type: "buy" | "sell"; quantity: number; price: number; totalFees?: number; currency: string }
  ) =>
    request<EditablePortfolioTransaction[]>(`/api/portfolio/positions/${positionId}/transactions/${transactionId}`, {
      method: "PUT",
      body: JSON.stringify(input)
    }),
  deletePositionTransaction: (positionId: number, transactionId: string) =>
    request<void>(`/api/portfolio/positions/${positionId}/transactions/${transactionId}`, { method: "DELETE" }),
  // Compat: Dashboard now prefers /portfolio/full.
  performance: (range: RangeKey) => request<PortfolioPerformancePoint[]>(`/api/portfolio/performance?range=${range}`),
  // Compat: Dashboard now prefers /portfolio/full.
  portfolioChart: (range: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PortfolioChartDto>(`/api/portfolio/chart?range=${range}`, signal),
  positionsPerformance: (range: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PositionRangePerformance[]>(`/api/portfolio/positions/performance?range=${range}`, signal),
  positionPerformance: (id: number, range: RangeKey, signal?: AbortSignal) =>
    request<PositionRangePerformance>(`/api/portfolio/positions/${id}/performance?range=${range}`, { signal }),
  portfolioDividends: () => request<PortfolioDividends>("/api/portfolio/dividends"),
  portfolioAnalysis: (signal?: AbortSignal) => dedupedRequest<PortfolioAnalysis>("/api/portfolio/analysis", signal),
  asset: (symbol: string, range: RangeKey) => request<AssetDetails>(`/api/assets/${encodeURIComponent(symbol)}?range=${range}`),
  calendarEvents: (signal?: AbortSignal) => dedupedRequest<CalendarEvent[]>("/api/calendar-events", signal),
  calendarEventsForSymbol: (symbol: string, signal?: AbortSignal) => dedupedRequest<CalendarEvent[]>(`/api/calendar-events/${encodeURIComponent(symbol)}`, signal),
  topAndLosers: (signal?: AbortSignal) => dedupedRequest<TopAndLosersResponse>("/api/top-and-losers", signal),
  marketList: (id: MarketListId, signal?: AbortSignal) => dedupedRequest<MarketListResponse>(`/api/market-lists/${id}`, signal),
  watchlist: (range: RangeKey = "1d", signal?: AbortSignal) => {
    const path = `/api/watchlist?range=${range}`;
    return dedupedRequest<WatchlistItem[]>(path, signal);
  },
  addWatchlist: (item: Pick<SearchResult, "symbol" | "name" | "exchange" | "currency">) =>
    request<WatchlistItem>(`/api/watchlist/${encodeURIComponent(item.symbol)}`, { method: "POST", body: JSON.stringify(item) }),
  removeWatchlist: (symbol: string) => request<void>(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" }),
  me: () => request<AuthMe>("/api/auth/me"),
  setup: (input: { username: string; password: string; confirmPassword: string }) =>
    request<User>("/api/auth/setup", { method: "POST", body: JSON.stringify(input) }),
  login: (input: { username: string; password: string }) =>
    request<User>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  updateMe: (input: {
    username?: string;
    password?: string;
    confirmPassword?: string;
    profileIconUrl?: string | null;
    dashboardDefaultSortKey?: DashboardSortKey;
    dashboardDefaultSortDirection?: SortDirection;
    watchlistDefaultSortKey?: WatchlistSortKey;
    watchlistDefaultSortDirection?: SortDirection;
    defaultChartRange?: RangeKey;
    localPeaSearchEnabled?: boolean;
    assetNewsEnabled?: boolean;
    newsLanguages?: NewsLanguage[];
    privacyModeEnabled?: boolean;
  }) =>
    request<User>("/api/auth/me", { method: "PATCH", body: JSON.stringify(input) }),
  uploadProfileIcon: (file: File) => {
    const formData = new FormData();
    formData.append("icon", file);
    return request<User>("/api/auth/me/profile-icon", { method: "POST", body: formData });
  },
  deleteProfileIcon: () => request<void>("/api/auth/me/profile-icon", { method: "DELETE" }),
  uploadAssetIcon: (symbol: string, file: File) => {
    const formData = new FormData();
    formData.append("icon", file);
    return request<AssetIcon>(`/api/assets/${encodeURIComponent(symbol)}/icon`, { method: "POST", body: formData });
  },
  resetAssetIcon: (symbol: string) => request<void>(`/api/assets/${encodeURIComponent(symbol)}/icon`, { method: "DELETE" }),
  assetIcons: () => request<Array<{ symbol: string; name: string; icon?: AssetIcon }>>("/api/asset-icons"),
  dataConstructionStatus: () => request<DataConstructionJobDto>("/api/admin/market-data/construction"),
  yahooUsageStats: (filters: YahooUsageStatsFilters = {}) => {
    const query = yahooUsageQuery(filters);
    return request<YahooUsageStatsDto>(`/api/settings/yahoo-usage/stats${query ? `?${query}` : ""}`);
  },
  yahooUsageCalls: (filters: YahooUsageStatsFilters = {}) => {
    const query = yahooUsageQuery(filters);
    return request<YahooUsageCallDto[]>(`/api/settings/yahoo-usage/calls${query ? `?${query}` : ""}`);
  },
  trackedMarketsSettings: () => request<TrackedMarketsSettingsDto>("/api/admin/market-data/tracked-markets"),
  rebuildMarketData: (range: MarketDataRebuildRange) =>
    request<DataConstructionJobDto>("/api/admin/market-data/rebuild", { method: "POST", body: JSON.stringify({ range }) }),
  // Compat alias for callers that still use the historical rebuild-all helper.
  rebuildAllMarketData: () =>
    request<DataConstructionJobDto>("/api/admin/market-data/rebuild", { method: "POST", body: JSON.stringify({ range: "all_ranges" }) }),
  cleanupUnlinkedMarketAssets: () => request<DataConstructionJobDto>("/api/admin/market-data/cleanup-unlinked-assets", { method: "POST" }),
  refreshAnnexData: () => request<DataConstructionJobDto>("/api/admin/market-data/refresh-annex", { method: "POST" }),
  previewBoursorama: (content: string) =>
    request<BoursoramaImportRow[]>("/api/import/boursorama/preview", { method: "POST", body: JSON.stringify({ content }) }),
  confirmBoursorama: (rows: BoursoramaImportRow[]) =>
    request<{ imported: string[]; skipped: string[]; errors: Array<{ line: number; message: string }>; isPreparing?: boolean; jobId?: string }>("/api/import/boursorama/confirm", {
      method: "POST",
      body: JSON.stringify({ rows })
    }),
  previewBoursoramaUpdate: (content: string) =>
    request<BoursoramaUpdateRow[]>("/api/import/boursorama/update-preview", { method: "POST", body: JSON.stringify({ content }) }),
  confirmBoursoramaUpdate: (rows: BoursoramaUpdateRow[]) =>
    request<{ imported: string[]; skipped: string[]; errors: Array<{ line: number; message: string }>; isPreparing?: boolean; jobId?: string }>("/api/import/boursorama/update-confirm", {
      method: "POST",
      body: JSON.stringify({ rows })
    }),
  previewAvisOperesPdf: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    return request<ParsedAvisOperation[]>("/api/import/avis-operes/preview", { method: "POST", body: formData });
  },
  confirmAvisOperesPdf: (rows: ParsedAvisOperation[]) =>
    request<{ imported: string[]; skipped: string[]; errors: Array<{ line: number; message: string }>; isPreparing?: boolean; jobId?: string }>("/api/import/avis-operes/confirm", {
      method: "POST",
      body: JSON.stringify({ rows })
    })
};
