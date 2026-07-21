import crypto from "node:crypto";
import type { AppLanguage, DashboardSortKey, NewsLanguage, RangeKey, SortDirection, WatchlistSortKey } from "@pea/shared";
import type { AuthUserRow } from "../../repositories/auth/auth.repository.js";


export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "user";
  profileIconUrl?: string;
  hasProfileIcon?: boolean;
  dashboardDefaultSortKey: DashboardSortKey;
  dashboardDefaultSortDirection: SortDirection;
  watchlistDefaultSortKey: WatchlistSortKey;
  watchlistDefaultSortDirection: SortDirection;
  defaultChartRange: RangeKey;
  projectionEndAge: number;
  localPeaSearchEnabled: boolean;
  assetNewsEnabled: boolean;
  newsLanguages: NewsLanguage[];
  language: AppLanguage;
  privacyModeEnabled: boolean;
  createdAt: string;
}

export type AdminManagedUser = Pick<AuthUser, "id" | "username" | "role" | "createdAt"> & {
  isProtectedAdmin: boolean;
};

export interface UserRow extends AuthUserRow {
  id: number | string;
  username: string;
  role: string;
  bootstrap_admin: number | null;
  profile_icon_url: string | null;
  profile_icon_path: string | null;
  has_profile_icon: number | null;
  password_hash: string;
  dashboard_default_sort_key: string;
  dashboard_default_sort_direction: string;
  watchlist_default_sort_key: string;
  watchlist_default_sort_direction: string;
  default_chart_range: string;
  projection_end_age: number | null;
  local_pea_search_enabled: number | null;
  asset_news_enabled: number | null;
  news_language_fr_enabled: number | null;
  news_language_en_enabled: number | null;
  language: string | null;
  privacy_mode_enabled: number | null;
  created_at: string;
}

export function isDashboardSortKey(value: unknown): value is DashboardSortKey {
  return value === "name" || value === "currentMarketValue" || value === "intervalPerformancePercent";
}

export function isWatchlistSortKey(value: unknown): value is WatchlistSortKey {
  return value === "name" || value === "price" || value === "performancePercent";
}

export function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

export function isRangeKey(value: unknown): value is RangeKey {
  return (
    value === "1d" ||
    value === "1w" ||
    value === "1m" ||
    value === "1y" ||
    value === "5y" ||
    value === "10y" ||
    value === "ytd" ||
    value === "all"
  );
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "fr" || value === "en";
}

export function extensionForMime(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

export function rowToAuthUser(row: UserRow): AuthUser {
  const languages: NewsLanguage[] = [];
  if (row.news_language_fr_enabled === undefined || row.news_language_fr_enabled === null || Boolean(row.news_language_fr_enabled)) languages.push("fr");
  if (row.news_language_en_enabled) languages.push("en");

  return {
    id: Number(row.id),
    username: String(row.username),
    role: row.role === "admin" && Boolean(row.bootstrap_admin) ? "admin" : "user",
    profileIconUrl: row.profile_icon_url ? String(row.profile_icon_url) : undefined,
    // `has_profile_icon` est mis à jour par les migrations et les opérations d'écriture pour
    // éviter un fs.existsSync() synchrone à chaque requête authentifiée.
    hasProfileIcon: Boolean(row.has_profile_icon),
    dashboardDefaultSortKey: isDashboardSortKey(row.dashboard_default_sort_key) ? row.dashboard_default_sort_key : "name",
    dashboardDefaultSortDirection: isSortDirection(row.dashboard_default_sort_direction) ? row.dashboard_default_sort_direction : "asc",
    watchlistDefaultSortKey: isWatchlistSortKey(row.watchlist_default_sort_key) ? row.watchlist_default_sort_key : "name",
    watchlistDefaultSortDirection: isSortDirection(row.watchlist_default_sort_direction) ? row.watchlist_default_sort_direction : "asc",
    defaultChartRange: isRangeKey(row.default_chart_range) ? row.default_chart_range : "1d",
    projectionEndAge: Number.isFinite(Number(row.projection_end_age)) ? Math.min(120, Math.max(70, Number(row.projection_end_age))) : 90,
    localPeaSearchEnabled: row.local_pea_search_enabled === undefined || row.local_pea_search_enabled === null ? true : Boolean(row.local_pea_search_enabled),
    assetNewsEnabled: row.asset_news_enabled === undefined || row.asset_news_enabled === null ? true : Boolean(row.asset_news_enabled),
    newsLanguages: languages.length ? languages : ["fr"],
    language: isAppLanguage(row.language) ? row.language : "fr",
    privacyModeEnabled: Boolean(row.privacy_mode_enabled),
    createdAt: String(row.created_at)
  };
}

export function rowToAdminManagedUser(row: UserRow): AdminManagedUser {
  const user = rowToAuthUser(row);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    isProtectedAdmin: Boolean(row.bootstrap_admin)
  };
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isUsernameUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed: users\.username/i.test(message);
}

export const authCookieName = "pea_session";

