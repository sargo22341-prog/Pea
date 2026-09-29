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
import { assetApi } from "./api-clients/asset-api";
import { calendarApi } from "./api-clients/calendar-api";
import { marketApi } from "./api-clients/market-api";
import { marketsApi } from "./api-clients/markets-api";
import { objectivesApi } from "./api-clients/objectives-api";
import { portfolioApi } from "./api-clients/portfolio-api";
import { request } from "./api-core";
import { clearNativeAuthToken, isNativeApp, setNativeAuthToken } from "./native-auth";

export type { MarketDataRebuildRange, YahooUsageStatsFilters } from "./api-clients/admin-api";
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
  setup: (input: { username: string; password: string; confirmPassword: string }) =>
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

const importApi = {
  previewBoursorama: (content: string) =>
    request<BoursoramaImportRow[]>("/api/import/boursorama/preview", { method: "POST", body: JSON.stringify({ content }) }),
  confirmBoursorama: (rows: BoursoramaImportRow[]) =>
    request<{ imported: string[]; skipped: string[]; errors: { line: number; message: string }[]; isPreparing?: boolean; jobId?: string }>("/api/import/boursorama/confirm", {
      method: "POST",
      body: JSON.stringify({ rows })
    }),
  previewBoursoramaUpdate: (content: string) =>
    request<BoursoramaUpdateRow[]>("/api/import/boursorama/update-preview", { method: "POST", body: JSON.stringify({ content }) }),
  confirmBoursoramaUpdate: (rows: BoursoramaUpdateRow[]) =>
    request<{ imported: string[]; skipped: string[]; errors: { line: number; message: string }[]; isPreparing?: boolean; jobId?: string }>("/api/import/boursorama/update-confirm", {
      method: "POST",
      body: JSON.stringify({ rows })
    }),
  previewAvisOperesPdf: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => { formData.append("files", file); });
    return request<ParsedAvisOperation[]>("/api/import/avis-operes/preview", { method: "POST", body: formData });
  },
  confirmAvisOperesPdf: (rows: ParsedAvisOperation[]) =>
    request<{ imported: string[]; skipped: string[]; errors: { line: number; message: string }[]; isPreparing?: boolean; jobId?: string }>("/api/import/avis-operes/confirm", {
      method: "POST",
      body: JSON.stringify({ rows })
    })
};

export const api = {
  ...marketApi,
  ...calendarApi,
  ...marketsApi,
  ...portfolioApi,
  ...objectivesApi,
  ...assetApi,
  ...adminApi,
  ...authApi,
  ...importApi
};
