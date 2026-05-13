import { db } from "../../db.js";

export interface AuthUserRow {
  id: number | string;
  username: string;
  role: string;
  profile_icon_url: string | null;
  profile_icon_path: string | null;
  profile_icon_mime_type?: string | null;
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

export class AuthRepository {
  purgeExpiredSessions(nowSeconds: number) {
    return db.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(nowSeconds);
  }

  hasUsers() {
    return Boolean(db.prepare("SELECT 1 FROM users LIMIT 1").get());
  }

  userCount() {
    const row = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    return Number(row.count);
  }

  findUserByUsername(username: string): AuthUserRow | undefined {
    return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as AuthUserRow | undefined;
  }

  findUserById(userId: number): AuthUserRow | undefined {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as AuthUserRow | undefined;
  }

  findUserBySession(tokenHash: string, nowSeconds: number): AuthUserRow | undefined {
    return db
      .prepare(
        `SELECT users.*
         FROM user_sessions
         JOIN users ON users.id = user_sessions.user_id
         WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?`
      )
      .get(tokenHash, nowSeconds) as AuthUserRow | undefined;
  }

  deleteSession(tokenHash: string) {
    db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(tokenHash);
  }

  deleteUserSessions(userId: number) {
    db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(userId);
  }

  updateUser(userId: number, input: {
    username: string;
    passwordHash: string;
    profileIconUrl: string | null;
    dashboardDefaultSortKey: string;
    dashboardDefaultSortDirection: string;
    watchlistDefaultSortKey: string;
    watchlistDefaultSortDirection: string;
    defaultChartRange: string;
    localPeaSearchEnabled: number;
    assetNewsEnabled: number;
    newsLanguageFrEnabled: number;
    newsLanguageEnEnabled: number;
    privacyModeEnabled: number;
  }) {
    db.prepare(
      `UPDATE users
       SET username = ?,
           password_hash = ?,
           profile_icon_url = ?,
           dashboard_default_sort_key = ?,
           dashboard_default_sort_direction = ?,
           watchlist_default_sort_key = ?,
           watchlist_default_sort_direction = ?,
           default_chart_range = ?,
           local_pea_search_enabled = ?,
           asset_news_enabled = ?,
           news_language_fr_enabled = ?,
           news_language_en_enabled = ?,
           privacy_mode_enabled = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      input.username,
      input.passwordHash,
      input.profileIconUrl,
      input.dashboardDefaultSortKey,
      input.dashboardDefaultSortDirection,
      input.watchlistDefaultSortKey,
      input.watchlistDefaultSortDirection,
      input.defaultChartRange,
      input.localPeaSearchEnabled,
      input.assetNewsEnabled,
      input.newsLanguageFrEnabled,
      input.newsLanguageEnEnabled,
      input.privacyModeEnabled,
      userId
    );
  }

  profileIconFile(userId: number): Pick<AuthUserRow, "profile_icon_path"> & { profile_icon_mime_type: string | null } | undefined {
    return db.prepare("SELECT profile_icon_path, profile_icon_mime_type FROM users WHERE id = ?").get(userId) as
      | (Pick<AuthUserRow, "profile_icon_path"> & { profile_icon_mime_type: string | null })
      | undefined;
  }

  profileIconPath(userId: number): Pick<AuthUserRow, "profile_icon_path"> | undefined {
    return db.prepare("SELECT profile_icon_path FROM users WHERE id = ?").get(userId) as Pick<AuthUserRow, "profile_icon_path"> | undefined;
  }

  updateProfileIcon(userId: number, input: { path: string; mimeType: string; size: number }) {
    db.prepare(
      `UPDATE users
       SET profile_icon_path = ?, profile_icon_mime_type = ?, profile_icon_size = ?,
           profile_icon_url = NULL, has_profile_icon = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(input.path, input.mimeType, input.size, userId);
  }

  clearProfileIcon(userId: number) {
    db.prepare(
      `UPDATE users
       SET profile_icon_path = NULL, profile_icon_mime_type = NULL, profile_icon_size = NULL,
           profile_icon_url = NULL, has_profile_icon = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(userId);
  }

  insertUser(input: { username: string; passwordHash: string; role: "admin" | "user"; profileIconUrl?: string | null }) {
    db.prepare("INSERT INTO users (username, password_hash, role, profile_icon_url) VALUES (?, ?, ?, ?)").run(
      input.username,
      input.passwordHash,
      input.role,
      input.profileIconUrl || null
    );
  }

  insertSession(input: { userId: number; tokenHash: string; expiresAt: number }) {
    db.prepare("INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(input.userId, input.tokenHash, input.expiresAt);
  }
}

export const authRepository = new AuthRepository();
