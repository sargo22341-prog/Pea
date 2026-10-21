/**
 * Fragment de script backend (voir `runBackendScript`) : un compte espèces prêt avec un état
 * initial au 31 août 2021 (solde 226,25 €, versements 400 €, dividendes déjà perçus 1,70 €
 * certifiés par une ligne de relevé de coupons ENGIE) et les relevés espèces de juillet
 * (`legacy-opening`, ouverture à 0 €) et août 2021 (`legacy-second-month`) importés : achats
 * vérifiés, coupon rapproché de la ligne de coupons, virements résumés par l'état initial.
 * Un versement de 1 000 € du 1er septembre 2026 est postérieur à la date de départ.
 *
 * Expose `db`, `alice`, `bob`, `positions`, `read(name)`, `reads()`, `importStatements(userId)`,
 * `count(userId)` et `now`.
 */
export const fullHistoryScenario = `
const fs = await import("node:fs");
const { db } = await import("./db.ts");
const { parseCashStatement } = await import("./services/cash/cash-statements/parser/cash-statement-parser.ts");
const { cashStatementsService } = await import("./services/cash/cash-statements/cash-statement-import.service.ts");
const now = new Date("2026-10-20T12:00:00.000Z");

const user = (name) => { db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'hash')").run(name); return db.prepare("SELECT id FROM users WHERE username = ?").get(name).id; };
const alice = user("alice");
const bob = user("bob");
for (const id of [alice, bob]) {
  db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at, opening_cash_cents, opening_deposits_cents, opening_dividends_cents, opening_dividends_certified_at) VALUES (?, 'ready', '2021-08-31T20:00:00.000Z', 22625, 40000, 170, '2021-09-01T10:00:00.000Z')").run(id);
}
const position = (userId, symbol, isin) => {
  db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency, isin) VALUES (?, ?, ?, 1, 10, 'EUR', ?)").run(userId, symbol, symbol + " SA", isin);
  return db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol).id;
};
const positions = { danone: position(alice, "BN.PA", "FR0000120644"), legrand: position(alice, "LR.PA", "FR0010307819"), engie: position(alice, "ENGI.PA", "FR0010208488") };
const trade = (positionId, quantity, price, fees) => db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, 'buy', ?, ?, ?, 'EUR', '2021-07-08T09:00:00.000Z', 'pdf_avis_opere')").run(positionId, quantity, price, fees);
trade(positions.danone, 1, 60, 1.2);
trade(positions.legrand, 1, 89, 1.15);
trade(positions.engie, 2, 11.5, 1.1);
for (const id of [alice, bob]) {
  db.prepare("INSERT INTO cash_dividend_statement_lines (user_id, period, line_no, isin, name, payment_date, net_cents, withholding_cents, certified_at) VALUES (?, '2021-08', 1, 'FR0010208488', 'ENGIE', '2021-08-06', 170, 0, '2021-09-01T10:00:00.000Z')").run(id);
}
db.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, source) VALUES (?, 'deposit', 100000, '2026-09-01T08:00:00.000Z', 'manual')").run(alice);

const read = (name) => ({ fileName: name + ".pdf", statement: parseCashStatement(fs.readFileSync("test/fixtures/cash-statements/" + name + ".txt", "utf8")) });
const reads = () => [read("legacy-opening"), read("legacy-second-month")];
const importStatements = (userId) => {
  const preview = cashStatementsService.preview(userId, reads(), now);
  const lines = preview.statements.flatMap((s) => s.lines).filter((l) => l.case === "verify").map((l) => ({ key: l.key, apply: true }));
  return cashStatementsService.confirm(userId, reads(), { lines }, now);
};
const count = (userId = alice) => db.prepare("SELECT (SELECT COUNT(*) FROM cash_movements WHERE user_id = ?) + (SELECT COUNT(*) FROM transactions t JOIN positions p ON p.id = t.position_id WHERE p.user_id = ?) AS total").get(userId, userId).total;
`;
