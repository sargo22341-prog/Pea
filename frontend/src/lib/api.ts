import type {
  AssetDetails,
  AssetIcon,
  AuthMe,
  BoursoramaImportRow,
  BoursoramaUpdateRow,
  CreatePositionInput,
  DashboardSortKey,
  DividendEvent,
  EnrichedSearchResult,
  HistoryPoint,
  PortfolioDividends,
  PortfolioPerformancePoint,
  PositionRangePerformance,
  PortfolioSummary,
  Quote,
  RangeKey,
  SearchResult,
  UpdatePositionInput,
  SortDirection,
  User,
  WatchlistItem
} from "@pea/shared";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

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
  positionsPerformance: (range: RangeKey) =>
    request<PositionRangePerformance[]>(`/api/portfolio/positions/performance?range=${range}`),
  portfolioDividends: () => request<PortfolioDividends>("/api/portfolio/dividends"),
  asset: (symbol: string, range: RangeKey) => request<AssetDetails>(`/api/assets/${encodeURIComponent(symbol)}?range=${range}`),
  watchlist: (range: RangeKey = "1d") => request<WatchlistItem[]>(`/api/watchlist?range=${range}`),
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
    defaultChartRange?: RangeKey;
    localPeaSearchEnabled?: boolean;
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
  previewBoursorama: (content: string) =>
    request<BoursoramaImportRow[]>("/api/import/boursorama/preview", { method: "POST", body: JSON.stringify({ content }) }),
  confirmBoursorama: (rows: BoursoramaImportRow[]) =>
    request<{ imported: string[]; skipped: string[]; errors: Array<{ line: number; message: string }> }>("/api/import/boursorama/confirm", {
      method: "POST",
      body: JSON.stringify({ rows })
    }),
  previewBoursoramaUpdate: (content: string) =>
    request<BoursoramaUpdateRow[]>("/api/import/boursorama/update-preview", { method: "POST", body: JSON.stringify({ content }) }),
  confirmBoursoramaUpdate: (rows: BoursoramaUpdateRow[]) =>
    request<{ imported: string[]; skipped: string[]; errors: Array<{ line: number; message: string }> }>("/api/import/boursorama/update-confirm", {
      method: "POST",
      body: JSON.stringify({ rows })
    })
};
