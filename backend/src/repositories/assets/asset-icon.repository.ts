import { db } from "../../db.js";

export interface AssetIconRow {
  symbol: string;
  file_path?: string | null;
  mime_type?: string | null;
  size?: number | string | null;
  source?: string | null;
  fetch_status?: string | null;
  last_attempt_at?: string | null;
  updated_at?: string | null;
}

export interface KnownAssetRow {
  symbol: string;
  name: string;
}

export class AssetIconRepository {
  readCachedQuote(symbol: string) {
    return db.prepare("SELECT payload FROM cached_quotes WHERE symbol = ?").get(symbol) as { payload?: string } | undefined;
  }

  find(symbol: string): AssetIconRow | undefined {
    return db.prepare("SELECT * FROM asset_icons WHERE symbol = ?").get(symbol) as AssetIconRow | undefined;
  }

  saveSuccess(input: { symbol: string; filePath: string; mimeType: string; size: number; source: "auto" | "manual" }) {
    db.prepare(
      `INSERT INTO asset_icons (symbol, file_path, mime_type, size, source, fetch_status, last_attempt_at)
       VALUES (?, ?, ?, ?, ?, 'success', CURRENT_TIMESTAMP)
       ON CONFLICT(symbol) DO UPDATE SET
        file_path = excluded.file_path,
        mime_type = excluded.mime_type,
        size = excluded.size,
        source = excluded.source,
        fetch_status = 'success',
        last_attempt_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`
    ).run(input.symbol, input.filePath, input.mimeType, input.size, input.source);
  }

  markFailed(symbol: string) {
    db.prepare(
      `INSERT INTO asset_icons (symbol, source, fetch_status, last_attempt_at)
       VALUES (?, 'auto', 'failed', CURRENT_TIMESTAMP)
       ON CONFLICT(symbol) DO UPDATE SET fetch_status = 'failed', last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`
    ).run(symbol);
  }

  reset(symbol: string) {
    db.prepare(
      `INSERT INTO asset_icons (symbol, source, fetch_status, file_path, mime_type, size, last_attempt_at)
       VALUES (?, 'auto', 'pending', NULL, NULL, NULL, NULL)
       ON CONFLICT(symbol) DO UPDATE SET
        file_path = NULL,
        mime_type = NULL,
        size = NULL,
        source = 'auto',
        fetch_status = 'pending',
        last_attempt_at = NULL,
        updated_at = CURRENT_TIMESTAMP`
    ).run(symbol);
  }

  markPending(symbol: string) {
    db.prepare(
      `INSERT INTO asset_icons (symbol, source, fetch_status, last_attempt_at)
       VALUES (?, 'auto', 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT(symbol) DO UPDATE SET fetch_status = 'pending', last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`
    ).run(symbol);
  }

  listKnownAssets(userId: string | number): KnownAssetRow[] {
    return db
      .prepare(
        `SELECT symbol, name FROM positions
         WHERE user_id = ?
         UNION
         SELECT symbol, name FROM watchlist
         WHERE user_id = ?
         ORDER BY symbol ASC`
      )
      .all(userId, userId) as KnownAssetRow[];
  }

  findKnownAsset(symbol: string, userId: string | number) {
    return db
      .prepare(
        `SELECT symbol, name FROM positions WHERE symbol = ?
           AND user_id = ?
         UNION
         SELECT symbol, name FROM watchlist WHERE symbol = ?
           AND user_id = ?
         LIMIT 1`
      )
      .get(symbol, userId, symbol, userId) as { name?: string } | undefined;
  }
}

export const assetIconRepository = new AssetIconRepository();
