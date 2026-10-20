import type { DividendEvent } from "@pea/shared";
import { db } from "../../../db.js";
import { dividendProposalsRepository, type DividendMovementRow, type DividendProposalUpsert } from "../../../repositories/cash/dividend-proposals.repository.js";
import { dividendsService } from "../../market/dividends/dividends.service.js";
import { buildTransactionCache, getQuantityAtTime, type PositionTransactionCache } from "../../portfolio/portfolio-calculations.js";
import { cashAccountService } from "../cash-account.service.js";
import { isAbsorbed } from "../cash-ledger.js";
import { DIVIDEND_IMPORT_REF_PREFIX, dividendAmounts, dividendImportRef, isoDay, isSameDividendCredit, proposalNeedsReview, resolvePaymentDate } from "./dividend-proposal-rules.js";
import { estimateWithholding } from "./withholding-tax.js";

interface CandidateContext {
  position: { id: number; symbol: string; quantity: number };
  transactions: PositionTransactionCache | undefined;
  isin: string | undefined;
  paymentDates: readonly string[];
  referenceAt: string | undefined;
  now: number;
}

/** Quantité détenue à la date de détachement, avec la même règle que les dividendes estimés. */
function quantityAtExDate(context: CandidateContext, exTime: number) {
  return context.transactions?.hasDated ? getQuantityAtTime(context.transactions.transactions, exTime) : context.position.quantity;
}

/**
 * Proposition d'un détachement réel, ou `undefined` si elle n'a pas lieu d'être : détachement
 * futur, quantité nulle, dividende nul ou crédit daté avant l'état initial (déjà compris dans le
 * solde déclaré).
 */
export function proposalCandidate(context: CandidateContext, dividend: DividendEvent, nextDividend?: DividendEvent): DividendProposalUpsert | undefined {
  const exTime = Date.parse(dividend.date);
  if (!Number.isFinite(exTime) || exTime > context.now || !(dividend.amount > 0)) return undefined;
  const quantity = quantityAtExDate(context, exTime);
  if (!(quantity > 0)) return undefined;
  const exDividendAt = new Date(exTime).toISOString();
  const payment = resolvePaymentDate(exDividendAt, context.paymentDates, nextDividend?.date);
  if (isAbsorbed(payment.paymentAt, context.referenceAt)) return undefined;
  const withholding = estimateWithholding(context.isin, context.position.symbol);
  const amounts = dividendAmounts(dividend.amount, quantity, withholding.rate);
  return {
    positionId: context.position.id,
    symbol: context.position.symbol.toUpperCase(),
    exDate: isoDay(exDividendAt),
    exDividendAt,
    paymentAt: payment.paymentAt,
    paymentEstimated: payment.estimated,
    quantity,
    amountPerShare: dividend.amount,
    currency: dividend.currency,
    ...amounts,
    withholdingRate: withholding.rate,
    country: withholding.country,
    withholdingBasis: withholding.basis,
    needsReview: proposalNeedsReview(withholding, dividend.currency)
  };
}

/**
 * Un dividende déjà enregistré couvre-t-il ce versement ? Oui pour la même proposition déjà
 * validée (même référence), ou pour une saisie manuelle rapprochée (`isSameDividendCredit`).
 */
export function alreadyRecorded(candidate: Pick<DividendProposalUpsert, "symbol" | "exDate" | "paymentAt">, movements: readonly DividendMovementRow[]) {
  const ref = dividendImportRef(candidate.symbol, candidate.exDate);
  return movements.some((movement) => movement.import_ref === ref || (!movement.import_ref?.startsWith(DIVIDEND_IMPORT_REF_PREFIX) && isSameDividendCredit(
    { symbol: movement.symbol, effectiveAt: movement.effective_at },
    { symbol: candidate.symbol, effectiveAt: candidate.paymentAt }
  )));
}

/**
 * Génère les propositions d'un utilisateur à partir des données déjà stockées (détachements
 * Yahoo, calendrier, transactions) : aucun appel réseau. Idempotent : une ligne par actif et date
 * de détachement, rafraîchie tant qu'elle est en attente. Les propositions non validées devenues
 * sans objet (rapprochées d'une saisie manuelle, détachement disparu, quantité nulle) sont retirées.
 */
export function syncDividendProposals(userId: number, now = new Date()) {
  db.transaction(() => {
    const account = cashAccountService.ensureAccount(userId);
    if (account.status !== "ready") return;
    const positions = dividendProposalsRepository.listPositions(userId);
    const positionIds = positions.map((position) => position.id);
    const transactions = buildTransactionCache(positionIds);
    const isins = dividendProposalsRepository.latestIsins(positionIds);
    const paymentDates = dividendProposalsRepository.paymentDates(positions.map((position) => position.symbol));
    const movements = dividendProposalsRepository.dividendMovements(userId);
    const kept = new Set<string>();

    for (const position of positions) {
      const context: CandidateContext = {
        position,
        transactions: transactions.get(position.id),
        isin: position.isin ?? isins.get(position.id),
        paymentDates: paymentDates.get(position.symbol.toUpperCase()) ?? [],
        referenceAt: account.reference_at ?? undefined,
        now: now.getTime()
      };
      // Détachements triés par date : le suivant borne la date de paiement publiée de chacun.
      const dividends = dividendsService.readDividends(position.symbol);
      for (const [index, dividend] of dividends.entries()) {
        const candidate = proposalCandidate(context, dividend, dividends[index + 1]);
        if (!candidate || alreadyRecorded(candidate, movements)) continue;
        dividendProposalsRepository.upsert(userId, candidate);
        kept.add(`${candidate.symbol}:${candidate.exDate}`);
      }
    }

    for (const row of dividendProposalsRepository.listForUser(userId)) {
      if (row.status !== "accepted" && !kept.has(`${row.symbol}:${row.ex_date}`)) dividendProposalsRepository.deleteUndecided(userId, row.id);
    }
  });
}
