import type { DatabaseAdapter } from "./db-adapter.js";
import { migrations } from "./migrations/index.js";

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
