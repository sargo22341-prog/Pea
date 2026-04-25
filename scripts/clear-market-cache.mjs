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

const sqlitePath = path.resolve(process.cwd(), process.env.SQLITE_PATH ?? "./data/pea.sqlite");
const require = createRequire(import.meta.url);
const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
const SQL = await initSqlJs({ locateFile: () => wasmPath });

if (!fs.existsSync(sqlitePath)) {
  console.log(`Aucun fichier SQLite à nettoyer: ${sqlitePath}`);
  process.exit(0);
}

const database = new SQL.Database(fs.readFileSync(sqlitePath));
for (const table of ["cached_quotes", "cached_history", "cached_intraday_history", "cached_dividends", "cached_news"]) {
  try {
    database.run(`DELETE FROM ${table}`);
    console.log(`Cache vidé: ${table}`);
  } catch {
    console.log(`Table absente, ignorée: ${table}`);
  }
}

fs.writeFileSync(sqlitePath, Buffer.from(database.export()));
database.close();
console.log("Caches de marché vidés. Positions et watchlist conservées.");
