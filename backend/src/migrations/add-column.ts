import type { DatabaseAdapter } from "../db-adapter.js";
import type { ColonneDb } from "./types.js";

/** Ajoute une colonne si elle manque : une migration rejouée sur une base déjà migrée est sans effet. */
export function addColumnIfMissing(db: DatabaseAdapter, table: string, column: string, definition: string) {
  const exists = (db.prepare(`PRAGMA table_info(${table})`).all() as ColonneDb[]).some((row) => row.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
