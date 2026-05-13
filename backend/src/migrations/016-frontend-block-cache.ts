import type { Migration } from "./types.js";

export const frontendBlockCacheMigration: Migration = {
  version: 16,
  description: "Cache frontend par bloc pour servir les pages depuis DB/cache en live refresh",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS frontend_block_cache (
        cache_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        block TEXT NOT NULL,
        range TEXT,
        payload TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_frontend_block_cache_user_block ON frontend_block_cache(user_id, block);
      CREATE INDEX IF NOT EXISTS idx_frontend_block_cache_expires_at ON frontend_block_cache(expires_at);
    `);
  }
};
