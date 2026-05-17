import type { Migration } from "./types.js";

type CountRow = { count: number };

function hasColumn(db: Parameters<Migration["appliquer"]>[0], table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
}

export const bootstrapAdminMigration: Migration = {
  version: 29,
  description: "Marque explicitement le compte admin cree par le setup initial",
  appliquer: (db) => {
    if (!hasColumn(db, "users", "bootstrap_admin")) {
      db.exec("ALTER TABLE users ADD COLUMN bootstrap_admin INTEGER NOT NULL DEFAULT 0");
    }

    const bootstrapCount = Number((db.prepare("SELECT COUNT(*) AS count FROM users WHERE bootstrap_admin = 1").get() as CountRow).count);
    if (bootstrapCount === 0) {
      const adminCount = Number((db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as CountRow).count);
      if (adminCount > 1) {
        throw new Error("Plusieurs comptes admin existent sans marqueur bootstrap explicite.");
      }
      if (adminCount === 1) {
        db.exec("UPDATE users SET bootstrap_admin = 1 WHERE role = 'admin'");
      }
    }

    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_bootstrap_admin ON users(bootstrap_admin) WHERE bootstrap_admin = 1");
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS users_prevent_non_bootstrap_admin_insert
        BEFORE INSERT ON users
        WHEN NEW.role = 'admin' AND NEW.bootstrap_admin != 1
        BEGIN
          SELECT RAISE(ABORT, 'admin role reserved for bootstrap setup');
        END;
      CREATE TRIGGER IF NOT EXISTS users_prevent_non_bootstrap_admin_update
        BEFORE UPDATE OF role, bootstrap_admin ON users
        WHEN NEW.role = 'admin' AND NEW.bootstrap_admin != 1
        BEGIN
          SELECT RAISE(ABORT, 'admin role reserved for bootstrap setup');
        END;
      CREATE TRIGGER IF NOT EXISTS users_prevent_bootstrap_admin_demotion
        BEFORE UPDATE OF bootstrap_admin ON users
        WHEN OLD.bootstrap_admin = 1 AND NEW.bootstrap_admin != 1
        BEGIN
          SELECT RAISE(ABORT, 'bootstrap admin marker is immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS users_prevent_runtime_bootstrap_promotion
        BEFORE UPDATE OF bootstrap_admin ON users
        WHEN OLD.bootstrap_admin = 0 AND NEW.bootstrap_admin = 1
        BEGIN
          SELECT RAISE(ABORT, 'bootstrap admin marker is setup-only');
        END;
    `);
  }
};
