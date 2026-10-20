/**
 * Fragment de script backend (voir `runBackendScript`) : un compte espèces prêt (état initial au
 * 1er mars 2026) avec des positions identifiées par ISIN, et la lecture des relevés de test.
 * Expose `alice`, `positions`, `statement(name)`, `inlineStatement(lines)`, `movement(...)`,
 * `dividends()` et `now`.
 */
export const statementScenario = `
const fs = await import("node:fs");
const { db } = await import("./db.ts");
const { parseDividendStatement } = await import("./services/cash/dividend-statements/parser/statement-parser.ts");
const now = new Date("2026-10-20T12:00:00.000Z");

const user = (name) => { db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'hash')").run(name); return db.prepare("SELECT id FROM users WHERE username = ?").get(name).id; };
const alice = user("alice");
db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at, opening_cash_cents, opening_deposits_cents) VALUES (?, 'ready', '2026-03-01T00:00:00.000Z', 10000, 10000)").run(alice);
const position = (userId, symbol, isin) => {
  db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency, isin) VALUES (?, ?, ?, 10, 10, 'EUR', ?)").run(userId, symbol, symbol + " SA", isin);
  return db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol).id;
};
const positions = {
  tte: position(alice, "TTE.PA", "FR0000120271"),
  fdj: position(alice, "FDJ.PA", null),
  ai: position(alice, "AI.PA", "FR0000120073"),
  bn: position(alice, "BN.PA", "FR0000120644"),
  vie: position(alice, "VIE.PA", null)
};
// ISIN de FDJ connu par un avis d'opéré importé seulement.
db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, isin) VALUES (?, 'buy', 10, 10, 0, 'EUR', '2026-01-10T10:00:00.000Z', 'FR0013451333')").run(positions.fdj);

const statement = (name) => ({ fileName: name + ".pdf", statement: parseDividendStatement(fs.readFileSync("test/fixtures/dividend-statements/" + name + ".txt", "utf8")) });
const inlineStatement = (fileName, lines) => ({ fileName, statement: parseDividendStatement(lines.join("\\n")) });
const movement = (userId, symbol, positionId, cents, effectiveAt) => {
  db.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, position_id, symbol, source) VALUES (?, 'dividend', ?, ?, ?, ?, 'manual')").run(userId, cents, effectiveAt, positionId, symbol);
  return db.prepare("SELECT MAX(id) AS id FROM cash_movements").get().id;
};
const dividends = (userId = alice) => db.prepare("SELECT id, symbol, amount_cents, effective_at, source, verification, verification_ref, import_ref FROM cash_movements WHERE user_id = ? AND type = 'dividend' ORDER BY id").all(userId);

/** Relevé de mai 2026 : Air Liquide (proposition en attente), Danone (rien), Veolia (ISIN inconnu). */
const mayStatement = () => inlineStatement("mai-2026.pdf", [
  "COUPONS REMBOURSEMENTS : MAI 2026", "DETAIL COUPONS",
  "04/05/2026 4 DANONE (FR0000120644) 8,40 8,40 8,40",
  "11/05/2026 36 VEOLIA ENVIRON. (FR0000124141) 45,00 45,00 45,00",
  "18/05/2026 7 AIR LIQUIDE (FR0000120073) 22,40 22,40 22,40",
  "TOTAL EUR 0,00 0,00 75,80 0,00 75,80", "COUPONS : NETS FISCAUX 75,80 EUR", "Feuillet 1/1"
]);
db.prepare(\`INSERT INTO cash_dividend_proposals (user_id, position_id, symbol, ex_date, ex_dividend_at, payment_at, payment_estimated, quantity, amount_per_share, currency,
  gross_cents, withholding_rate, withholding_cents, net_cents, country, withholding_basis, needs_review, status)
  VALUES (?, ?, 'AI.PA', '2026-05-14', '2026-05-14T07:00:00.000Z', '2026-05-18T07:00:00.000Z', 1, 7, 3.2, 'EUR', 2240, 0, 0, 2240, 'FR', 'isin', 0, 'ignored')\`).run(alice, positions.ai);
`;
