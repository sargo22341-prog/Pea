import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

interface MigrationResult {
  backups: string[];
  backupHasLegacyTransactions: number;
  accounts: { user_id: number; status: string; opening_deposits_cents: number }[];
  transactionsBefore: number;
  transactionsAfter: number;
  positionsAfter: { symbol: string; quantity: number; average_buy_price: number }[];
  backupsAfterSecondRun: number;
  migration47Count: number;
  frontendBlocksAfter: number;
}

test("la migration du compte espèces sauvegarde la base et conserve positions et transactions", () => {
  const result = runBackendScript(`
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { DatabaseAdapter } = await import("./db-adapter.ts");
    const { applyMigrations } = await import("./db-migrations.ts");
    const { migrations } = await import("./migrations/index.ts");
    const { coreSchema } = await import("./schema/core-schema.ts");
    const { marketSchema } = await import("./schema/market-schema.ts");
    const { operationsSchema } = await import("./schema/operations-schema.ts");

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pea-cash-migration-"));
    const file = path.join(directory, "legacy.sqlite");
    try {
      const legacy = new DatabaseAdapter(file);
      legacy.exec(coreSchema); legacy.exec(marketSchema); legacy.exec(operationsSchema);
      applyMigrations(legacy, migrations.filter((migration) => migration.version < 47));
      legacy.prepare("INSERT INTO users (username, password_hash) VALUES ('investor', 'hash')").run();
      legacy.prepare("INSERT INTO users (username, password_hash) VALUES ('newcomer', 'hash')").run();
      legacy.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'AAA.PA', 'AAA', 8, 50, 'EUR')").run();
      legacy.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (1, 'buy', 10, 50, 1, 'EUR', '2024-01-10T09:30:00.000Z', 'pdf_avis_opere')").run();
      legacy.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (1, 'sell', 2, 70, 1, 'EUR', '2025-01-10T09:30:00.000Z', 'pdf_avis_opere')").run();
      const transactionsBefore = legacy.prepare("SELECT COUNT(*) AS total FROM transactions").get().total;
      // Résumé mis en cache avant le compte espèces (sans « pea »), encore valide 72 h après la clôture.
      legacy.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('1:portfolio-summary:1d', '1', 'portfolio-summary', '1d', '{}', ?, ?)").run(Date.now(), Date.now() + 72 * 3600 * 1000);

      applyMigrations(legacy);
      const backupDir = path.join(directory, "backups");
      const backups = fs.readdirSync(backupDir);
      const backup = new DatabaseAdapter(path.join(backupDir, backups[0]));
      const backupHasLegacyTransactions = backup.prepare("SELECT COUNT(*) AS total FROM transactions").get().total;
      backup.close();

      applyMigrations(legacy);
      const output = {
        backups,
        backupHasLegacyTransactions,
        accounts: legacy.prepare("SELECT user_id, status, opening_deposits_cents FROM cash_accounts ORDER BY user_id").all(),
        transactionsBefore,
        transactionsAfter: legacy.prepare("SELECT COUNT(*) AS total FROM transactions").get().total,
        positionsAfter: legacy.prepare("SELECT symbol, quantity, average_buy_price FROM positions").all(),
        backupsAfterSecondRun: fs.readdirSync(backupDir).length,
        migration47Count: legacy.prepare("SELECT COUNT(*) AS total FROM _migrations WHERE version = 47").get().total,
        frontendBlocksAfter: legacy.prepare("SELECT COUNT(*) AS total FROM frontend_block_cache").get().total
      };
      legacy.close();
      console.log("__RESULT__" + JSON.stringify(output));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  `) as MigrationResult;

  assert.equal(result.backups.length, 1);
  assert.match(result.backups[0] ?? "", /^legacy-avant-migration-47-.+\.sqlite$/);
  assert.equal(result.backupHasLegacyTransactions, 2, "la sauvegarde contient l'état d'avant migration");
  assert.deepEqual(result.accounts, [
    { user_id: 1, status: "pending", opening_deposits_cents: 0 },
    { user_id: 2, status: "ready", opening_deposits_cents: 0 }
  ], "aucun versement n'est reconstruit à partir des achats");
  assert.equal(result.transactionsAfter, result.transactionsBefore);
  assert.deepEqual(result.positionsAfter, [{ symbol: "AAA.PA", quantity: 8, average_buy_price: 50 }]);
  assert.equal(result.backupsAfterSecondRun, 1, "une base déjà migrée n'est ni re-sauvegardée ni re-migrée");
  assert.equal(result.migration47Count, 1);
  assert.equal(result.frontendBlocksAfter, 0, "un résumé en cache sans compte espèces ne masque plus la popup de configuration");
});
