import type { PeaOverview } from "@pea/shared";
import { cashAccountService } from "./cash-account.service.js";
import { centsToMoney, entryTimeMs, moneyToCents } from "./cash-ledger.js";
import { xirr, type DatedCashFlow } from "./xirr.js";

/** Durée minimale des flux pour annualiser un rendement : en deçà, le taux annuel serait trompeur. */
const minimumAnnualizationSpanMs = 90 * 24 * 60 * 60 * 1000;

/**
 * Vue d'ensemble du PEA. Les plus-values réalisées sont déjà dans le solde espèces (produit des
 * ventes) : le gain global ne les ajoute pas une seconde fois.
 *
 * - Valeur PEA = valeur des positions + solde espèces
 * - Gain global = valeur PEA + retraits cumulés - versements cumulés
 * - Rendement annualisé : XIRR des seuls flux externes (versements, retraits, valeur finale),
 *   calculé uniquement si le journal est complet depuis l'ouverture (sans état initial).
 */
export function peaOverview(userId: number, positionsValue: number, positionsCost: number, now = new Date()): PeaOverview {
  const loaded = cashAccountService.load(userId);
  const summary = cashAccountService.summarize(loaded);
  const { result } = loaded;
  const positionsValueCents = moneyToCents(positionsValue);
  const totalValueCents = positionsValueCents + result.balanceCents;
  const netDepositsCents = result.depositsCents - result.withdrawalsCents;
  const globalGainCents = totalValueCents + result.withdrawalsCents - result.depositsCents;
  const ready = summary.status === "ready";

  return {
    ...summary,
    positionsValue: centsToMoney(positionsValueCents),
    totalValue: centsToMoney(totalValueCents),
    latentGain: centsToMoney(positionsValueCents - moneyToCents(positionsCost)),
    globalGain: centsToMoney(globalGainCents),
    simpleReturnPercent: ready && netDepositsCents > 0 ? (globalGainCents / netDepositsCents) * 100 : undefined,
    annualizedReturnPercent: ready && !summary.historyIncomplete ? annualizedReturn(loaded.result.entries, totalValueCents, now) : undefined
  };
}

function annualizedReturn(entries: { kind: string; effectiveAt: string; amountCents: number }[], totalValueCents: number, now: Date) {
  const flows: DatedCashFlow[] = entries
    .filter((entry) => entry.kind === "deposit" || entry.kind === "withdrawal")
    .map((entry) => ({ timeMs: entryTimeMs(entry.effectiveAt), amount: -entry.amountCents }));
  flows.push({ timeMs: now.getTime(), amount: totalValueCents });
  const rate = xirr(flows, minimumAnnualizationSpanMs);
  return rate === undefined ? undefined : rate * 100;
}
