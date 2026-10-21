import fs from "node:fs";
import path from "node:path";
import type { DatabaseAdapter } from "./db-adapter.js";
import { migrations as allMigrations } from "./migrations/index.js";
import type { Migration } from "./migrations/types.js";

/** Une base sans utilisateur est une installation neuve : il n'y a rien à sauvegarder. */
function hasUserData(db: DatabaseAdapter) {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  return Boolean(table && db.prepare("SELECT 1 FROM users LIMIT 1").get());
}

/** Sauvegarde la base avant une migration sensible et renvoie le chemin de la copie. */
export function backupBeforeMigration(db: DatabaseAdapter, migration: Migration, now = new Date()) {
  if (db.filePath === ":memory:" || !hasUserData(db)) return undefined;
  const directory = path.join(path.dirname(db.filePath), "backups");
  fs.mkdirSync(directory, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const target = path.join(directory, `${path.basename(db.filePath, path.extname(db.filePath))}-avant-migration-${migration.version}-${stamp}.sqlite`);
  db.backupTo(target);
  return target;
}

export function applyMigrations(db: DatabaseAdapter, migrations: Migration[] = allMigrations): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      appliquee_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedVersions = new Set<number>(
    (db.prepare("SELECT version FROM _migrations").all() as { version: number }[]).map((r) => r.version)
  );

  // Une seule copie par démarrage : celle d'avant la première migration sensible couvre les suivantes.
  let backedUp = false;
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    const apply = () => {
      migration.appliquer(db);
      db.prepare("INSERT INTO _migrations (version, description) VALUES (?, ?)").run(migration.version, migration.description);
    };
    try {
      if (migration.sauvegardeAvant && !backedUp) backedUp = backupBeforeMigration(db, migration) !== undefined;
      if (migration.transactional === false) apply();
      else db.transaction(apply);
    } catch (error) {
      throw new Error(`Migration ${migration.version} échouée`, { cause: error });
    }
  }
}
