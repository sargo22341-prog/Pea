/**
 * Rôle du fichier : vider les caches de développement sans supprimer la base,
 * afin de repartir sur des données Yahoo et DTO propres.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";

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

const require = createRequire(import.meta.url);
const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
const SQL = await initSqlJs({ locateFile: () => wasmPath });
const cacheTables = [
  "asset_static_cache",
  "asset_chart_cache",
  "asset_market_cache",
  "asset_dividend_cache",
  "asset_article_cache",
  "user_assets",
  "portfolio_chart_cache",
  "cached_quotes",
  "cached_history",
  "cached_intraday_history",
  "cached_dividends",
  "cached_news",
  "cached_fundamentals"
];

/**
 * Retourne les chemins SQLite possibles pour le dev local.
 *
 * @returns Chemins candidats dédupliqués.
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
 * @param {string} targetPath Chemin du fichier SQLite à nettoyer.
 * @returns {boolean} true si une base a été trouvée et nettoyée.
 */
function clearDatabase(targetPath) {
  if (!fs.existsSync(targetPath)) {
    console.log(`Aucun fichier SQLite à nettoyer: ${targetPath}`);
    return false;
  }

  const database = new SQL.Database(fs.readFileSync(targetPath));
  console.log(`Nettoyage des caches SQLite: ${targetPath}`);
  for (const table of cacheTables) {
    try {
      database.run(`DELETE FROM ${table}`);
      console.log(`Cache vidé: ${table}`);
    } catch {
      console.log(`Table absente, ignorée: ${table}`);
    }
  }

  fs.writeFileSync(targetPath, Buffer.from(database.export()));
  database.close();
  return true;
}

const cleaned = sqliteCandidates().filter(clearDatabase);
if (!cleaned.length) process.exit(0);
console.log("Caches de marché vidés. Positions et watchlist conservées.");
