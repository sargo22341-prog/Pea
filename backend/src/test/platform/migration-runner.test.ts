import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("a migration failing halfway leaves neither partial schema nor applied version", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { applyMigrations } = await import("./db-migrations.ts");
    const failing = {
      version: 9001,
      description: "cree une table puis echoue",
      appliquer: (database) => {
        database.exec("CREATE TABLE half_migrated (id INTEGER PRIMARY KEY)");
        database.exec("INSERT INTO table_inexistante VALUES (1)");
      }
    };
    let error;
    try {
      applyMigrations(db, [failing]);
    } catch (caught) {
      error = caught.message;
    }
    const table = db.prepare("SELECT name FROM sqlite_master WHERE name = 'half_migrated'").get();
    const recorded = db.prepare("SELECT version FROM _migrations WHERE version = 9001").get();
    console.log("__RESULT__" + JSON.stringify({ error, tableExists: Boolean(table), recorded: Boolean(recorded) }));
  `) as { error: string; tableExists: boolean; recorded: boolean };

  assert.equal(result.error, "Migration 9001 échouée");
  assert.equal(result.tableExists, false);
  assert.equal(result.recorded, false);
});
