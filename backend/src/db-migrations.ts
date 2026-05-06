// Rôle du fichier : déclarer et appliquer les migrations de schéma SQLite.
// Chaque migration est identifiée par un numéro de version et ne s'exécute
// qu'une seule fois. Le tableau _migrations trace les versions déjà appliquées.

import type { DatabaseAdapter } from "./db.js";
import { getMarketCalendar } from "./services/market/getMarketCalendar.js";

interface Migration {
  version: number;
  description: string;
  appliquer: (db: DatabaseAdapter) => void;
}

// Colonnes actuelles d'une table, renvoyées par PRAGMA table_info
interface ColonneDb {
  name: string;
  type: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    description: "Index sur user_sessions.expires_at pour optimiser la vérification des sessions actives",
    appliquer: (db) => {
      db.exec("CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)");
    }
  },
  {
    version: 2,
    description: "Colonne has_profile_icon sur users pour éviter un accès disque à chaque requête authentifiée",
    appliquer: (db) => {
      // Vérifie l'existence de la colonne pour rendre la migration idempotente
      const colonnes = db.prepare("PRAGMA table_info(users)").all() as ColonneDb[];
      if (!colonnes.some((c) => c.name === "has_profile_icon")) {
        db.exec("ALTER TABLE users ADD COLUMN has_profile_icon INTEGER NOT NULL DEFAULT 0");
      }
      // Initialise la valeur pour les utilisateurs existants ayant déjà une icône
      db.prepare("UPDATE users SET has_profile_icon = 1 WHERE profile_icon_path IS NOT NULL AND has_profile_icon = 0").run();
    }
  },
  {
    version: 4,
    description: "Colonne privacy_mode_enabled sur users pour masquer les chiffres du portefeuille",
    appliquer: (db) => {
      const colonnes = db.prepare("PRAGMA table_info(users)").all() as ColonneDb[];
      if (!colonnes.some((c) => c.name === "privacy_mode_enabled")) {
        db.exec("ALTER TABLE users ADD COLUMN privacy_mode_enabled INTEGER NOT NULL DEFAULT 0");
      }
    }
  },
  {
    version: 5,
    description: "Index sur chart_candles pour accélérer les lectures par (asset_id, range, interval) et les suppressions par (asset_id, range)",
    appliquer: (db) => {
      // Ignoré sur les nouvelles installations : chart_candles n'existe plus (v6 utilise les tables par range)
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chart_candles'").all() as Array<{ name: string }>;
      if (tables.length === 0) return;
      db.exec("CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range_interval ON chart_candles(asset_id, range, interval)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range ON chart_candles(asset_id, range)");
    }
  },
  {
    version: 6,
    description: "Split chart_candles en 4 tables par range (1d, 1w, 1m, all) — suppression de la colonne range et des index composites",
    appliquer: (db) => {
      // Crée les 4 tables si elles n'existent pas encore (nouvelle installation déjà gérée par db.ts)
      for (const range of ["1d", "1w", "1m", "all"]) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS chart_candles_${range} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            interval TEXT NOT NULL,
            datetime_start TEXT NOT NULL,
            datetime_end TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL NOT NULL,
            volume REAL,
            source TEXT NOT NULL DEFAULT 'yahoo-finance2',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(asset_id, interval, datetime_start),
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_chart_candles_${range}_asset_interval ON chart_candles_${range}(asset_id, interval)`);
      }

      // Migre les données depuis l'ancienne table si elle existe encore
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chart_candles'").all() as Array<{ name: string }>;
      if (tables.length > 0) {
        for (const range of ["1d", "1w", "1m", "all"]) {
          db.exec(
            `INSERT OR IGNORE INTO chart_candles_${range}
               (asset_id, interval, datetime_start, datetime_end, open, high, low, close, volume, source, created_at, updated_at)
             SELECT asset_id, interval, datetime_start, datetime_end, open, high, low, close, volume, source, created_at, updated_at
             FROM chart_candles WHERE range = '${range}'`
          );
        }
        db.exec("DROP INDEX IF EXISTS idx_chart_candles_asset_range_interval");
        db.exec("DROP INDEX IF EXISTS idx_chart_candles_asset_range");
        db.exec("DROP TABLE chart_candles");
      }
    }
  },
  {
    version: 7,
    description: "Table asset_calendar_events + purge cache fundamentals sans calendarEvents pour forcer un refetch",
    appliquer: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS asset_calendar_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_date TEXT NOT NULL,
          is_estimate INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(symbol, event_type, event_date)
        )
      `);
      db.exec("CREATE INDEX IF NOT EXISTS idx_asset_calendar_events_symbol ON asset_calendar_events(symbol)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_asset_calendar_events_date ON asset_calendar_events(event_date)");
      // Purge les entrées de cache qui ont été mises en cache AVANT l'ajout du module calendarEvents.
      // json_type retourne NULL uniquement si la clé n'existe pas dans le JSON (cas des anciens caches).
      db.exec("DELETE FROM cached_fundamentals WHERE symbol NOT LIKE '%:annual-financials' AND json_type(payload, '$.calendarEvents') IS NULL");
    }
  },
  {
    version: 8,
    description: "Purge cache fundamentals sans module calendarEvents pour forcer un refetch avec les nouvelles données",
    appliquer: (db) => {
      db.exec("DELETE FROM cached_fundamentals WHERE symbol NOT LIKE '%:annual-financials' AND json_type(payload, '$.calendarEvents') IS NULL");
    }
  },
  {
    version: 9,
    description: "Suppression des tables DTO caches inutilisées (asset_static_cache, asset_market_cache, asset_dividend_cache)",
    appliquer: (db) => {
      db.exec("DROP TABLE IF EXISTS asset_static_cache");
      db.exec("DROP TABLE IF EXISTS asset_market_cache");
      db.exec("DROP TABLE IF EXISTS asset_dividend_cache");
    }
  },
  {
    version: 10,
    description: "Suppression asset_dividend_cache si toujours présente après migration 9",
    appliquer: (db) => {
      db.exec("DROP TABLE IF EXISTS asset_dividend_cache");
    }
  },
  {
    version: 11,
    description: "Suppression asset_chart_cache — table fantôme jamais lue ni écrite",
    appliquer: (db) => {
      db.exec("DROP TABLE IF EXISTS asset_chart_cache");
    }
  },
  {
    version: 12,
    description: "Colonnes watchlist_default_sort_key et watchlist_default_sort_direction sur users",
    appliquer: (db) => {
      const colonnes = db.prepare("PRAGMA table_info(users)").all() as ColonneDb[];
      if (!colonnes.some((c) => c.name === "watchlist_default_sort_key")) {
        db.exec("ALTER TABLE users ADD COLUMN watchlist_default_sort_key TEXT NOT NULL DEFAULT 'name'");
      }
      if (!colonnes.some((c) => c.name === "watchlist_default_sort_direction")) {
        db.exec("ALTER TABLE users ADD COLUMN watchlist_default_sort_direction TEXT NOT NULL DEFAULT 'asc'");
      }
    }
  },
  {
    version: 13,
    description: "Tables de suivi marche par bourse et backfill depuis les assets suivis",
    appliquer: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tracked_markets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          market_key TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          timezone TEXT NOT NULL,
          sessions_json TEXT NOT NULL,
          overrides_json TEXT,
          assets_count INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS market_daily_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          market_key TEXT NOT NULL,
          trading_date TEXT NOT NULL,
          timezone TEXT NOT NULL,
          open_expected_at TEXT,
          open_status TEXT NOT NULL DEFAULT 'pending',
          open_confirmed_at TEXT,
          open_attempts INTEGER NOT NULL DEFAULT 0,
          open_last_error TEXT,
          open_last_checked_at TEXT,
          next_open_check_at TEXT,
          open_status_message TEXT,
          open_job_id TEXT,
          close_expected_at TEXT,
          close_status TEXT NOT NULL DEFAULT 'pending',
          close_confirmed_at TEXT,
          close_attempts INTEGER NOT NULL DEFAULT 0,
          close_last_error TEXT,
          close_last_checked_at TEXT,
          next_close_check_at TEXT,
          close_status_message TEXT,
          close_job_id TEXT,
          assets_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(market_key, trading_date)
        );

        CREATE TABLE IF NOT EXISTS market_check_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          market_key TEXT NOT NULL,
          trading_date TEXT NOT NULL,
          phase TEXT NOT NULL,
          checked_at TEXT NOT NULL,
          expected_at TEXT,
          yahoo_market_state TEXT,
          success INTEGER NOT NULL DEFAULT 0,
          partial_success INTEGER NOT NULL DEFAULT 0,
          message TEXT,
          symbols_count INTEGER NOT NULL DEFAULT 0,
          valid_symbols_count INTEGER NOT NULL DEFAULT 0,
          failed_symbols_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scheduler_health (
          scheduler_name TEXT PRIMARY KEY,
          last_tick_at TEXT,
          last_successful_tick_at TEXT,
          last_error TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_market_daily_runs_market_date ON market_daily_runs(market_key, trading_date);
        CREATE INDEX IF NOT EXISTS idx_market_check_logs_created_at ON market_check_logs(created_at);
      `);

      const assets = db
        .prepare(
          `SELECT DISTINCT a.symbol, a.exchange
           FROM assets a
           WHERE a.symbol IN (SELECT symbol FROM positions)
              OR a.symbol IN (SELECT symbol FROM watchlist)`
        )
        .all() as Array<{ symbol: string; exchange?: string | null }>;
      const counts = new Map<string, { calendar: ReturnType<typeof getMarketCalendar>; count: number }>();
      for (const asset of assets) {
        const calendar = getMarketCalendar(asset.symbol, asset.exchange ?? undefined);
        const existing = counts.get(calendar.market);
        if (existing) existing.count += 1;
        else counts.set(calendar.market, { calendar, count: 1 });
      }

      const timestamp = new Date().toISOString();
      for (const { calendar, count } of counts.values()) {
        db.prepare(
          `INSERT INTO tracked_markets (market_key, display_name, timezone, sessions_json, overrides_json, assets_count, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(market_key) DO UPDATE SET
             display_name = excluded.display_name,
             timezone = excluded.timezone,
             sessions_json = excluded.sessions_json,
             overrides_json = excluded.overrides_json,
             assets_count = excluded.assets_count,
             enabled = CASE WHEN excluded.assets_count > 0 THEN 1 ELSE tracked_markets.enabled END,
             updated_at = excluded.updated_at`
        ).run(
          calendar.market,
          calendar.city,
          calendar.timezone,
          JSON.stringify(calendar.sessions),
          calendar.dayOverrides?.length ? JSON.stringify(calendar.dayOverrides) : null,
          count,
          timestamp,
          timestamp
        );
      }
    }
  },
  {
    version: 3,
    description: "Correction du type user_id dans user_assets (TEXT → INTEGER) et ajout de la clé étrangère vers users",
    appliquer: (db) => {
      const colonnes = db.prepare("PRAGMA table_info(user_assets)").all() as ColonneDb[];
      const colonneUserId = colonnes.find((c) => c.name === "user_id");
      // Abandonne si la colonne est déjà du bon type
      if (colonneUserId?.type?.toUpperCase() === "INTEGER") return;

      // Supprime toute table temporaire laissée par une tentative précédente avortée
      db.exec("DROP TABLE IF EXISTS user_assets_nouveau");

      db.exec(`
        CREATE TABLE user_assets_nouveau (
          user_id INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          quantity REAL NOT NULL,
          average_price REAL NOT NULL,
          transaction_count INTEGER NOT NULL,
          total_fees REAL NOT NULL,
          invested_amount REAL NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(user_id, symbol),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      db.exec(`
        INSERT OR IGNORE INTO user_assets_nouveau
          SELECT CAST(user_id AS INTEGER), symbol, quantity, average_price,
                 transaction_count, total_fees, invested_amount, updated_at
          FROM user_assets
      `);

      db.exec("DROP TABLE user_assets");
      db.exec("ALTER TABLE user_assets_nouveau RENAME TO user_assets");
    }
  }
];

export function appliquerMigrations(db: DatabaseAdapter): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      appliquee_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const versionsAppliquees = new Set<number>(
    (db.prepare("SELECT version FROM _migrations").all() as { version: number }[]).map((r) => r.version)
  );

  for (const migration of migrations) {
    if (versionsAppliquees.has(migration.version)) continue;

    try {
      migration.appliquer(db);
      db.prepare("INSERT INTO _migrations (version, description) VALUES (?, ?)").run(migration.version, migration.description);
    } catch (erreur) {
      throw new Error(`Migration ${migration.version} échouée`, { cause: erreur });
    }
  }
}
