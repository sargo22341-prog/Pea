/**
 * Rôle du fichier : initialiser la base SQLite embarquée, exposer un petit adaptateur
 * compatible avec sql.js et créer les tables nécessaires aux données utilisateur et caches.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs, { type BindParams, type Database as SqlJsDatabase, type Statement } from "sql.js";
import { config } from "./config.js";

const directory = path.dirname(config.sqlitePath);
if (directory && directory !== ".") {
  fs.mkdirSync(directory, { recursive: true });
}

const require = createRequire(import.meta.url);
const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
const SQL = await initSqlJs({ locateFile: () => wasmPath });
const fileBuffer = fs.existsSync(config.sqlitePath) ? fs.readFileSync(config.sqlitePath) : undefined;

/**
 * Encapsule une requête préparée sql.js pour uniformiser les méthodes get/all/run.
 *
 * @param database Adaptateur chargé de persister la base après écriture.
 * @param statement Requête préparée par sql.js.
 * @returns Instance capable d'exécuter la requête avec des paramètres liés.
 */
class PreparedStatement {
  constructor(
    private database: DatabaseAdapter,
    private statement: Statement
  ) {}

  /**
   * Retourne la première ligne produite par la requête.
   *
   * @param params Valeurs liées aux marqueurs SQL.
   * @returns Ligne sous forme d'objet ou undefined si aucun résultat n'existe.
   */
  get(...params: unknown[]) {
    this.statement.bind(params as BindParams);
    const row = this.statement.step() ? this.statement.getAsObject() : undefined;
    this.statement.free();
    return row;
  }

  /**
   * Retourne toutes les lignes produites par la requête.
   *
   * @param params Valeurs liées aux marqueurs SQL.
   * @returns Liste d'objets correspondant aux lignes SQLite.
   */
  all(...params: unknown[]) {
    this.statement.bind(params as BindParams);
    const rows: Record<string, unknown>[] = [];
    while (this.statement.step()) rows.push(this.statement.getAsObject());
    this.statement.free();
    return rows;
  }

  /**
   * Exécute une requête d'écriture puis force la persistance du fichier SQLite.
   *
   * @param params Valeurs liées aux marqueurs SQL.
   * @returns Rien.
   */
  run(...params: unknown[]) {
    this.statement.bind(params as BindParams);
    this.statement.step();
    this.statement.free();
    this.database.persist();
  }
}

/**
 * Fournit une façade minimale autour de sql.js avec persistance automatique sur disque.
 *
 * @param buffer Contenu SQLite existant, lorsqu'un fichier de base est déjà présent.
 * @returns Adaptateur de base utilisé par les services backend.
 */
class DatabaseAdapter {
  private database: SqlJsDatabase;

  constructor(buffer?: Buffer) {
    this.database = buffer ? new SQL.Database(buffer) : new SQL.Database();
  }

  /**
   * Exécute un bloc SQL complet et sauvegarde la base.
   *
   * @param sql Instructions SQL à appliquer.
   * @returns Rien.
   */
  exec(sql: string) {
    this.database.exec(sql);
    this.persist();
  }

  /**
   * Prépare une requête SQL paramétrable.
   *
   * @param sql Requête SQL avec marqueurs éventuels.
   * @returns Requête préparée via l'adaptateur local.
   */
  prepare(sql: string) {
    return new PreparedStatement(this, this.database.prepare(sql));
  }

  /**
   * Sauvegarde l'état courant de sql.js dans le fichier configuré.
   *
   * @returns Rien.
   */
  persist() {
    fs.writeFileSync(config.sqlitePath, Buffer.from(this.database.export()));
  }
}

export const db = new DatabaseAdapter(fileBuffer);

db.exec(`
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    average_buy_price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    traded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(position_id) REFERENCES positions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cached_quotes (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_dividends (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_news (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_fundamentals (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_history (
    cache_key TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    range TEXT NOT NULL,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_intraday_history (
    cache_key TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    range TEXT NOT NULL,
    interval TEXT NOT NULL,
    trading_day TEXT NOT NULL,
    payload TEXT NOT NULL,
    last_updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_icons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    file_path TEXT,
    mime_type TEXT,
    size INTEGER,
    source TEXT NOT NULL DEFAULT 'auto',
    fetch_status TEXT NOT NULL DEFAULT 'pending',
    last_attempt_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    profile_icon_url TEXT,
    profile_icon_path TEXT,
    profile_icon_mime_type TEXT,
    profile_icon_size INTEGER,
    dashboard_default_sort_key TEXT NOT NULL DEFAULT 'name',
    dashboard_default_sort_direction TEXT NOT NULL DEFAULT 'asc',
    default_chart_range TEXT NOT NULL DEFAULT '1d',
    local_pea_search_enabled INTEGER NOT NULL DEFAULT 1,
    asset_news_enabled INTEGER NOT NULL DEFAULT 1,
    news_language_fr_enabled INTEGER NOT NULL DEFAULT 1,
    news_language_en_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    exchange TEXT,
    currency TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assets (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
    exchange TEXT NOT NULL,
    country TEXT,
    sector TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_assets (
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    average_price REAL NOT NULL,
    transaction_count INTEGER NOT NULL,
    total_fees REAL NOT NULL,
    invested_amount REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS asset_static_cache (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_market_cache (
    symbol TEXT PRIMARY KEY,
    market_state TEXT,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_chart_cache (
    cache_key TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    range TEXT NOT NULL,
    interval TEXT NOT NULL,
    market_state TEXT,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_dividend_cache (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_article_cache (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_chart_cache (
    cache_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    range TEXT NOT NULL,
    market_state TEXT,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

try {
  db.exec("ALTER TABLE positions ADD COLUMN notes TEXT;");
} catch {
  // Column already exists in existing SQLite files.
}

const assetIconColumns = db.prepare("PRAGMA table_info(asset_icons)").all().map((row: any) => String(row.name));
if (assetIconColumns.includes("icon_url") || !assetIconColumns.includes("file_path")) {
  db.exec(`
    DROP TABLE IF EXISTS asset_icons;
    CREATE TABLE asset_icons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      file_path TEXT,
      mime_type TEXT,
      size INTEGER,
      source TEXT NOT NULL DEFAULT 'auto',
      fetch_status TEXT NOT NULL DEFAULT 'pending',
      last_attempt_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

for (const migration of [
  "ALTER TABLE users ADD COLUMN profile_icon_path TEXT;",
  "ALTER TABLE users ADD COLUMN profile_icon_mime_type TEXT;",
  "ALTER TABLE users ADD COLUMN profile_icon_size INTEGER;",
  "ALTER TABLE users ADD COLUMN dashboard_default_sort_key TEXT NOT NULL DEFAULT 'name';",
  "ALTER TABLE users ADD COLUMN dashboard_default_sort_direction TEXT NOT NULL DEFAULT 'asc';",
  "ALTER TABLE users ADD COLUMN default_chart_range TEXT NOT NULL DEFAULT '1d';",
  "ALTER TABLE users ADD COLUMN local_pea_search_enabled INTEGER NOT NULL DEFAULT 1;",
  "ALTER TABLE users ADD COLUMN asset_news_enabled INTEGER NOT NULL DEFAULT 1;",
  "ALTER TABLE users ADD COLUMN news_language_fr_enabled INTEGER NOT NULL DEFAULT 1;",
  "ALTER TABLE users ADD COLUMN news_language_en_enabled INTEGER NOT NULL DEFAULT 0;"
]) {
  try {
    db.exec(migration);
  } catch {
    // Column already exists in existing SQLite files.
  }
}

for (const migration of [
  "ALTER TABLE transactions ADD COLUMN source TEXT;",
  "ALTER TABLE transactions ADD COLUMN source_file_name TEXT;",
  "ALTER TABLE transactions ADD COLUMN asset_name TEXT;",
  "ALTER TABLE transactions ADD COLUMN isin TEXT;",
  "ALTER TABLE transactions ADD COLUMN ticker TEXT;",
  "ALTER TABLE transactions ADD COLUMN total_fees REAL;",
  "ALTER TABLE transactions ADD COLUMN raw_text_snippet TEXT;"
]) {
  try {
    db.exec(migration);
  } catch {
    // Column already exists in existing SQLite files.
  }
}

for (const migration of [
  "ALTER TABLE transactions DROP COLUMN gross_amount;",
  "ALTER TABLE transactions DROP COLUMN commission;",
  "ALTER TABLE transactions DROP COLUMN fees;",
  "ALTER TABLE transactions DROP COLUMN net_amount;"
]) {
  try {
    db.exec(migration);
  } catch {
    // Column does not exist, or SQLite cannot drop it in this environment.
  }
}
