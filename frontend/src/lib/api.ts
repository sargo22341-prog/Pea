import type {
  AuthMe,
  AppLanguage,
  BoursoramaImportRow,
  BoursoramaUpdateRow,
  DashboardSortKey,
  NewsLanguage,
  ParsedAvisOperation,
  RangeKey,
  SortDirection,
  User,
  WatchlistSortKey
} from "@pea/shared";
import { adminApi } from "./api-clients/admin-api";
import { alertsApi } from "./api-clients/alerts-api";
import { assetApi } from "./api-clients/asset-api";
import { calendarApi } from "./api-clients/calendar-api";
import { marketApi } from "./api-clients/market-api";
import { marketsApi } from "./api-clients/markets-api";
import { objectivesApi } from "./api-clients/objectives-api";
import { portfolioApi } from "./api-clients/portfolio-api";
import { screenerApi } from "./api-clients/screener-api";
import { request } from "./api-core";
import { clearNativeAuthToken, isNativeApp, setNativeAuthToken } from "./native-auth";

export type { MarketDataRebuildRange } from "./api-clients/admin-api";
export type { MarketEventPayload } from "./api-clients/market-api";

interface NativeAuthResponse {
  user: User;
  token: string;
}

function isNativeAuthResponse(value: User | NativeAuthResponse): value is NativeAuthResponse {
  return typeof (value as NativeAuthResponse).token === "string" && typeof (value as NativeAuthResponse).user === "object";
}

async function persistNativeAuthResponse(response: User | NativeAuthResponse) {
  if (!isNativeApp()) return response as User;
  if (!isNativeAuthResponse(response)) throw new Error("Reponse d'authentification mobile invalide.");
  await setNativeAuthToken(response.token);
  return response.user;
}

const authApi = {
  me: () => request<AuthMe>("/api/auth/me"),
  setup: (input: { username: string; password: string; confirmPassword: string; setupCode: string }) =>
    request<User | NativeAuthResponse>("/api/auth/setup", { method: "POST", body: JSON.stringify(input) }).then(persistNativeAuthResponse),
  login: (input: { username: string; password: string }) =>
    request<User | NativeAuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }).then(persistNativeAuthResponse),
  logout: async () => {
    try {
      await request<undefined>("/api/auth/logout", { method: "POST" });
    } finally {
      await clearNativeAuthToken();
    }
  },
  updateMe: (input: {
    username?: string | undefined;
    password?: string | undefined;
    confirmPassword?: string | undefined;
    currentPassword?: string | undefined;
    profileIconUrl?: string | null;
    dashboardDefaultSortKey?: DashboardSortKey;
    dashboardDefaultSortDirection?: SortDirection;
    watchlistDefaultSortKey?: WatchlistSortKey;
    watchlistDefaultSortDirection?: SortDirection;
    defaultChartRange?: RangeKey;
    projectionEndAge?: number;
    localPeaSearchEnabled?: boolean;
    assetNewsEnabled?: boolean;
    newsLanguages?: NewsLanguage[];
    language?: AppLanguage;
    privacyModeEnabled?: boolean;
    advancedModeEnabled?: boolean;
  }) =>
    request<User>("/api/auth/me", { method: "PATCH", body: JSON.stringify(input) }),
  uploadProfileIcon: (file: File) => {
    const formData = new FormData();
    formData.append("icon", file);
    return request<User>("/api/auth/me/profile-icon", { method: "POST", body: formData });
  },
  deleteProfileIcon: () => request<undefined>("/api/auth/me/profile-icon", { method: "DELETE" })
};

/**
 * Les imports interrogent Yahoo ligne par ligne (au plus 4 appels/s) ou analysent jusqu'à 20 PDF :
 * ils dépassent le délai par défaut des requêtes.
 */
const importRequestTimeoutMs = 5 * 60_000;

interface ImportResult {
  imported: string[];
  skipped: string[];
  errors: { line: number; message: string }[];
  isPreparing?: boolean;
  jobId?: string;
}

function postImport<T>(path: string, body: string | FormData) {
  return request<T>(path, { method: "POST", body, timeoutMs: importRequestTimeoutMs });
}

const importApi = {
  previewBoursorama: (content: string) => postImport<BoursoramaImportRow[]>("/api/import/boursorama/preview", JSON.stringify({ content })),
  confirmBoursorama: (rows: BoursoramaImportRow[]) => postImport<ImportResult>("/api/import/boursorama/confirm", JSON.stringify({ rows })),
  previewBoursoramaUpdate: (content: string) => postImport<BoursoramaUpdateRow[]>("/api/import/boursorama/update-preview", JSON.stringify({ content })),
  confirmBoursoramaUpdate: (rows: BoursoramaUpdateRow[]) => postImport<ImportResult>("/api/import/boursorama/update-confirm", JSON.stringify({ rows })),
  previewAvisOperesPdf: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => { formData.append("files", file); });
    return postImport<ParsedAvisOperation[]>("/api/import/avis-operes/preview", formData);
  },
  confirmAvisOperesPdf: (rows: ParsedAvisOperation[]) => postImport<ImportResult>("/api/import/avis-operes/confirm", JSON.stringify({ rows }))
};

export const api = {
  ...marketApi,
  ...calendarApi,
  ...marketsApi,
  ...screenerApi,
  ...alertsApi,
  ...portfolioApi,
  ...objectivesApi,
  ...assetApi,
  ...adminApi,
  ...authApi,
  ...importApi
};
