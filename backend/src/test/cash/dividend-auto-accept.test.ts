import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

interface Proposal { symbol: string; status: string; autoAccepted: boolean; notificationRead: boolean; netAmount: number; creditedAmount?: number }

interface AutoResult {
  disabled: { pending: string[]; movements: number };
  afterTick: { pending: string[]; recent: Proposal[]; unread: number; cashDividends: number };
  eventsAfterFirstTick: number;
  eventsAfterSecondTick: number;
  unreadAfterRead: number;
  corrected: { amount: number; effectiveAt: string; unread: number };
  refusedCorrection: { status: number; amountCents: number };
  pendingCorrection: number;
  afterIsin: { pending: string[]; air?: Proposal };
  invalidIsin: number;
  foreignIsin: number;
  bobMovements: number;
}

test("ajout automatique : seuls les dividendes sûrs sont crédités, notifiés et corrigeables", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { dividendProposalsService } = await import("./services/cash/dividends/dividend-proposals.service.ts");
    const { dividendsRepository } = await import("./repositories/market/dividends.repository.ts");
    const { dividendProposalsScheduler } = await import("./schedulers/dividend-proposals-scheduler.service.ts");
    const { marketEventsService } = await import("./services/market/events/market-events.service.ts");
    const { positionIsinService } = await import("./services/portfolio/holdings/position-isin.service.ts");
    const { cashAccountService } = await import("./services/cash/cash-account.service.ts");
    const now = new Date("2026-10-20T12:00:00.000Z");
    const events = [];
    marketEventsService.emitToUser = (userId, type) => { events.push({ userId, type }); };

    const user = (name) => { db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'hash')").run(name); return db.prepare("SELECT id FROM users WHERE username = ?").get(name).id; };
    const alice = user("alice");
    const bob = user("bob");
    db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at, opening_cash_cents, opening_deposits_cents) VALUES (?, 'ready', '2026-03-01T00:00:00.000Z', 10000, 10000), (?, 'ready', '2026-03-01T00:00:00.000Z', 0, 0)").run(alice, bob);
    const holding = (userId, symbol, quantity, isin) => {
      if (!db.prepare("SELECT 1 FROM assets WHERE symbol = ?").get(symbol)) {
        db.prepare("INSERT INTO assets (symbol, name, currency) VALUES (?, ?, 'EUR')").run(symbol, symbol);
        dividendsRepository.upsert(db.prepare("SELECT id FROM assets WHERE symbol = ?").get(symbol).id, { date: "2026-05-14T07:00:00.000Z", amount: symbol === "TTE.PA" ? 1 : 2, currency: "EUR" });
      }
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, ?, 0, 'EUR')").run(userId, symbol, symbol, quantity);
      const id = db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol).id;
      db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, isin) VALUES (?, 'buy', ?, 0, 0, 'EUR', '2026-01-10T10:00:00.000Z', ?)").run(id, quantity, isin);
      return id;
    };
    const tte = holding(alice, "TTE.PA", 10, "FR0000120271");
    const air = holding(alice, "AIR.PA", 5, null);
    holding(bob, "TTE.PA", 10, "FR0000120271");
    const movements = (userId) => db.prepare("SELECT COUNT(*) AS total FROM cash_movements WHERE user_id = ?").get(userId).total;
    const symbols = (list) => list.map((proposal) => proposal.symbol).sort();
    const status = (action) => { try { action(); return 0; } catch (error) { return error.status; } };

    const off = dividendProposalsService.list(alice, now);
    const disabled = { pending: symbols(off.pending), movements: movements(alice) };

    dividendProposalsService.updateSettings(alice, { autoAccept: true });
    dividendProposalsScheduler.tick(now);
    const ticked = dividendProposalsService.read(alice, now);
    const afterTick = { pending: symbols(ticked.pending), recent: ticked.recent, unread: ticked.unreadAutoAccepted, cashDividends: cashAccountService.summary(alice).cashDividends };
    const eventsAfterFirstTick = events.filter((event) => event.userId === alice).length;
    dividendProposalsScheduler.tick(now);
    const eventsAfterSecondTick = events.filter((event) => event.userId === alice).length;
    const unreadAfterRead = dividendProposalsService.markNotificationsRead(alice, now).unreadAutoAccepted;

    // Un achat de juin consomme les espèces : réduire trop le dividende découvrirait le compte.
    db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at) VALUES (?, 'buy', 1, 105, 0, 'EUR', '2026-06-01T10:00:00.000Z')").run(tte);
    const tteId = ticked.recent[0].id;
    dividendProposalsService.updateSettings(alice, { autoAccept: false });
    dividendProposalsService.markNotificationsRead(alice, now);
    db.prepare("UPDATE cash_dividend_proposals SET notification_read_at = NULL WHERE id = ?").run(tteId);
    const correction = dividendProposalsService.correct(alice, tteId, { amount: 9.5, effectiveAt: "2026-05-20T09:00:00.000Z" }, now);
    const movement = () => db.prepare("SELECT amount_cents, effective_at FROM cash_movements WHERE user_id = ? AND symbol = 'TTE.PA'").get(alice);
    const corrected = { amount: correction.ledger.summary.cashDividends, effectiveAt: movement().effective_at, unread: correction.proposals.unreadAutoAccepted };
    const refusedStatus = status(() => dividendProposalsService.correct(alice, tteId, { amount: 1 }, now));
    const refusedCorrection = { status: refusedStatus, amountCents: movement().amount_cents };
    const airId = dividendProposalsService.read(alice, now).pending[0].id;
    const pendingCorrection = status(() => dividendProposalsService.correct(alice, airId, { amount: 1 }, now));

    dividendProposalsService.updateSettings(alice, { autoAccept: true });
    positionIsinService.set(alice, air, " nl0000235190 ");
    const withIsin = dividendProposalsService.list(alice, now);
    const afterIsin = { pending: symbols(withIsin.pending), air: withIsin.recent.find((proposal) => proposal.symbol === "AIR.PA") };
    const invalidIsin = status(() => positionIsinService.set(alice, air, "NL0000235191"));
    const foreignIsin = status(() => positionIsinService.set(bob, air, "NL0000235190"));

    console.log("__RESULT__" + JSON.stringify({
      disabled, afterTick, eventsAfterFirstTick, eventsAfterSecondTick, unreadAfterRead, corrected, refusedCorrection, pendingCorrection,
      afterIsin, invalidIsin, foreignIsin, bobMovements: movements(bob)
    }));
  `) as AutoResult;

  assert.deepEqual(result.disabled, { pending: ["AIR.PA", "TTE.PA"], movements: 0 }, "désactivé par défaut : rien n'est crédité");
  assert.deepEqual(result.afterTick.pending, ["AIR.PA"], "sans ISIN, Airbus reste à confirmer");
  assert.equal(result.afterTick.recent.length, 1);
  assert.deepEqual(
    { symbol: result.afterTick.recent[0]?.symbol, auto: result.afterTick.recent[0]?.autoAccepted, read: result.afterTick.recent[0]?.notificationRead, credited: result.afterTick.recent[0]?.creditedAmount },
    { symbol: "TTE.PA", auto: true, read: false, credited: 10 }
  );
  assert.equal(result.afterTick.unread, 1);
  assert.equal(result.afterTick.cashDividends, 10);
  assert.equal(result.eventsAfterFirstTick, 1, "la tâche horaire notifie l'utilisateur sans connexion");
  assert.equal(result.eventsAfterSecondTick, 1, "aucune nouvelle notification sans changement");
  assert.equal(result.unreadAfterRead, 0);

  assert.deepEqual(result.corrected, { amount: 9.5, effectiveAt: "2026-05-20T09:00:00.000Z", unread: 0 }, "la correction modifie le mouvement et lit la notification");
  assert.deepEqual(result.refusedCorrection, { status: 422, amountCents: 950 }, "une correction qui découvrirait le compte est refusée");
  assert.equal(result.pendingCorrection, 409, "seul un dividende enregistré se corrige");

  assert.deepEqual(result.afterIsin.pending, [], "l'ISIN saisi rend le dividende sûr");
  assert.deepEqual({ auto: result.afterIsin.air?.autoAccepted, net: result.afterIsin.air?.netAmount }, { auto: true, net: 8.5 }, "retenue néerlandaise de 15 % sur 10 €");
  assert.equal(result.invalidIsin, 400);
  assert.equal(result.foreignIsin, 404);
  assert.equal(result.bobMovements, 0, "l'ajout automatique est un réglage par utilisateur");
});
