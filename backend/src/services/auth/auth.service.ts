import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { AppLanguage, DashboardSortKey, NewsLanguage, RangeKey, SortDirection, WatchlistSortKey } from "@pea/shared";
import { config } from "../../config.js";
import { authRepository } from "../../repositories/auth/auth.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { detectSupportedImageMime, extensionForImageMime, isSupportedImageMime } from "../../utils/image-signature.js";
import { hashToken, isAppLanguage, isUsernameUniqueConstraintError, rowToAdminManagedUser, rowToAuthUser, type AdminManagedUser, type AuthUser, type UserRow } from "./auth-user.mapper.js";
export type { AdminManagedUser, AuthUser } from "./auth-user.mapper.js";
export { authCookieName } from "./auth-user.mapper.js";

const sessionDurationDays = 30;
const profileIconsDirectory = path.resolve(path.dirname(config.sqlitePath), "profile-icons");
const expiredSessionsPurgeIntervalMs = 60 * 60 * 1000;
let lastExpiredSessionsPurgeMs = 0;

fs.mkdirSync(profileIconsDirectory, { recursive: true });

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

  listManagedUsers(): AdminManagedUser[] {
    return (authRepository.listUsers() as UserRow[]).map((row) => rowToAdminManagedUser(row));
  }

  async createManagedUser(input: { username: string; password: string }) {
    const user = await this.createUserRecord(input.username, input.password, { role: "user", bootstrapAdmin: false });
    return rowToAdminManagedUser(authRepository.findUserById(user.id) as UserRow);
  }

  deleteManagedUser(userId: number, currentAdminId: number) {
    const row = authRepository.findUserById(userId) as UserRow | undefined;
    if (!row) throw new HttpError(404, "Utilisateur introuvable.");
    if (Number(row.id) === currentAdminId) throw new HttpError(409, "Vous ne pouvez pas supprimer votre propre compte administrateur.");
    if (row.bootstrap_admin) throw new HttpError(409, "Le compte administrateur bootstrap ne peut pas etre supprime.");

    this.deleteUserAndOwnedData(userId);
  }

  deleteUserAndOwnedData(userId: number) {
    const row = authRepository.findUserById(userId) as UserRow | undefined;
    if (!row) throw new HttpError(404, "Utilisateur introuvable.");
    if (row.bootstrap_admin) throw new HttpError(409, "Le compte administrateur bootstrap ne peut pas etre supprime.");

    const profileIconPath = row.profile_icon_path ? String(row.profile_icon_path) : undefined;
    const pendingProfileIconDeletePath = profileIconPath && fs.existsSync(profileIconPath)
      ? `${profileIconPath}.delete-${process.pid}-${Date.now()}`
      : undefined;

    if (profileIconPath && pendingProfileIconDeletePath) fs.renameSync(profileIconPath, pendingProfileIconDeletePath);

    try {
      const result = authRepository.deleteUserAndOwnedData(userId);
      if (!result) throw new HttpError(404, "Utilisateur introuvable.");
      if (pendingProfileIconDeletePath && fs.existsSync(pendingProfileIconDeletePath)) fs.rmSync(pendingProfileIconDeletePath, { force: true });
      return result;
    } catch (error) {
      if (profileIconPath && pendingProfileIconDeletePath && fs.existsSync(pendingProfileIconDeletePath) && !fs.existsSync(profileIconPath)) {
        fs.renameSync(pendingProfileIconDeletePath, profileIconPath);
      }
      throw error;
    }
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
      currentPassword?: string;
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
    }
  ) {
    const current = authRepository.findUserById(userId) as UserRow | undefined;
    if (!current) throw new HttpError(404, "Utilisateur introuvable.");

    const username = input.username?.trim() || String(current.username);
    const credentialsChanged = username !== String(current.username) || Boolean(input.password);
    if (credentialsChanged && (!input.currentPassword || !(await bcrypt.compare(input.currentPassword, String(current.password_hash))))) {
      throw new HttpError(401, "Mot de passe actuel invalide.");
    }
    const profileIconUrl = input.profileIconUrl === undefined ? current.profile_icon_url : input.profileIconUrl || null;
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : String(current.password_hash);
    const dashboardSortKey = input.dashboardDefaultSortKey ?? current.dashboard_default_sort_key ?? "name";
    const dashboardSortDirection = input.dashboardDefaultSortDirection ?? current.dashboard_default_sort_direction ?? "asc";
    const watchlistSortKey = input.watchlistDefaultSortKey ?? current.watchlist_default_sort_key ?? "name";
    const watchlistSortDirection = input.watchlistDefaultSortDirection ?? current.watchlist_default_sort_direction ?? "asc";
    const defaultRange = input.defaultChartRange ?? current.default_chart_range ?? "1d";
    const projectionEndAge = input.projectionEndAge === undefined ? Number(current.projection_end_age ?? 90) : input.projectionEndAge;
    if (!Number.isInteger(projectionEndAge) || projectionEndAge < 70 || projectionEndAge > 120) {
      throw new HttpError(400, "L'age de fin de projection doit etre compris entre 70 et 120 ans.");
    }
    const localPeaSearchEnabled =
      input.localPeaSearchEnabled === undefined ? Number(current.local_pea_search_enabled ?? 1) : input.localPeaSearchEnabled ? 1 : 0;
    const assetNewsEnabled = input.assetNewsEnabled === undefined ? Number(current.asset_news_enabled ?? 1) : input.assetNewsEnabled ? 1 : 0;
    const validLanguages = [...new Set((input.newsLanguages ?? []).filter((l): l is NewsLanguage => l === "fr" || l === "en"))];
    const newsLanguageFrEnabled = input.newsLanguages === undefined ? Number(current.news_language_fr_enabled ?? 1) : validLanguages.includes("fr") ? 1 : 0;
    const newsLanguageEnEnabled = input.newsLanguages === undefined ? Number(current.news_language_en_enabled ?? 0) : validLanguages.includes("en") ? 1 : 0;
    if (!newsLanguageFrEnabled && !newsLanguageEnEnabled) throw new HttpError(400, "Au moins une langue d'actualites doit etre activee.");
    const language = input.language ?? (isAppLanguage(current.language) ? current.language : "fr");
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
        projectionEndAge,
        localPeaSearchEnabled,
        assetNewsEnabled,
        newsLanguageFrEnabled,
        newsLanguageEnEnabled,
        language,
        privacyModeEnabled
      });
    } catch (error) {
      if (isUsernameUniqueConstraintError(error)) {
        throw new HttpError(409, "Ce username est deja utilise.");
      }
      throw error;
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
    const filePath = path.join(profileIconsDirectory, `user-${userId}.${extensionForImageMime(normalizedMime)}`);
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
    const user = await this.createUserRecord(username, password, { role: "admin", bootstrapAdmin: true, profileIconUrl });
    return { user, token: this.createSession(user.id) };
  }

  private async createUserRecord(
    username: string,
    password: string,
    options: { role: "admin" | "user"; bootstrapAdmin: boolean; profileIconUrl?: string }
  ) {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) throw new HttpError(400, "Username requis.");
    if (!password) throw new HttpError(400, "Mot de passe requis.");

    const passwordHash = await bcrypt.hash(password, 12);
    if (options.role === "admin" && !options.bootstrapAdmin) throw new HttpError(403, "Seul le setup initial peut creer le compte administrateur.");
    if (options.bootstrapAdmin && this.hasUsers()) throw new HttpError(409, "Le compte administrateur bootstrap existe deja.");
    try {
      authRepository.insertUser({
        username: trimmedUsername,
        passwordHash,
        role: options.role,
        bootstrapAdmin: options.bootstrapAdmin,
        profileIconUrl: options.profileIconUrl || null
      });
    } catch (error) {
      if (isUsernameUniqueConstraintError(error)) throw new HttpError(409, "Ce username est deja utilise.");
      throw error;
    }
    const row = authRepository.findUserByUsername(trimmedUsername) as UserRow;
    return rowToAuthUser(row);
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
