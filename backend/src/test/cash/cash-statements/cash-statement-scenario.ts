/**
 * Fragment de script backend (voir `runBackendScript`) : un compte espèces prêt (état initial au
 * 1er février 2026) et les opérations que les relevés espèces de test doivent retrouver.
 *
 * Relevé de février (`current-account-change`) : reprise de solde (neutre), versement de 2 000 €
 * déjà saisi à la main, achats ENGIE et ISHS (avis importés), coupon ASML (à créer).
 * Relevé de mars (`current-mixed`) : coupon TotalEnergies saisi à la main, remboursement ENGIE
 * déjà certifié par le relevé de coupons, coupon Air Liquide (non enregistré), indemnisation Air
 * Liquide (à créer), vente Legrand (avis importé), versement (à créer), achat sans avis.
 * Un versement de 500 € du 20 mars, absent du relevé, doit être signalé « non retrouvé ».
 *
 * Expose `db`, `alice`, `bob`, `positions`, `ids`, `read(name)`, `count()`, `links()` et `now`.
 */
export const cashStatementScenario = `
const fs = await import("node:fs");
const { db } = await import("./db.ts");
const { parseCashStatement } = await import("./services/cash/cash-statements/parser/cash-statement-parser.ts");
const now = new Date("2026-10-20T12:00:00.000Z");

const user = (name) => { db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'hash')").run(name); return db.prepare("SELECT id FROM users WHERE username = ?").get(name).id; };
const alice = user("alice");
const bob = user("bob");
for (const id of [alice, bob]) {
  db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at, opening_cash_cents, opening_deposits_cents) VALUES (?, 'ready', '2026-02-01T00:00:00.000Z', 2506, 2506)").run(id);
}
const position = (userId, symbol) => {
  db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, 10, 10, 'EUR')").run(userId, symbol, symbol + " SA");
  return db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol).id;
};
const positions = { engie: position(alice, "ENGI.PA"), ishs: position(alice, "IWDA.AS"), asml: position(alice, "ASML.AS"), tte: position(alice, "TTE.PA"), ai: position(alice, "AI.PA"), lr: position(alice, "LR.PA"), bobEngie: position(bob, "ENGI.PA") };
const trade = (positionId, type, quantity, price, fees, tradedAt) => {
  db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, ?, ?, ?, ?, 'EUR', ?, 'pdf_avis_opere')").run(positionId, type, quantity, price, fees, tradedAt);
  return db.prepare("SELECT MAX(id) AS id FROM transactions").get().id;
};
const movement = (userId, type, cents, effectiveAt, extra = {}) => {
  db.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, position_id, symbol, source, import_ref, verification, verified_at, verification_ref) VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?)")
    .run(userId, type, cents, effectiveAt, extra.positionId ?? null, extra.symbol ?? null, extra.importRef ?? null, extra.verification ?? null, extra.verification ? effectiveAt : null, extra.verificationRef ?? null);
  return db.prepare("SELECT MAX(id) AS id FROM cash_movements").get().id;
};
const ids = {
  engieBuy: trade(positions.engie, "buy", 37, 26, 6.4, "2026-02-12T09:30:00.000Z"),
  ishsBuy: trade(positions.ishs, "buy", 167, 6.2, 3.7, "2026-02-12T09:45:00.000Z"),
  lrSell: trade(positions.lr, "sell", 12, 110, 7.5, "2026-03-16T10:00:00.000Z"),
  febDeposit: movement(alice, "deposit", 200000, "2026-02-12T08:00:00.000Z"),
  tteDividend: movement(alice, "dividend", 16496, "2026-03-05T12:00:00.000Z", { positionId: positions.tte, symbol: "TTE.PA" }),
  engieRefund: movement(alice, "capital_repayment", 5104, "2026-03-05T12:00:00.000Z", { positionId: positions.engie, symbol: "ENGI.PA", importRef: "statement:2026-03#R1", verification: "document", verificationRef: "2026-03#R1" }),
  strayDeposit: movement(alice, "deposit", 50000, "2026-03-20T12:00:00.000Z"),
  bobDeposit: movement(bob, "deposit", 200000, "2026-02-12T08:00:00.000Z")
};

const read = (name) => ({ fileName: name + ".pdf", statement: parseCashStatement(fs.readFileSync("test/fixtures/cash-statements/" + name + ".txt", "utf8")) });
const count = (userId = alice) => db.prepare("SELECT (SELECT COUNT(*) FROM cash_movements WHERE user_id = ?) + (SELECT COUNT(*) FROM transactions t JOIN positions p ON p.id = t.position_id WHERE p.user_id = ?) AS total").get(userId, userId).total;
const links = (userId = alice) => db.prepare("SELECT period || '#' || line_no AS key, transaction_id, movement_id, dividend_line_id FROM cash_statement_lines WHERE user_id = ? AND (transaction_id IS NOT NULL OR movement_id IS NOT NULL OR dividend_line_id IS NOT NULL) ORDER BY period, line_no").all(userId);
`;
