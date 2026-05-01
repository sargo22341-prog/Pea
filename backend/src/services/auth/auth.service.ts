/**
 * Role du fichier : gerer les comptes utilisateurs, les sessions, les
 * preferences de profil et les icones de profil stockees localement.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { DashboardSortKey, NewsLanguage, RangeKey, SortDirection } from "@pea/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { HttpError } from "../../utils/http-error.js";

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "user";
  profileIconUrl?: string;
  hasProfileIcon?: boolean;
  dashboardDefaultSortKey: DashboardSortKey;
  dashboardDefaultSortDirection: SortDirection;
  defaultChartRange: RangeKey;
  localPeaSearchEnabled: boolean;
  assetNewsEnabled: boolean;
  newsLanguages: NewsLanguage[];
  createdAt: string;
}

const sessionDays = 30;
const profileIconsDir = path.resolve(path.dirname(config.sqlitePath), "profile-icons");

fs.mkdirSync(profileIconsDir, { recursive: true });

function isDashboardSortKey(value: unknown): value is DashboardSortKey {
  return value === "name" || value === "currentMarketValue" || value === "intervalPerformancePercent";
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isRangeKey(value: unknown): value is RangeKey {
  return value === "1d" || value === "1w" || value === "1m" || value === "1y" || value === "5y" || value === "10y" || value === "ytd" || value === "max";
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

function mapUser(row: any): AuthUser {
  const newsLanguages: NewsLanguage[] = [];
  if (row.news_language_fr_enabled === undefined || row.news_language_fr_enabled === null || Boolean(row.news_language_fr_enabled)) newsLanguages.push("fr");
  if (row.news_language_en_enabled) newsLanguages.push("en");

  return {
    id: Number(row.id),
    username: String(row.username),
    role: row.role === "admin" ? "admin" : "user",
    profileIconUrl: row.profile_icon_url ? String(row.profile_icon_url) : undefined,
    hasProfileIcon: Boolean(row.profile_icon_path && fs.existsSync(String(row.profile_icon_path))),
    dashboardDefaultSortKey: isDashboardSortKey(row.dashboard_default_sort_key) ? row.dashboard_default_sort_key : "name",
    dashboardDefaultSortDirection: isSortDirection(row.dashboard_default_sort_direction) ? row.dashboard_default_sort_direction : "asc",
    defaultChartRange: isRangeKey(row.default_chart_range) ? row.default_chart_range : "1d",
    localPeaSearchEnabled: row.local_pea_search_enabled === undefined || row.local_pea_search_enabled === null ? true : Boolean(row.local_pea_search_enabled),
    assetNewsEnabled: row.asset_news_enabled === undefined || row.asset_news_enabled === null ? true : Boolean(row.asset_news_enabled),
    newsLanguages: newsLanguages.length ? newsLanguages : ["fr"],
    createdAt: String(row.created_at)
  };
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const authCookieName = "pea_session";

export class AuthService {
  hasUsers() {
    return Boolean(db.prepare("SELECT 1 FROM users LIMIT 1").get());
  }

  userCount() {
    const row = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    return Number(row.count);
  }

  async setup(username: string, password: string, profileIconUrl?: string) {
    if (this.hasUsers()) throw new HttpError(409, "Le premier compte existe deja.");
    return this.createUser(username, password, profileIconUrl);
  }

  async login(username: string, password: string) {
    const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim()) as any;
    if (!row || !(await bcrypt.compare(password, String(row.password_hash)))) {
      throw new HttpError(401, "Identifiants invalides.");
    }
    return { user: mapUser(row), token: this.createSession(Number(row.id)) };
  }

  logout(token?: string) {
    if (!token) return;
    db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(hashToken(token));
  }

  getUserBySession(token?: string): AuthUser | undefined {
    if (!token) return undefined;
    const now = Math.floor(Date.now() / 1000);
    const row = db
      .prepare(
        `SELECT users.*
         FROM user_sessions
         JOIN users ON users.id = user_sessions.user_id
         WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?`
      )
      .get(hashToken(token), now);
    return row ? mapUser(row) : undefined;
  }

  async updateUser(
    userId: number,
    input: {
      username?: string;
      password?: string;
      profileIconUrl?: string | null;
      dashboardDefaultSortKey?: DashboardSortKey;
      dashboardDefaultSortDirection?: SortDirection;
      defaultChartRange?: RangeKey;
      localPeaSearchEnabled?: boolean;
      assetNewsEnabled?: boolean;
      newsLanguages?: NewsLanguage[];
    }
  ) {
    const current = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!current) throw new HttpError(404, "Utilisateur introuvable.");

    const username = input.username?.trim() || String(current.username);
    const profileIconUrl = input.profileIconUrl === undefined ? current.profile_icon_url : input.profileIconUrl || null;
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : String(current.password_hash);
    const dashboardDefaultSortKey = input.dashboardDefaultSortKey ?? current.dashboard_default_sort_key ?? "name";
    const dashboardDefaultSortDirection = input.dashboardDefaultSortDirection ?? current.dashboard_default_sort_direction ?? "asc";
    const defaultChartRange = input.defaultChartRange ?? current.default_chart_range ?? "1d";
    const localPeaSearchEnabled =
      input.localPeaSearchEnabled === undefined ? Number(current.local_pea_search_enabled ?? 1) : input.localPeaSearchEnabled ? 1 : 0;
    const assetNewsEnabled = input.assetNewsEnabled === undefined ? Number(current.asset_news_enabled ?? 1) : input.assetNewsEnabled ? 1 : 0;
    const validNewsLanguages = [...new Set((input.newsLanguages ?? []).filter((language): language is NewsLanguage => language === "fr" || language === "en"))];
    const newsLanguageFrEnabled = input.newsLanguages === undefined ? Number(current.news_language_fr_enabled ?? 1) : validNewsLanguages.includes("fr") ? 1 : 0;
    const newsLanguageEnEnabled = input.newsLanguages === undefined ? Number(current.news_language_en_enabled ?? 0) : validNewsLanguages.includes("en") ? 1 : 0;
    if (!newsLanguageFrEnabled && !newsLanguageEnEnabled) throw new HttpError(400, "Au moins une langue d'actualites doit etre activee.");

    try {
      db.prepare(
        `UPDATE users
         SET username = ?,
             password_hash = ?,
             profile_icon_url = ?,
             dashboard_default_sort_key = ?,
             dashboard_default_sort_direction = ?,
             default_chart_range = ?,
             local_pea_search_enabled = ?,
             asset_news_enabled = ?,
             news_language_fr_enabled = ?,
             news_language_en_enabled = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        username,
        passwordHash,
        profileIconUrl,
        dashboardDefaultSortKey,
        dashboardDefaultSortDirection,
        defaultChartRange,
        localPeaSearchEnabled,
        assetNewsEnabled,
        newsLanguageFrEnabled,
        newsLanguageEnEnabled,
        userId
      );
    } catch {
      throw new HttpError(409, "Ce username est deja utilise.");
    }

    return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(userId));
  }

  getProfileIconFile(userId: number) {
    const row = db.prepare("SELECT profile_icon_path, profile_icon_mime_type FROM users WHERE id = ?").get(userId) as any;
    const filePath = row?.profile_icon_path ? String(row.profile_icon_path) : undefined;
    const mimeType = row?.profile_icon_mime_type ? String(row.profile_icon_mime_type) : undefined;
    if (!filePath || !mimeType || !fs.existsSync(filePath)) return undefined;
    return { filePath, mimeType };
  }

  saveProfileIcon(userId: number, buffer: Buffer, mimeType: string) {
    const current = db.prepare("SELECT profile_icon_path FROM users WHERE id = ?").get(userId) as any;
    if (!current) throw new HttpError(404, "Utilisateur introuvable.");

    const cleanMime = mimeType.toLowerCase();
    const filePath = path.join(profileIconsDir, `user-${userId}.${extensionForMime(cleanMime)}`);
    for (const candidate of ["png", "jpg"]) {
      const candidatePath = path.join(profileIconsDir, `user-${userId}.${candidate}`);
      if (candidatePath !== filePath && fs.existsSync(candidatePath)) fs.unlinkSync(candidatePath);
    }

    fs.writeFileSync(filePath, buffer);
    db.prepare(
      `UPDATE users
       SET profile_icon_path = ?, profile_icon_mime_type = ?, profile_icon_size = ?, profile_icon_url = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(filePath, cleanMime, buffer.length, userId);
    return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(userId));
  }

  deleteProfileIcon(userId: number) {
    const current = db.prepare("SELECT profile_icon_path FROM users WHERE id = ?").get(userId) as any;
    if (!current) throw new HttpError(404, "Utilisateur introuvable.");
    const filePath = current.profile_icon_path ? String(current.profile_icon_path) : undefined;
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare(
      `UPDATE users
       SET profile_icon_path = NULL, profile_icon_mime_type = NULL, profile_icon_size = NULL, profile_icon_url = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(userId);
  }

  isAllowedProfileIconMime(mimeType: string) {
    return ["image/png", "image/jpeg", "image/jpg"].includes(mimeType.toLowerCase());
  }

  private async createUser(username: string, password: string, profileIconUrl?: string) {
    const cleanUsername = username.trim();
    if (!cleanUsername) throw new HttpError(400, "Username requis.");
    if (!password) throw new HttpError(400, "Mot de passe requis.");

    const passwordHash = await bcrypt.hash(password, 12);
    const role = this.userCount() === 0 ? "admin" : "user";
    db.prepare("INSERT INTO users (username, password_hash, role, profile_icon_url) VALUES (?, ?, ?, ?)").run(
      cleanUsername,
      passwordHash,
      role,
      profileIconUrl || null
    );
    const row = db.prepare("SELECT * FROM users WHERE username = ?").get(cleanUsername);
    return { user: mapUser(row), token: this.createSession(Number((row as any).id)) };
  }

  private createSession(userId: number) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Math.floor(Date.now() / 1000) + sessionDays * 24 * 60 * 60;
    db.prepare("INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(userId, hashToken(token), expiresAt);
    return token;
  }
}

export const authService = new AuthService();
