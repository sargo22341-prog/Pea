import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

interface Result {
  backups: number;
  before: unknown[];
  after: unknown[];
  proposalMovement: number | null;
  inserted: string;
  rejected: boolean;
  foreignKeys: number;
  version56: number;
}

test("migration 56 : le journal espèces accepte les nouveaux crédits sans perdre ni lien ni vérification", () => {
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

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pea-migration-56-"));
    try {
      const legacy = new DatabaseAdapter(path.join(directory, "legacy.sqlite"));
      legacy.exec(coreSchema); legacy.exec(marketSchema); legacy.exec(operationsSchema);
      applyMigrations(legacy, migrations.filter((migration) => migration.version < 56));
      legacy.prepare("INSERT INTO users (username, password_hash) VALUES ('investor', 'hash')").run();
      legacy.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'AAA.PA', 'AAA', 8, 50, 'EUR')").run();
      legacy.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, source) VALUES (1, 'deposit', 100000, '2026-01-02T09:00:00.000Z', 'manual')").run();
      legacy.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, position_id, symbol, source, import_ref, verification, verified_at, verification_ref) VALUES (1, 'dividend', 2240, '2026-05-18T12:00:00.000Z', 1, 'AAA.PA', 'pdf', 'statement:2026-05#3', 'document', '2026-10-20T12:00:00.000Z', '2026-05#3')").run();
      legacy.prepare(\`INSERT INTO cash_dividend_proposals (user_id, position_id, symbol, ex_date, ex_dividend_at, payment_at, payment_estimated, quantity, amount_per_share, currency,
        gross_cents, withholding_rate, withholding_cents, net_cents, country, withholding_basis, needs_review, status, movement_id)
        VALUES (1, 1, 'AAA.PA', '2026-05-14', '2026-05-14T07:00:00.000Z', '2026-05-18T07:00:00.000Z', 1, 7, 3.2, 'EUR', 2240, 0, 0, 2240, 'FR', 'isin', 0, 'accepted', 2)\`).run();
      const columns = "id, user_id, type, amount_cents, effective_at, position_id, symbol, source, import_ref, note, created_at, verification, verified_at, verification_ref";
      const before = legacy.prepare(\`SELECT \${columns} FROM cash_movements ORDER BY id\`).all();

      applyMigrations(legacy);
      applyMigrations(legacy);
      legacy.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, source) VALUES (1, 'capital_repayment', 6125, '2026-05-06T12:00:00.000Z', 'manual')").run();
      legacy.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, source) VALUES (1, 'compensation', 6553, '2026-06-10T12:00:00.000Z', 'manual')").run();
      let rejected = false;
      try { legacy.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, source) VALUES (1, 'bonus', 1, '2026-06-10T12:00:00.000Z', 'manual')").run(); } catch { rejected = true; }
      const output = {
        backups: fs.readdirSync(path.join(directory, "backups")).length,
        before,
        after: legacy.prepare(\`SELECT \${columns} FROM cash_movements WHERE id <= 2 ORDER BY id\`).all(),
        proposalMovement: legacy.prepare("SELECT movement_id FROM cash_dividend_proposals").get().movement_id,
        inserted: legacy.prepare("SELECT GROUP_CONCAT(type) AS types FROM cash_movements WHERE id > 2").get().types,
        rejected,
        foreignKeys: legacy.prepare("PRAGMA foreign_keys").get().foreign_keys,
        version56: legacy.prepare("SELECT COUNT(*) AS total FROM _migrations WHERE version = 56").get().total
      };
      legacy.close();
      console.log("__RESULT__" + JSON.stringify(output));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  `) as Result;

  assert.equal(result.backups, 1, "copie de la base avant la recopie du journal");
  assert.deepEqual(result.after, result.before, "identifiants, montants, dates, références et vérifications conservés");
  assert.equal(result.proposalMovement, 2, "la proposition validée pointe toujours vers son mouvement");
  assert.equal(result.inserted, "capital_repayment,compensation");
  assert.ok(result.rejected, "un type inconnu reste refusé par la base");
  assert.equal(result.foreignKeys, 1, "les clés étrangères sont réactivées");
  assert.equal(result.version56, 1, "migration rejouable sans effet");
});
