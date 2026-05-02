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
      // Accélère la lecture des bougies lors du calcul des graphiques de portefeuille
      db.exec("CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range_interval ON chart_candles(asset_id, range, interval)");
      // Accélère la suppression des bougies lors du recalcul d'une plage
      db.exec("CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range ON chart_candles(asset_id, range)");
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
