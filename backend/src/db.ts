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

class PreparedStatement {
  constructor(
    private database: DatabaseAdapter,
    private statement: Statement
  ) {}

  get(...params: unknown[]) {
    this.statement.bind(params as BindParams);
    const row = this.statement.step() ? this.statement.getAsObject() : undefined;
    this.statement.free();
    return row;
  }

  all(...params: unknown[]) {
    this.statement.bind(params as BindParams);
    const rows: Record<string, unknown>[] = [];
    while (this.statement.step()) rows.push(this.statement.getAsObject());
    this.statement.free();
    return rows;
  }

  run(...params: unknown[]) {
    this.statement.bind(params as BindParams);
    this.statement.step();
    this.statement.free();
    this.database.persist();
  }
}

class DatabaseAdapter {
  private database: SqlJsDatabase;

  constructor(buffer?: Buffer) {
    this.database = buffer ? new SQL.Database(buffer) : new SQL.Database();
  }

  exec(sql: string) {
    this.database.exec(sql);
    this.persist();
  }

  prepare(sql: string) {
    return new PreparedStatement(this, this.database.prepare(sql));
  }

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
    purchase_date TEXT,
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
  "ALTER TABLE users ADD COLUMN asset_news_enabled INTEGER NOT NULL DEFAULT 1;"
]) {
  try {
    db.exec(migration);
  } catch {
    // Column already exists in existing SQLite files.
  }
}
