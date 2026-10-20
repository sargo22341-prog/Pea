import assert from "node:assert/strict";
import test from "node:test";
import type { DividendEvent } from "@pea/shared";
import {
  addBusinessDays,
  dividendAmounts,
  dividendImportRef,
  isSameDividendCredit,
  proposalNeedsReview,
  resolvePaymentDate
} from "../../services/cash/dividends/dividend-proposal-rules.js";
import { alreadyRecorded, proposalCandidate } from "../../services/cash/dividends/dividend-proposals-sync.js";
import { estimateWithholding, GERMANY_WITHHOLDING_RATE } from "../../services/cash/dividends/withholding-tax.js";
import { adjustTransactionsForSplits } from "../../services/portfolio/splits/split-adjustment.js";

const trade = (type: "buy" | "sell", tradedAt: string, quantity: number) => ({ type, quantity, price: 10, total_fees: 0, traded_at: tradedAt });
const dividend = (date: string, amount: number, currency = "EUR"): DividendEvent => ({ symbol: "AAA.PA", date, amount, currency, status: "real" });
const now = Date.parse("2026-10-20T12:00:00.000Z");

function context(transactions: ReturnType<typeof trade>[], overrides: { referenceAt?: string; isin?: string; paymentDates?: string[] } = {}) {
  return {
    position: { id: 1, symbol: "AAA.PA", quantity: 999 },
    transactions: { hasDated: transactions.length > 0, transactions },
    isin: overrides.isin,
    paymentDates: overrides.paymentDates ?? [],
    referenceAt: overrides.referenceAt,
    now
  };
}

test("montants : brut = dividende × quantité, net = brut - retenue, au centime", () => {
  assert.deepEqual(dividendAmounts(1.2345, 10, 0), { grossCents: 1235, withholdingCents: 0, netCents: 1235 });
  assert.deepEqual(dividendAmounts(2, 15, GERMANY_WITHHOLDING_RATE), { grossCents: 3000, withholdingCents: 791, netCents: 2209 });
  assert.deepEqual(dividendAmounts(0.5, 7, 0.15), { grossCents: 350, withholdingCents: 53, netCents: 297 });
});

test("retenue par pays : ISIN prioritaire, cotation à vérifier, pays inconnu à 0 %", () => {
  assert.deepEqual(estimateWithholding("FR0000120271", "TTE.PA"), { country: "FR", rate: 0, basis: "isin", needsReview: false });
  assert.deepEqual(estimateWithholding("NL0000235190", "AIR.PA"), { country: "NL", rate: 0.15, basis: "isin", needsReview: false });
  assert.equal(estimateWithholding("DE0007164600", "SAP.DE").rate, 0.26375);
  assert.equal(estimateWithholding("IT0003132476", "ENI.MI").rate, 0.26);
  assert.equal(estimateWithholding("ES0144580Y14", "IBE.MC").rate, 0.19);
  assert.equal(estimateWithholding("BE0974293251", "ABI.BR").rate, 0.3);
  assert.equal(estimateWithholding("IE00B4L5Y983", "IWDA.AS").needsReview, true, "les fonds irlandais sont souvent exonérés");
  assert.deepEqual(estimateWithholding(undefined, "AIR.PA"), { country: "FR", rate: 0, basis: "listing", needsReview: true });
  assert.deepEqual(estimateWithholding(undefined, "SAP.DE"), { country: "DE", rate: GERMANY_WITHHOLDING_RATE, basis: "listing", needsReview: true });
  assert.deepEqual(estimateWithholding("US0378331005", "AAPL"), { country: "US", rate: 0, basis: "isin", needsReview: true });
  assert.deepEqual(estimateWithholding("pas-un-isin", "XYZ"), { country: undefined, rate: 0, basis: "unknown", needsReview: true });
  assert.equal(proposalNeedsReview({ rate: 0, basis: "isin", needsReview: false, country: "FR" }, "USD"), true, "devise étrangère non convertie");
});

test("date de paiement : publiée si elle suit le détachement, sinon J+2 ouvrés", () => {
  assert.deepEqual(resolvePaymentDate("2026-05-14T07:00:00.000Z", ["2026-05-18T00:00:00.000Z"]), { paymentAt: "2026-05-18T00:00:00.000Z", estimated: false });
  assert.deepEqual(resolvePaymentDate("2026-05-14T07:00:00.000Z", ["2025-05-18T00:00:00.000Z", "2026-09-30T00:00:00.000Z"]), { paymentAt: "2026-05-18T07:00:00.000Z", estimated: true });
  // Jeudi + 2 jours ouvrés = lundi ; vendredi + 2 = mardi.
  assert.equal(addBusinessDays("2026-05-14T07:00:00.000Z", 2), "2026-05-18T07:00:00.000Z");
  assert.equal(addBusinessDays("2026-05-15T07:00:00.000Z", 2), "2026-05-19T07:00:00.000Z");
});

test("dividendes successifs : la date publiée du versement suivant n'est jamais reprise", () => {
  // Versement mensuel : seule la date de paiement de juin est publiée.
  const published = ["2026-06-17T00:00:00.000Z"];
  assert.deepEqual(resolvePaymentDate("2026-05-14T07:00:00.000Z", published, "2026-06-12T07:00:00.000Z"), { paymentAt: "2026-05-18T07:00:00.000Z", estimated: true });
  assert.deepEqual(resolvePaymentDate("2026-06-12T07:00:00.000Z", published), { paymentAt: "2026-06-17T00:00:00.000Z", estimated: false });

  const transactions = [trade("buy", "2026-01-10T10:00:00.000Z", 10), trade("sell", "2026-06-01T10:00:00.000Z", 4)];
  const may = proposalCandidate(context(transactions, { paymentDates: published }), dividend("2026-05-14T07:00:00.000Z", 1), dividend("2026-06-12T07:00:00.000Z", 1));
  const june = proposalCandidate(context(transactions, { paymentDates: published }), dividend("2026-06-12T07:00:00.000Z", 1));
  assert.deepEqual([may?.paymentAt, may?.quantity, june?.paymentAt, june?.quantity], ["2026-05-18T07:00:00.000Z", 10, "2026-06-17T00:00:00.000Z", 6], "chaque versement garde sa date et sa quantité");
});

test("quantité au détachement : une vente partielle antérieure est déduite, une vente postérieure non", () => {
  const transactions = [trade("buy", "2026-01-10T10:00:00.000Z", 10), trade("sell", "2026-03-01T10:00:00.000Z", 4), trade("sell", "2026-05-20T10:00:00.000Z", 6)];
  const candidate = proposalCandidate(context(transactions), dividend("2026-05-14T07:00:00.000Z", 1.5));
  assert.ok(candidate);
  assert.deepEqual({ quantity: candidate.quantity, grossCents: candidate.grossCents, exDate: candidate.exDate }, { quantity: 6, grossCents: 900, exDate: "2026-05-14" });
  assert.equal(proposalCandidate(context(transactions), dividend("2026-06-14T07:00:00.000Z", 1.5)), undefined, "quantité nulle : aucune proposition");
});

test("quantité au détachement après une division d'actions validée", () => {
  const transactions = adjustTransactionsForSplits([trade("buy", "2026-01-10T10:00:00.000Z", 3)], [{ date: "2026-03-01", numerator: 10, denominator: 1 }]);
  const candidate = proposalCandidate(context(transactions), dividend("2026-05-14T07:00:00.000Z", 0.1));
  assert.ok(candidate);
  assert.deepEqual({ quantity: candidate.quantity, grossCents: candidate.grossCents }, { quantity: 30, grossCents: 300 });
});

test("aucune proposition future, nulle, ou dont le crédit est résumé par l'état initial", () => {
  const transactions = [trade("buy", "2026-01-10T10:00:00.000Z", 10)];
  assert.equal(proposalCandidate(context(transactions), dividend("2026-11-01T07:00:00.000Z", 1)), undefined);
  assert.equal(proposalCandidate(context(transactions), dividend("2026-05-14T07:00:00.000Z", 0)), undefined);
  assert.equal(proposalCandidate(context(transactions, { referenceAt: "2026-05-18T07:00:00.000Z" }), dividend("2026-05-14T07:00:00.000Z", 1)), undefined);
  assert.ok(proposalCandidate(context(transactions, { referenceAt: "2026-05-15T00:00:00.000Z" }), dividend("2026-05-14T07:00:00.000Z", 1)), "payé après la référence");
});

test("rapprochement : même actif à moins de 10 jours, ou même référence d'import", () => {
  assert.equal(isSameDividendCredit({ symbol: "aaa.pa", effectiveAt: "2026-05-25T00:00:00.000Z" }, { symbol: "AAA.PA", effectiveAt: "2026-05-18T00:00:00.000Z" }), true);
  assert.equal(isSameDividendCredit({ symbol: "AAA.PA", effectiveAt: "2026-06-01T00:00:00.000Z" }, { symbol: "AAA.PA", effectiveAt: "2026-05-18T00:00:00.000Z" }), false);
  assert.equal(isSameDividendCredit({ symbol: null, effectiveAt: "2026-05-18T00:00:00.000Z" }, { symbol: "AAA.PA", effectiveAt: "2026-05-18T00:00:00.000Z" }), false);
  assert.equal(isSameDividendCredit({ symbol: "BBB.PA", effectiveAt: "2026-05-18T00:00:00.000Z" }, { symbol: "AAA.PA", effectiveAt: "2026-05-18T00:00:00.000Z" }), false);

  const candidate = { symbol: "AAA.PA", exDate: "2026-05-14", paymentAt: "2026-05-18T07:00:00.000Z" };
  assert.equal(dividendImportRef("aaa.pa", "2026-05-14"), "dividend:AAA.PA:2026-05-14");
  assert.equal(alreadyRecorded(candidate, [{ id: 1, symbol: "AAA.PA", effective_at: "2026-09-01T00:00:00.000Z", import_ref: "dividend:AAA.PA:2026-05-14" }]), true);
  assert.equal(alreadyRecorded(candidate, [{ id: 1, symbol: "AAA.PA", effective_at: "2026-05-20T00:00:00.000Z", import_ref: null }]), true);
  assert.equal(
    alreadyRecorded(candidate, [{ id: 1, symbol: "AAA.PA", effective_at: "2026-05-20T00:00:00.000Z", import_ref: "dividend:AAA.PA:2026-05-12" }]),
    false,
    "un autre dividende validé n'est pas rapproché par la date"
  );
});
