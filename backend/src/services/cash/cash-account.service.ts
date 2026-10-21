import type { CashAccountSettings, CashAccountSummary, CashLedgerDto, CashLedgerEntry, CashMovementSource, CashMovementType } from "@pea/shared";
import { PEA_DEPOSIT_CEILING_EUR } from "@pea/shared";
import { cashRepository, type CashAccountRow, type CashMovementRow, type CashTradeRow } from "../../repositories/cash/cash.repository.js";
import { hasCashStatements, loadCashChecks } from "./cash-statements/statement-coverage.js";
import { CASH_STATEMENT_IMPORT_REF_PREFIX } from "./cash-statements/statement-keys.js";
import { mergeStatementEntries, openingStatementEntries } from "./dividend-statements/opening-statement-lines.js";
import { verificationInfo } from "./dividends/dividend-verification.js";
import { centsToMoney, computeLedger, moneyToCents, tradeCashCents, type LedgerAccountState, type LedgerItem, type LedgerResult } from "./cash-ledger.js";
import { realizedGainsBySale } from "./realized-gains.js";

const movementSign: Record<CashMovementType, 1 | -1> = { deposit: 1, dividend: 1, capital_repayment: 1, compensation: 1, withdrawal: -1, fee: -1 };

export type CashLedgerItem = LedgerItem & ({ origin: "movement"; movement: CashMovementRow } | { origin: "trade"; trade: CashTradeRow });

export interface LoadedLedger {
  account: CashAccountRow;
  state: LedgerAccountState;
  result: LedgerResult<CashLedgerItem>;
  trades: CashTradeRow[];
}

function tradeSource(source: string | null): CashMovementSource {
  if (source === "pdf_avis_opere") return "pdf";
  if (source === "csv") return "csv";
  return "manual";
}

function movementItem(movement: CashMovementRow): CashLedgerItem {
  return {
    id: `movement:${movement.id}`,
    kind: movement.type,
    effectiveAt: movement.effective_at,
    amountCents: movementSign[movement.type] * movement.amount_cents,
    sequence: movement.id,
    source: movement.source,
    origin: "movement",
    movement
  };
}

function tradeItem(trade: CashTradeRow): CashLedgerItem {
  return {
    id: `transaction:${trade.id}`,
    kind: trade.type === "sell" ? "sell" : "buy",
    effectiveAt: trade.traded_at,
    amountCents: tradeCashCents(trade.type, trade.quantity, trade.price, trade.total_fees),
    sequence: trade.id,
    source: tradeSource(trade.source),
    origin: "trade",
    trade
  };
}

function ledgerState(account: CashAccountRow): LedgerAccountState {
  return {
    referenceAt: account.reference_at ?? undefined,
    openingCashCents: account.opening_cash_cents,
    openingDepositsCents: account.opening_deposits_cents,
    openingWithdrawalsCents: account.opening_withdrawals_cents,
    openingDividendsCents: account.opening_dividends_cents ?? undefined
  };
}

/**
 * Lecture du compte espèces : l'état initial, le journal rejoué et les indicateurs. Le solde n'est
 * jamais stocké : il est recalculé à chaque lecture depuis les mouvements et les transactions.
 */
export class CashAccountService {
  /**
   * Compte de l'utilisateur, créé à la première lecture : prêt (solde nul) s'il n'a encore aucune
   * transaction, sinon en attente de son état initial (versements historiques inconnus).
   */
  ensureAccount(userId: number): CashAccountRow {
    const existing = cashRepository.findAccount(userId);
    if (existing) return existing;
    cashRepository.insertAccountIfMissing(userId, cashRepository.userHasTransactions(userId) ? "pending" : "ready");
    const created = cashRepository.findAccount(userId);
    if (!created) throw new Error(`Compte especes introuvable pour l'utilisateur ${userId}.`);
    return created;
  }

  load(userId: number): LoadedLedger {
    const account = this.ensureAccount(userId);
    const state = ledgerState(account);
    const trades = cashRepository.listTrades(userId);
    const items = [...cashRepository.listMovements(userId).map(movementItem), ...trades.map(tradeItem)];
    return { account, state, result: computeLedger(state, items), trades };
  }

  settings(account: CashAccountRow): CashAccountSettings {
    return {
      status: account.status,
      referenceAt: account.reference_at ?? undefined,
      openedAt: account.opened_at ?? undefined,
      openingCash: centsToMoney(account.opening_cash_cents),
      openingDeposits: centsToMoney(account.opening_deposits_cents),
      openingWithdrawals: centsToMoney(account.opening_withdrawals_cents),
      openingDividends: account.opening_dividends_cents === null ? undefined : centsToMoney(account.opening_dividends_cents),
      openingDividendsCertifiedAt: account.opening_dividends_certified_at ?? undefined,
      fullHistoryAt: account.full_history_at ?? undefined,
      updatedAt: account.updated_at
    };
  }

  summarize(loaded: LoadedLedger, realizedGainCents = sumGains(realizedGainsBySale(loaded.trades))): CashAccountSummary {
    const { account, result } = loaded;
    const ceilingCents = moneyToCents(PEA_DEPOSIT_CEILING_EUR);
    return {
      status: account.status,
      referenceAt: account.reference_at ?? undefined,
      openedAt: account.opened_at ?? undefined,
      cash: centsToMoney(result.balanceCents),
      deposits: centsToMoney(result.depositsCents),
      withdrawals: centsToMoney(result.withdrawalsCents),
      netDeposits: centsToMoney(result.depositsCents - result.withdrawalsCents),
      cashDividends: centsToMoney(result.dividendsCents),
      otherCredits: centsToMoney(result.otherCreditsCents),
      standaloneFees: centsToMoney(result.feesCents),
      depositCeiling: PEA_DEPOSIT_CEILING_EUR,
      remainingCeiling: centsToMoney(Math.max(0, ceilingCents - result.depositsCents)),
      realizedGain: centsToMoney(realizedGainCents),
      historyIncomplete: account.status !== "ready" || account.reference_at !== null
    };
  }

  summary(userId: number): CashAccountSummary {
    return this.summarize(this.load(userId));
  }

  ledger(userId: number): CashLedgerDto {
    const loaded = this.load(userId);
    const gains = realizedGainsBySale(loaded.trades);
    const entries = loaded.result.entries.map((entry): CashLedgerEntry => {
      const base = {
        id: entry.id,
        kind: entry.kind,
        effectiveAt: entry.effectiveAt,
        amount: centsToMoney(entry.amountCents),
        balanceAfter: centsToMoney(entry.balanceAfterCents),
        absorbed: entry.absorbed
      };
      const item = entry.item;
      if (!item) return { ...base, source: "migration" };
      if (item.origin === "movement") {
        const source = item.movement.import_ref?.startsWith(CASH_STATEMENT_IMPORT_REF_PREFIX) ? "cash_statement" as const : item.source;
        return { ...base, source, symbol: item.movement.symbol ?? undefined, positionId: item.movement.position_id ?? undefined, importRef: item.movement.import_ref ?? undefined, note: item.movement.note ?? undefined, verification: verificationInfo(item.movement) };
      }
      const gain = gains.get(item.trade.id);
      return {
        ...base,
        source: item.source,
        symbol: item.trade.symbol,
        name: item.trade.name,
        positionId: item.trade.position_id,
        quantity: item.trade.quantity,
        price: item.trade.price,
        fees: item.trade.total_fees ?? 0,
        importRef: item.trade.import_ref ?? undefined,
        realizedGain: gain === undefined ? undefined : centsToMoney(gain)
      };
    });
    // Dividendes d'avant l'état initial certifiés par relevé : affichés, jamais rejoués ni comptés.
    const withStatementLines = mergeStatementEntries(entries, openingStatementEntries(userId, loaded.account.reference_at));
    const cashCheck = loadCashChecks(userId);
    const checked = withStatementLines.map((entry) => entry.kind === "opening" ? entry : { ...entry, cashCheck: cashCheck(entry.id, entry.kind, entry.effectiveAt) });
    return { summary: this.summarize(loaded, sumGains(gains)), settings: this.settings(loaded.account), cashStatementsImported: hasCashStatements(userId), entries: checked.reverse() };
  }
}

function sumGains(gains: Map<number, number>) {
  let total = 0;
  for (const gain of gains.values()) total += gain;
  return total;
}

export const cashAccountService = new CashAccountService();
