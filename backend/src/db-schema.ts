import type { DatabaseAdapter } from "./db-adapter.js";
import { applyMigrations } from "./db-migrations.js";
import { coreSchema } from "./schema/core-schema.js";
import { marketSchema } from "./schema/market-schema.js";
import { operationsSchema } from "./schema/operations-schema.js";

export function initializeSchema(db: DatabaseAdapter): void {
  db.exec(coreSchema);
  db.exec(marketSchema);
  db.exec(operationsSchema);
  applyMigrations(db);
}
