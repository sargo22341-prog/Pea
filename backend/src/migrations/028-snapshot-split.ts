import type { Migration } from "./types.js";

/**
 * Snapshot split : remplace la mega-table `asset_market_snapshots` (40+ colonnes hétérogènes)
 * par 3 tables dédiées avec leurs propres `updated_at`, gérées séparément :
 *
 *   - `asset_quote_snapshot`     : volatile (prix, bid/ask, market_state, volumes intraday).
 *   - `asset_quote_range`        : semi-stable (52w high/low, change%, average volumes).
 *   - `asset_dividend_snapshot`  : stable (ex_dividend_date, dividend_rate, dividend_yield).
 *
 * Bénéfices :
 *   - Updates parcellaires explicites : un refresh de quote ne touche pas la dividend info.
 *   - Une seule colonne `updated_at` par table — plus besoin des 5 timestamps `_updated_at`
 *     bricolés en CASE WHEN dans `upsertSnapshot`.
 *   - Frontières claires : qui met à jour quoi.
 *
 * Le code lit ensuite la mega-table virtuellement via LEFT JOIN dans le repository, qui expose
 * la même interface aux services consommateurs.
 *
 * Les données existantes sont copiées avant DROP de la table d'origine.
 */
export const snapshotSplitMigration: Migration = {
  version: 28,
  description: "Splitte asset_market_snapshots en quote/range/dividend",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS asset_quote_snapshot (
        asset_id INTEGER PRIMARY KEY,
        market_state TEXT,
        last_price REAL,
        day_change REAL,
        day_change_percent REAL,
        previous_close REAL,
        open_price REAL,
        day_high REAL,
        day_low REAL,
        volume REAL,
        bid_price REAL,
        ask_price REAL,
        bid_size REAL,
        ask_size REAL,
        regular_market_time TEXT,
        currency TEXT,
        exchange TEXT,
        full_exchange_name TEXT,
        quote_type TEXT,
        source TEXT NOT NULL DEFAULT 'yahoo-finance2',
        last_checked_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS asset_quote_range (
        asset_id INTEGER PRIMARY KEY,
        fifty_two_week_low REAL,
        fifty_two_week_high REAL,
        fifty_two_week_change_percent REAL,
        average_volume_3m REAL,
        average_volume_10d REAL,
        source TEXT NOT NULL DEFAULT 'yahoo-finance2',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS asset_dividend_snapshot (
        asset_id INTEGER PRIMARY KEY,
        ex_dividend_date TEXT,
        dividend_rate REAL,
        dividend_yield REAL,
        trailing_annual_dividend_rate REAL,
        trailing_annual_dividend_yield REAL,
        source TEXT NOT NULL DEFAULT 'yahoo-finance2',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );
    `);

    const tableExists = (table: string) =>
      Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));

    if (!tableExists("asset_market_snapshots")) return;

    db.exec(`
      INSERT OR REPLACE INTO asset_quote_snapshot (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, bid_price, ask_price, bid_size, ask_size, regular_market_time,
        currency, exchange, full_exchange_name, quote_type, source, last_checked_at, updated_at
      )
      SELECT
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, bid_price, ask_price, bid_size, ask_size, regular_market_time,
        currency, exchange, full_exchange_name, quote_type,
        COALESCE(source, 'yahoo-finance2'),
        last_checked_at,
        COALESCE(market_core_updated_at, updated_at)
      FROM asset_market_snapshots;

      INSERT OR REPLACE INTO asset_quote_range (
        asset_id, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent,
        average_volume_3m, average_volume_10d, source, updated_at
      )
      SELECT
        asset_id, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent,
        average_volume_3m, average_volume_10d,
        COALESCE(source, 'yahoo-finance2'),
        COALESCE(range_52w_updated_at, updated_at)
      FROM asset_market_snapshots;

      INSERT OR REPLACE INTO asset_dividend_snapshot (
        asset_id, ex_dividend_date, dividend_rate, dividend_yield,
        trailing_annual_dividend_rate, trailing_annual_dividend_yield, source, updated_at
      )
      SELECT
        asset_id, ex_dividend_date, dividend_rate, dividend_yield,
        trailing_annual_dividend_rate, trailing_annual_dividend_yield,
        COALESCE(source, 'yahoo-finance2'),
        COALESCE(dividend_info_updated_at, updated_at)
      FROM asset_market_snapshots;
    `);

    db.exec("DROP TABLE asset_market_snapshots");

    // Vue de compatibilité : reproduit l'ancienne mega-table en LEFT JOIN sur les 3 tables.
    // Permet aux requêtes SELECT existantes (tests, scripts admin) de continuer à fonctionner.
    db.exec(`
      CREATE VIEW IF NOT EXISTS asset_market_snapshots AS
      SELECT
        q.asset_id,
        q.market_state,
        q.last_price,
        q.day_change,
        q.day_change_percent,
        q.previous_close,
        q.open_price,
        q.day_high,
        q.day_low,
        q.volume,
        q.bid_price,
        q.ask_price,
        q.bid_size,
        q.ask_size,
        q.regular_market_time,
        q.currency,
        q.exchange,
        q.full_exchange_name,
        q.quote_type,
        q.source,
        q.last_checked_at,
        r.fifty_two_week_low,
        r.fifty_two_week_high,
        r.fifty_two_week_change_percent,
        r.average_volume_3m,
        r.average_volume_10d,
        d.ex_dividend_date,
        d.dividend_rate,
        d.dividend_yield,
        d.trailing_annual_dividend_rate,
        d.trailing_annual_dividend_yield,
        q.updated_at AS market_core_updated_at,
        q.updated_at AS liquidity_updated_at,
        r.updated_at AS range_52w_updated_at,
        d.updated_at AS dividend_info_updated_at,
        q.updated_at AS market_profile_updated_at,
        COALESCE(q.updated_at, r.updated_at, d.updated_at) AS updated_at
      FROM asset_quote_snapshot q
      LEFT JOIN asset_quote_range r ON r.asset_id = q.asset_id
      LEFT JOIN asset_dividend_snapshot d ON d.asset_id = q.asset_id;
    `);
  },
  defaire: (db) => {
    // Recrée la mega-table `asset_market_snapshots` et copie les 3 tables splittées dedans
    // (les 5 timestamps freshness viennent des `updated_at` de chaque table source).
    db.exec("DROP VIEW IF EXISTS asset_market_snapshots");
    db.exec(`
      CREATE TABLE IF NOT EXISTS asset_market_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL UNIQUE,
        market_state TEXT,
        last_price REAL,
        day_change REAL,
        day_change_percent REAL,
        previous_close REAL,
        open_price REAL,
        day_high REAL,
        day_low REAL,
        volume REAL,
        bid_price REAL,
        ask_price REAL,
        bid_size REAL,
        ask_size REAL,
        average_volume_3m REAL,
        average_volume_10d REAL,
        fifty_two_week_low REAL,
        fifty_two_week_high REAL,
        fifty_two_week_change_percent REAL,
        ex_dividend_date TEXT,
        dividend_rate REAL,
        dividend_yield REAL,
        trailing_annual_dividend_rate REAL,
        trailing_annual_dividend_yield REAL,
        currency TEXT,
        exchange TEXT,
        full_exchange_name TEXT,
        quote_type TEXT,
        regular_market_time TEXT,
        source TEXT NOT NULL DEFAULT 'yahoo-finance2',
        last_checked_at TEXT,
        market_core_updated_at TEXT,
        liquidity_updated_at TEXT,
        range_52w_updated_at TEXT,
        dividend_info_updated_at TEXT,
        market_profile_updated_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );

      INSERT OR REPLACE INTO asset_market_snapshots (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, bid_price, ask_price, bid_size, ask_size,
        average_volume_3m, average_volume_10d, fifty_two_week_low, fifty_two_week_high,
        fifty_two_week_change_percent, ex_dividend_date, dividend_rate, dividend_yield,
        trailing_annual_dividend_rate, trailing_annual_dividend_yield,
        currency, exchange, full_exchange_name, quote_type, regular_market_time,
        source, last_checked_at,
        market_core_updated_at, liquidity_updated_at, range_52w_updated_at,
        dividend_info_updated_at, market_profile_updated_at, updated_at
      )
      SELECT
        q.asset_id,
        q.market_state, q.last_price, q.day_change, q.day_change_percent, q.previous_close, q.open_price,
        q.day_high, q.day_low, q.volume, q.bid_price, q.ask_price, q.bid_size, q.ask_size,
        r.average_volume_3m, r.average_volume_10d, r.fifty_two_week_low, r.fifty_two_week_high,
        r.fifty_two_week_change_percent, d.ex_dividend_date, d.dividend_rate, d.dividend_yield,
        d.trailing_annual_dividend_rate, d.trailing_annual_dividend_yield,
        q.currency, q.exchange, q.full_exchange_name, q.quote_type, q.regular_market_time,
        q.source, q.last_checked_at,
        q.updated_at, q.updated_at, r.updated_at, d.updated_at, q.updated_at,
        COALESCE(q.updated_at, r.updated_at, d.updated_at, CURRENT_TIMESTAMP)
      FROM asset_quote_snapshot q
      LEFT JOIN asset_quote_range r ON r.asset_id = q.asset_id
      LEFT JOIN asset_dividend_snapshot d ON d.asset_id = q.asset_id;

      DROP TABLE asset_dividend_snapshot;
      DROP TABLE asset_quote_range;
      DROP TABLE asset_quote_snapshot;
    `);
  }
};
