/**
 * Role du fichier : vider les caches de developpement sans supprimer la base,
 * afin de repartir sur des donnees Yahoo et DTO propres.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    process.env[key] ??= value;
  }
}

const requireFromBackend = createRequire(path.resolve(process.cwd(), "backend/package.json"));
const Database = requireFromBackend("better-sqlite3");

const cacheTables = [
  "cached_dividends",
  "cached_fundamentals",
  "cached_history",
  "cached_intraday_history",
  "cached_news",
  "cached_quotes",
  "asset_article_cache",
  "asset_calendar_events",
  "asset_dividends",
  "asset_financials",
  "asset_market_snapshots",
  "asset_profiles",
  "chart_candles_1d",
  "chart_candles_1w",
  "chart_candles_1m",
  "chart_candles_all",
  "frontend_block_cache",
  "market_data_finalizations",
  "portfolio_chart_cache",
  "portfolio_positions_performance_cache",
  "user_assets"
];

/**
 * Retourne les chemins SQLite possibles pour le dev local.
 *
 * @returns Chemins candidats dedupliques.
 */
function sqliteCandidates() {
  const configuredPath = process.env.SQLITE_PATH ?? "./data/pea.sqlite";
  const candidates = [path.resolve(process.cwd(), configuredPath)];
  if (!path.isAbsolute(configuredPath)) {
    candidates.push(path.resolve(process.cwd(), "backend", configuredPath));
  }
  return [...new Set(candidates)];
}

/**
 * Vide les tables de cache d'une base SQLite si elle existe.
 *
 * @param {string} targetPath Chemin du fichier SQLite a nettoyer.
 * @returns {boolean} true si une base a ete trouvee et nettoyee.
 */
function clearDatabase(targetPath) {
  if (!fs.existsSync(targetPath)) {
    console.log(`Aucun fichier SQLite a nettoyer: ${targetPath}`);
    return false;
  }

  const database = new Database(targetPath);
  console.log(`Nettoyage des caches SQLite: ${targetPath}`);
  const tableExists = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?");
  const clearTables = database.transaction(() => {
    for (const table of cacheTables) {
      if (!tableExists.get(table)) {
        console.log(`Table absente, ignoree: ${table}`);
        continue;
      }

      const { changes } = database.prepare(`DELETE FROM ${table}`).run();
      console.log(`Cache vide: ${table} (${changes} ligne(s))`);
    }
  });

  try {
    clearTables();
  } finally {
    database.close();
  }
  return true;
}

const cleaned = sqliteCandidates().filter(clearDatabase);
if (!cleaned.length) process.exit(0);
console.log("Caches de marche vides. Positions, transactions, watchlist, comptes et preferences conserves.");
