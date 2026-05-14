import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { DashboardSortKey, NewsLanguage, RangeKey, SortDirection, WatchlistSortKey } from "@pea/shared";
import { config } from "../../config.js";
import { authRepository, type AuthUserRow } from "../../repositories/auth/auth.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { detectSupportedImageMime, isSupportedImageMime } from "../../utils/image-signature.js";

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
  localPeaSearchEnabled: boolean;
  assetNewsEnabled: boolean;
  newsLanguages: NewsLanguage[];
  privacyModeEnabled: boolean;
  createdAt: string;
}

interface UserRow extends AuthUserRow {
  id: number | string;
  username: string;
  role: string;
  profile_icon_url: string | null;
  profile_icon_path: string | null;
  has_profile_icon: number | null;
  password_hash: string;
  dashboard_default_sort_key: string;
  dashboard_default_sort_direction: string;
  watchlist_default_sort_key: string;
  watchlist_default_sort_direction: string;
  default_chart_range: string;
  local_pea_search_enabled: number | null;
  asset_news_enabled: number | null;
  news_language_fr_enabled: number | null;
  news_language_en_enabled: number | null;
  privacy_mode_enabled: number | null;
  created_at: string;
}

const sessionDurationDays = 30;
const profileIconsDirectory = path.resolve(path.dirname(config.sqlitePath), "profile-icons");
const expiredSessionsPurgeIntervalMs = 60 * 60 * 1000;
let lastExpiredSessionsPurgeMs = 0;

fs.mkdirSync(profileIconsDirectory, { recursive: true });

function isDashboardSortKey(value: unknown): value is DashboardSortKey {
  return value === "name" || value === "currentMarketValue" || value === "intervalPerformancePercent";
}

function isWatchlistSortKey(value: unknown): value is WatchlistSortKey {
  return value === "name" || value === "price" || value === "performancePercent";
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isRangeKey(value: unknown): value is RangeKey {
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

function extensionForMime(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

function rowToAuthUser(row: UserRow): AuthUser {
  const languages: NewsLanguage[] = [];
  if (row.news_language_fr_enabled === undefined || row.news_language_fr_enabled === null || Boolean(row.news_language_fr_enabled)) languages.push("fr");
  if (row.news_language_en_enabled) languages.push("en");

  return {
    id: Number(row.id),
    username: String(row.username),
    role: row.role === "admin" ? "admin" : "user",
    profileIconUrl: row.profile_icon_url ? String(row.profile_icon_url) : undefined,
    // `has_profile_icon` est mis à jour par les migrations et les opérations d'écriture pour
    // éviter un fs.existsSync() synchrone à chaque requête authentifiée.
    hasProfileIcon: Boolean(row.has_profile_icon),
    dashboardDefaultSortKey: isDashboardSortKey(row.dashboard_default_sort_key) ? row.dashboard_default_sort_key : "name",
    dashboardDefaultSortDirection: isSortDirection(row.dashboard_default_sort_direction) ? row.dashboard_default_sort_direction : "asc",
    watchlistDefaultSortKey: isWatchlistSortKey(row.watchlist_default_sort_key) ? row.watchlist_default_sort_key : "name",
    watchlistDefaultSortDirection: isSortDirection(row.watchlist_default_sort_direction) ? row.watchlist_default_sort_direction : "asc",
    defaultChartRange: isRangeKey(row.default_chart_range) ? row.default_chart_range : "1d",
    localPeaSearchEnabled: row.local_pea_search_enabled === undefined || row.local_pea_search_enabled === null ? true : Boolean(row.local_pea_search_enabled),
    assetNewsEnabled: row.asset_news_enabled === undefined || row.asset_news_enabled === null ? true : Boolean(row.asset_news_enabled),
    newsLanguages: languages.length ? languages : ["fr"],
    privacyModeEnabled: Boolean(row.privacy_mode_enabled),
    createdAt: String(row.created_at)
  };
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const authCookieName = "pea_session";

export class AuthService {
  purgeExpiredSessions(force = false) {
    const nowMs = Date.now();
    if (!force && nowMs - lastExpiredSessionsPurgeMs < expiredSessionsPurgeIntervalMs) return 0;
    lastExpiredSessionsPurgeMs = nowMs;
    return authRepository.purgeExpiredSessions(Math.floor(nowMs / 1000));
  }

  hasUsers() {
    return authRepository.hasUsers();
  }

  userCount() {
    return authRepository.userCount();
  }

  async setup(username: string, password: string, profileIconUrl?: string) {
    if (this.hasUsers()) throw new HttpError(409, "Le premier compte existe deja.");
    return this.createUser(username, password, profileIconUrl);
  }

  async login(username: string, password: string) {
    const row = authRepository.findUserByUsername(username.trim()) as UserRow | undefined;
    if (!row || !(await bcrypt.compare(password, String(row.password_hash)))) {
      throw new HttpError(401, "Identifiants invalides.");
    }
    return { user: rowToAuthUser(row), token: this.createSession(Number(row.id)) };
  }

  logout(token?: string) {
    if (!token) return;
    authRepository.deleteSession(hashToken(token));
  }

  getUserBySession(token?: string): AuthUser | undefined {
    if (!token) return undefined;
    const nowSeconds = Math.floor(Date.now() / 1000);
    this.purgeExpiredSessions();
    const row = authRepository.findUserBySession(hashToken(token), nowSeconds) as UserRow | undefined;
    return row ? rowToAuthUser(row) : undefined;
  }

  async updateUser(
    userId: number,
    input: {
      username?: string;
      password?: string;
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
    }
  ) {
    const current = authRepository.findUserById(userId) as UserRow | undefined;
    if (!current) throw new HttpError(404, "Utilisateur introuvable.");

    const username = input.username?.trim() || String(current.username);
    const profileIconUrl = input.profileIconUrl === undefined ? current.profile_icon_url : input.profileIconUrl || null;
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : String(current.password_hash);
    const dashboardSortKey = input.dashboardDefaultSortKey ?? current.dashboard_default_sort_key ?? "name";
    const dashboardSortDirection = input.dashboardDefaultSortDirection ?? current.dashboard_default_sort_direction ?? "asc";
    const watchlistSortKey = input.watchlistDefaultSortKey ?? current.watchlist_default_sort_key ?? "name";
    const watchlistSortDirection = input.watchlistDefaultSortDirection ?? current.watchlist_default_sort_direction ?? "asc";
    const defaultRange = input.defaultChartRange ?? current.default_chart_range ?? "1d";
    const localPeaSearchEnabled =
      input.localPeaSearchEnabled === undefined ? Number(current.local_pea_search_enabled ?? 1) : input.localPeaSearchEnabled ? 1 : 0;
    const assetNewsEnabled = input.assetNewsEnabled === undefined ? Number(current.asset_news_enabled ?? 1) : input.assetNewsEnabled ? 1 : 0;
    const validLanguages = [...new Set((input.newsLanguages ?? []).filter((l): l is NewsLanguage => l === "fr" || l === "en"))];
    const newsLanguageFrEnabled = input.newsLanguages === undefined ? Number(current.news_language_fr_enabled ?? 1) : validLanguages.includes("fr") ? 1 : 0;
    const newsLanguageEnEnabled = input.newsLanguages === undefined ? Number(current.news_language_en_enabled ?? 0) : validLanguages.includes("en") ? 1 : 0;
    if (!newsLanguageFrEnabled && !newsLanguageEnEnabled) throw new HttpError(400, "Au moins une langue d'actualites doit etre activee.");
    const privacyModeEnabled = input.privacyModeEnabled === undefined ? Number(current.privacy_mode_enabled ?? 0) : input.privacyModeEnabled ? 1 : 0;

    try {
      authRepository.updateUser(userId, {
        username,
        passwordHash,
        profileIconUrl,
        dashboardDefaultSortKey: dashboardSortKey,
        dashboardDefaultSortDirection: dashboardSortDirection,
        watchlistDefaultSortKey: watchlistSortKey,
        watchlistDefaultSortDirection: watchlistSortDirection,
        defaultChartRange: defaultRange,
        localPeaSearchEnabled,
        assetNewsEnabled,
        newsLanguageFrEnabled,
        newsLanguageEnEnabled,
        privacyModeEnabled
      });
    } catch {
      throw new HttpError(409, "Ce username est deja utilise.");
    }

    // Invalide toutes les sessions actives lors d'un changement de mot de passe pour qu'un
    // token volé ne reste pas valable après la modification.
    if (input.password) {
      authRepository.deleteUserSessions(userId);
    }

    return rowToAuthUser(authRepository.findUserById(userId) as UserRow);
  }

  getProfileIconFile(userId: number) {
    const row = authRepository.profileIconFile(userId);
    const filePath = row?.profile_icon_path ? String(row.profile_icon_path) : undefined;
    const mimeType = row?.profile_icon_mime_type ? String(row.profile_icon_mime_type) : undefined;
    if (!filePath || !mimeType || !fs.existsSync(filePath)) return undefined;
    return { filePath, mimeType };
  }

  saveProfileIcon(userId: number, data: Buffer, _mimeType: string) {
    const current = authRepository.profileIconPath(userId);
    if (!current) throw new HttpError(404, "Utilisateur introuvable.");

    const normalizedMime = detectSupportedImageMime(data);
    if (!normalizedMime) throw new HttpError(400, "Image invalide.");
    const filePath = path.join(profileIconsDirectory, `user-${userId}.${extensionForMime(normalizedMime)}`);
    for (const extension of ["png", "jpg"]) {
      const candidate = path.join(profileIconsDirectory, `user-${userId}.${extension}`);
      if (candidate !== filePath && fs.existsSync(candidate)) fs.unlinkSync(candidate);
    }

    fs.writeFileSync(filePath, data);
    authRepository.updateProfileIcon(userId, { path: filePath, mimeType: normalizedMime, size: data.length });
    return rowToAuthUser(authRepository.findUserById(userId) as UserRow);
  }

  deleteProfileIcon(userId: number) {
    const current = authRepository.profileIconPath(userId);
    if (!current) throw new HttpError(404, "Utilisateur introuvable.");
    const filePath = current.profile_icon_path ? String(current.profile_icon_path) : undefined;
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    authRepository.clearProfileIcon(userId);
  }

  isAllowedProfileIconMime(mimeType: string) {
    return isSupportedImageMime(mimeType);
  }

  private async createUser(username: string, password: string, profileIconUrl?: string) {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) throw new HttpError(400, "Username requis.");
    if (!password) throw new HttpError(400, "Mot de passe requis.");

    const passwordHash = await bcrypt.hash(password, 12);
    const role = this.userCount() === 0 ? "admin" : "user";
    authRepository.insertUser({ username: trimmedUsername, passwordHash, role, profileIconUrl: profileIconUrl || null });
    const row = authRepository.findUserByUsername(trimmedUsername) as UserRow;
    return { user: rowToAuthUser(row), token: this.createSession(Number(row.id)) };
  }

  private createSession(userId: number) {
    this.purgeExpiredSessions(true);
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Math.floor(Date.now() / 1000) + sessionDurationDays * 24 * 60 * 60;
    authRepository.insertSession({ userId, tokenHash: hashToken(token), expiresAt });
    return token;
  }
}

export const authService = new AuthService();
