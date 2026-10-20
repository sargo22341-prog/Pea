import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

interface ProposalView { id: number; symbol: string; quantity: number; grossAmount: number; netAmount: number; paymentEstimated: boolean; needsReview: boolean }
interface Listing { pending: ProposalView[]; ignored: ProposalView[]; cash: number }

interface ServiceResult {
  first: Listing;
  rowsAfterRepeat: number;
  afterYahooRefresh: Listing;
  bobPending: Listing;
  bobRows: number;
  atomicError: string;
  movementsAfterAtomicFailure: number;
  statusAfterAtomicFailure: string;
  accepted: { status: string; movementRef: string; cash: number; cashDividends: number; deposits: number; remainingCeiling: number };
  secondAccept: { status: number; message: string };
  manualDuplicate: { status: number };
  duplicateInsertRejected: boolean;
  ignored: Listing;
  ignoredAfterSync: Listing;
  restored: Listing;
  afterMovementDeletion: string;
}

test("propositions de dividendes : génération idempotente, validation atomique et sans double comptage", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { dividendProposalsService } = await import("./services/cash/dividends/dividend-proposals.service.ts");
    const { dividendProposalsRepository } = await import("./repositories/cash/dividend-proposals.repository.ts");
    const { dividendsRepository } = await import("./repositories/market/dividends.repository.ts");
    const { cashMovementsService } = await import("./services/cash/cash-movements.service.ts");
    const { cashAccountService } = await import("./services/cash/cash-account.service.ts");
    const now = new Date("2026-10-20T12:00:00.000Z");

    const user = (name) => { db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'hash')").run(name); return db.prepare("SELECT id FROM users WHERE username = ?").get(name).id; };
    const alice = user("alice");
    const bob = user("bob");
    db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at, opening_cash_cents, opening_deposits_cents) VALUES (?, 'ready', '2026-03-01T00:00:00.000Z', 10000, 10000)").run(alice);
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'pending')").run(bob);
    const asset = (symbol) => { db.prepare("INSERT INTO assets (symbol, name, currency) VALUES (?, ?, 'EUR')").run(symbol, symbol + " SA"); return db.prepare("SELECT id FROM assets WHERE symbol = ?").get(symbol).id; };
    const position = (userId, symbol, quantity) => { db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, ?, 10, 'EUR')").run(userId, symbol, symbol + " SA", quantity); return db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol).id; };
    const trade = (positionId, type, quantity, tradedAt) => db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at) VALUES (?, ?, ?, 10, 0, 'EUR', ?)").run(positionId, type, quantity, tradedAt);
    const aaa = asset("AAA.PA");
    const bbb = asset("BBB.PA");
    const ccc = asset("CCC.PA");
    dividendsRepository.upsert(aaa, { date: "2026-02-10T07:00:00.000Z", amount: 1, currency: "EUR" });
    dividendsRepository.upsert(aaa, { date: "2026-05-14T07:00:00.000Z", amount: 1.5, currency: "EUR" });
    dividendsRepository.upsert(aaa, { date: "2026-08-14T07:00:00.000Z", amount: 0.5, currency: "EUR" });
    dividendsRepository.upsert(bbb, { date: "2026-06-10T07:00:00.000Z", amount: 1, currency: "EUR" });
    dividendsRepository.upsert(ccc, { date: "2026-09-10T07:00:00.000Z", amount: 2, currency: "EUR" });

    const aliceAaa = position(alice, "AAA.PA", 0);
    trade(aliceAaa, "buy", 10, "2026-01-10T10:00:00.000Z");
    trade(aliceAaa, "sell", 10, "2026-07-01T10:00:00.000Z");
    trade(position(alice, "BBB.PA", 5), "buy", 5, "2026-01-10T10:00:00.000Z");
    trade(position(alice, "CCC.PA", 1), "buy", 1, "2026-01-10T10:00:00.000Z");
    trade(position(bob, "AAA.PA", 10), "buy", 10, "2026-01-10T10:00:00.000Z");
    // Dividende BBB déjà saisi à la main, crédité quelques jours après le paiement estimé.
    db.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, symbol, source) VALUES (?, 'dividend', 500, '2026-06-16T09:00:00.000Z', 'BBB.PA', 'manual')").run(alice);

    const rows = (userId) => db.prepare("SELECT COUNT(*) AS total FROM cash_dividend_proposals WHERE user_id = ?").get(userId).total;
    const movements = () => db.prepare("SELECT COUNT(*) AS total FROM cash_movements WHERE user_id = ? AND type = 'dividend'").get(alice).total;
    const status = (symbol) => db.prepare("SELECT status FROM cash_dividend_proposals WHERE user_id = ? AND symbol = ?").get(alice, symbol)?.status ?? "absent";
    const httpFailure = (action) => { try { action(); return { status: 0, message: "" }; } catch (error) { return { status: error.status, message: error.message }; } };

    const first = dividendProposalsService.list(alice, now);
    dividendProposalsService.list(alice, now);
    dividendProposalsService.list(alice, now);
    const rowsAfterRepeat = rows(alice);
    dividendsRepository.upsert(aaa, { date: "2026-05-14T07:00:00.000Z", amount: 1.6, currency: "EUR" });
    const afterYahooRefresh = dividendProposalsService.list(alice, now);
    const bobPending = dividendProposalsService.list(bob, now);
    const bobRows = rows(bob);

    const aaaId = afterYahooRefresh.pending.find((proposal) => proposal.symbol === "AAA.PA").id;
    const changeStatus = dividendProposalsRepository.changeStatus;
    dividendProposalsRepository.changeStatus = () => { throw new Error("panne simulee"); };
    let atomicError = "";
    try { dividendProposalsService.accept(alice, aaaId, {}, now); } catch (error) { atomicError = error.message; }
    dividendProposalsRepository.changeStatus = changeStatus;
    const movementsAfterAtomicFailure = movements();
    const statusAfterAtomicFailure = status("AAA.PA");

    const decision = dividendProposalsService.accept(alice, aaaId, {}, now);
    const movement = db.prepare("SELECT * FROM cash_movements WHERE user_id = ? AND symbol = 'AAA.PA'").get(alice);
    const accepted = { status: status("AAA.PA"), movementRef: movement.import_ref + "|" + movement.amount_cents + "|" + movement.effective_at + "|" + movement.position_id, cash: decision.ledger.summary.cash, cashDividends: decision.ledger.summary.cashDividends, deposits: decision.ledger.summary.deposits, remainingCeiling: decision.ledger.summary.remainingCeiling };
    const secondAccept = httpFailure(() => dividendProposalsService.accept(alice, aaaId, {}, now));
    const manualDuplicate = httpFailure(() => cashMovementsService.create(alice, { type: "dividend", amount: 16, effectiveAt: "2026-05-20T09:00:00.000Z", positionId: aliceAaa }));
    let duplicateInsertRejected = false;
    try { db.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, symbol, source, import_ref) VALUES (?, 'dividend', 1, '2026-05-20T00:00:00.000Z', 'AAA.PA', 'manual', ?)").run(alice, movement.import_ref); } catch { duplicateInsertRejected = true; }

    const cccId = afterYahooRefresh.pending.find((proposal) => proposal.symbol === "CCC.PA").id;
    const ignored = dividendProposalsService.ignore(alice, cccId, now);
    const ignoredAfterSync = dividendProposalsService.list(alice, now);
    const restored = dividendProposalsService.restore(alice, cccId, now);

    cashMovementsService.delete(alice, movement.id);
    const afterMovementDeletion = status("AAA.PA");

    console.log("__RESULT__" + JSON.stringify({
      first, rowsAfterRepeat, afterYahooRefresh, bobPending, bobRows, atomicError, movementsAfterAtomicFailure, statusAfterAtomicFailure,
      accepted, secondAccept, manualDuplicate: { status: manualDuplicate.status }, duplicateInsertRejected, ignored, ignoredAfterSync, restored, afterMovementDeletion
    }));
  `) as ServiceResult;

  // Avant la référence (février), quantité nulle (août) et BBB rapproché de la saisie : rien.
  assert.deepEqual(result.first.pending.map((proposal) => proposal.symbol).sort(), ["AAA.PA", "CCC.PA"]);
  const aaa = result.first.pending.find((proposal) => proposal.symbol === "AAA.PA");
  assert.deepEqual(aaa && { quantity: aaa.quantity, gross: aaa.grossAmount, net: aaa.netAmount, estimated: aaa.paymentEstimated, review: aaa.needsReview }, { quantity: 10, gross: 15, net: 15, estimated: true, review: true });
  assert.equal(result.rowsAfterRepeat, 2, "une seule ligne par actif et détachement");
  assert.equal(result.afterYahooRefresh.pending.find((proposal) => proposal.symbol === "AAA.PA")?.grossAmount, 16, "une proposition en attente suit la donnée rafraîchie");
  assert.deepEqual(result.bobPending.pending, []);
  assert.equal(result.bobRows, 0, "aucune proposition pour un compte en attente d'état initial");

  assert.equal(result.atomicError, "panne simulee");
  assert.equal(result.movementsAfterAtomicFailure, 1, "le mouvement est annulé avec le changement de statut");
  assert.equal(result.statusAfterAtomicFailure, "pending");

  assert.equal(result.accepted.status, "accepted");
  assert.match(result.accepted.movementRef, /^dividend:AAA\.PA:2026-05-14\|1600\|2026-05-18T07:00:00\.000Z\|\d+$/);
  // Solde : état initial 100 + vente de juillet 100 + dividendes 16 (AAA) et 5 (BBB, saisi).
  assert.deepEqual({ cash: result.accepted.cash, dividends: result.accepted.cashDividends, deposits: result.accepted.deposits, ceiling: result.accepted.remainingCeiling }, { cash: 221, dividends: 21, deposits: 100, ceiling: 149_900 }, "un dividende crédite les espèces sans compter comme versement");
  assert.equal(result.secondAccept.status, 409);
  assert.equal(result.manualDuplicate.status, 409, "une saisie manuelle rapprochée d'un dividende validé est refusée");
  assert.equal(result.duplicateInsertRejected, true, "la référence d'import est unique");

  assert.deepEqual(result.ignored.pending.map((proposal) => proposal.symbol), []);
  assert.deepEqual(result.ignoredAfterSync.ignored.map((proposal) => proposal.symbol), ["CCC.PA"], "une nouvelle génération ne réactive pas une proposition ignorée");
  assert.deepEqual(result.restored.pending.map((proposal) => proposal.symbol), ["CCC.PA"]);
  assert.equal(result.afterMovementDeletion, "pending", "supprimer le dividende validé remet la proposition en attente");
});
