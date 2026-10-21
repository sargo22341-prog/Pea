import { isOtherCreditType, type CashLedgerDto, type OpeningDividendsEstimate, type OpeningDividendsWarning } from "@pea/shared";
import { db } from "../../db.js";
import { cashRepository } from "../../repositories/cash/cash.repository.js";
import { dividendProposalsRepository } from "../../repositories/cash/dividend-proposals.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { dividendsService } from "../market/dividends/dividends.service.js";
import { buildTransactionCache, dividendsReceivedFor } from "../portfolio/portfolio-calculations.js";
import { cashAccountService, type CashLedgerItem } from "./cash-account.service.js";
import { centsToMoney, entryTimeMs, moneyToCents, type ComputedLedgerEntry } from "./cash-ledger.js";
import { invalidateCashViews } from "./cash-movements.service.js";
import { estimateWithholding } from "./dividends/withholding-tax.js";

/** Écart toléré entre le calcul et les dividendes publiés : 25 % de l'estimation, au moins 50 €. */
export const OPENING_DIVIDENDS_MISMATCH_RATIO = 0.25;
export const OPENING_DIVIDENDS_MISMATCH_MIN_CENTS = 5_000;

export const openingDividendsUnavailableMessage = "Confirmez d'abord l'etat initial du compte especes.";

export interface OpeningDividendsInput {
  openingCashCents: number;
  openingDepositsCents: number;
  openingWithdrawalsCents: number;
  /** Opérations résumées par l'état initial (antérieures ou égales à la date de référence). */
  absorbed: readonly Pick<ComputedLedgerEntry, "kind" | "amountCents">[];
  /** Une opération résumée vient d'un import CSV de détentions (montant approché). */
  approximateTrades: boolean;
  publishedGrossCents: number;
  publishedNetCents: number;
}

export interface OpeningDividendsComputation {
  buysCents: number;
  sellsCents: number;
  feesCents: number;
  /** Remboursements de capital et indemnisations : des crédits qui ne sont pas des dividendes. */
  otherCreditsCents: number;
  impliedCents: number;
  warnings: OpeningDividendsWarning[];
}

/**
 * Le solde espèces à la date de référence vaut versements nets - achats + ventes - frais +
 * autres crédits + dividendes. Les dividendes perçus s'en déduisent : solde - versements nets +
 * achats - ventes + frais - autres crédits (remboursements de capital, indemnisations). Le calcul n'est juste que si toutes les opérations antérieures sont enregistrées : il est
 * recoupé avec les dividendes publiés et toujours soumis à confirmation.
 */
export function computeOpeningDividends(input: OpeningDividendsInput): OpeningDividendsComputation {
  const sum = (kind: string) => input.absorbed.filter((entry) => entry.kind === kind).reduce((total, entry) => total + entry.amountCents, 0);
  const buysCents = -sum("buy");
  const sellsCents = sum("sell");
  const feesCents = -sum("fee");
  const otherCreditsCents = input.absorbed.filter((entry) => isOtherCreditType(entry.kind)).reduce((total, entry) => total + entry.amountCents, 0);
  const netDepositsCents = input.openingDepositsCents - input.openingWithdrawalsCents;
  const impliedCents = input.openingCashCents - netDepositsCents + buysCents - sellsCents + feesCents - otherCreditsCents;

  const warnings: OpeningDividendsWarning[] = [];
  if (impliedCents < 0) warnings.push("negative");
  if (input.approximateTrades) warnings.push("approximate_trades");
  if (!input.absorbed.some((entry) => entry.kind === "buy" || entry.kind === "sell")) warnings.push("no_trades");
  const tolerance = Math.max(OPENING_DIVIDENDS_MISMATCH_MIN_CENTS, input.publishedNetCents * OPENING_DIVIDENDS_MISMATCH_RATIO);
  if (input.publishedNetCents > 0 && Math.abs(impliedCents - input.publishedNetCents) > tolerance) warnings.push("mismatch");
  return { buysCents, sellsCents, feesCents, otherCreditsCents, impliedCents, warnings };
}

/**
 * Recoupement : dividendes publiés × quantité détenue à chaque détachement jusqu'à la date de
 * référence, brut et net de la retenue estimée. Une position sans transaction datée est ignorée :
 * sa période de détention n'est pas connue.
 */
function publishedDividendsUntil(userId: number, referenceTime: number) {
  const positions = dividendProposalsRepository.listPositions(userId);
  const ids = positions.map((position) => position.id);
  const transactions = buildTransactionCache(ids);
  const isins = dividendProposalsRepository.latestIsins(ids);
  let grossCents = 0;
  let netCents = 0;
  for (const position of positions) {
    const entry = transactions.get(position.id);
    if (!entry?.hasDated) continue;
    const gross = moneyToCents(dividendsReceivedFor(position, dividendsService.readDividends(position.symbol), entry, referenceTime));
    const rate = estimateWithholding(position.isin ?? isins.get(position.id), position.symbol).rate;
    grossCents += gross;
    netCents += gross - Math.round(gross * rate);
  }
  return { grossCents, netCents };
}

function isApproximate(entry: ComputedLedgerEntry<CashLedgerItem>) {
  return entry.item?.origin === "trade" && entry.item.trade.source === "csv";
}

export const openingDividendsService = {
  estimate(userId: number): OpeningDividendsEstimate {
    const loaded = cashAccountService.load(userId);
    const { account } = loaded;
    if (account.status !== "ready" || account.reference_at === null) throw new HttpError(409, openingDividendsUnavailableMessage);
    const absorbed = loaded.result.entries.filter((entry) => entry.absorbed);
    const published = publishedDividendsUntil(userId, entryTimeMs(account.reference_at));
    const computed = computeOpeningDividends({
      openingCashCents: account.opening_cash_cents,
      openingDepositsCents: account.opening_deposits_cents,
      openingWithdrawalsCents: account.opening_withdrawals_cents,
      absorbed,
      approximateTrades: absorbed.some(isApproximate),
      publishedGrossCents: published.grossCents,
      publishedNetCents: published.netCents
    });
    return {
      referenceAt: account.reference_at,
      cash: centsToMoney(account.opening_cash_cents),
      netDeposits: centsToMoney(account.opening_deposits_cents - account.opening_withdrawals_cents),
      buys: centsToMoney(computed.buysCents),
      sells: centsToMoney(computed.sellsCents),
      standaloneFees: centsToMoney(computed.feesCents),
      otherCredits: centsToMoney(computed.otherCreditsCents),
      implied: centsToMoney(computed.impliedCents),
      publishedGross: centsToMoney(published.grossCents),
      publishedNet: centsToMoney(published.netCents),
      warnings: computed.warnings,
      declared: account.opening_dividends_cents === null ? undefined : centsToMoney(account.opening_dividends_cents)
    };
  },

  /** Confirme (ou efface avec `null`) le montant ; chaque changement est tracé comme l'état initial. */
  confirm(userId: number, amount: number | null): CashLedgerDto {
    db.transaction(() => {
      const previous = cashAccountService.ensureAccount(userId);
      if (previous.status !== "ready" || previous.reference_at === null) throw new HttpError(409, openingDividendsUnavailableMessage);
      cashRepository.setOpeningDividends(userId, amount === null ? null : moneyToCents(amount));
      const next = cashAccountService.ensureAccount(userId);
      cashRepository.insertRevision(userId, cashAccountService.settings(previous), cashAccountService.settings(next));
    });
    invalidateCashViews(userId);
    return cashAccountService.ledger(userId);
  }
};
