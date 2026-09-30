import type { DatabaseAdapter } from "./db-adapter.js";
import { migrations as allMigrations } from "./migrations/index.js";
import type { Migration } from "./migrations/types.js";

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

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    const apply = () => {
      migration.appliquer(db);
      db.prepare("INSERT INTO _migrations (version, description) VALUES (?, ?)").run(migration.version, migration.description);
    };
    try {
      if (migration.transactional === false) apply();
      else db.transaction(apply);
    } catch (error) {
      throw new Error(`Migration ${migration.version} échouée`, { cause: error });
    }
  }
}
