// Rôle du fichier : déclarer et appliquer les migrations de schéma SQLite.
// Chaque migration est identifiée par un numéro de version et ne s'exécute
// qu'une seule fois. Le tableau _migrations trace les versions déjà appliquées.

import type { DatabaseAdapter } from "./db.js";

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
