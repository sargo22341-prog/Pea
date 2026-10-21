import type { CashStatementCheck, CashStatementLineKind } from "@pea/shared";
import { cashStatementsRepository } from "../../../repositories/cash/cash-statements.repository.js";
import { parisDay } from "../dividend-statements/statement-reconciliation.js";
import { dayNumber, writeWindow } from "./matching/match-windows.js";
import { lineKey, linkedElementId } from "./statement-keys.js";

/**
 * Contrôle de chaque élément de l'application par les relevés espèces importés : vérifié (rapproché
 * d'une ligne), non retrouvé (toute la période où il aurait dû être écrit est couverte par des
 * relevés importés, mais aucune ligne ne lui correspond : doublon ou erreur probable) ou à
 * vérifier (aucun relevé importé pour cette période).
 *
 * Tant qu'aucun relevé espèces n'est importé, le suivi est manuel : aucun contrôle n'est renvoyé,
 * pour ne pas marquer « À vérifier » chaque opération d'un utilisateur qui saisit tout à la main.
 */

export type CashCheckLookup = (elementId: string, kind: CashStatementLineKind, effectiveAt: string) => CashStatementCheck | undefined;

const manualTracking: CashCheckLookup = () => undefined;

/** Au moins un relevé espèces importé : les opérations sont contrôlées par les relevés. */
export function hasCashStatements(userId: number) {
  return cashStatementsRepository.countStatements(userId) > 0;
}

export function loadCashChecks(userId: number): CashCheckLookup {
  if (!hasCashStatements(userId)) return manualTracking;
  const verified = new Map(cashStatementsRepository.listLines(userId).flatMap((row) => {
    const id = linkedElementId(row);
    return id ? [[id, { status: "verified", reference: lineKey(row.period, row.line_no), verifiedAt: row.matched_at ?? undefined } satisfies CashStatementCheck] as const] : [];
  }));
  // Un relevé couvre les jours qui suivent son ancien solde, jusqu'à son nouveau solde inclus.
  const covered = new Set(cashStatementsRepository.listStatements(userId).flatMap((statement) => {
    const days: number[] = [];
    for (let day = dayNumber(statement.opening_date) + 1; day <= dayNumber(statement.closing_date); day += 1) days.push(day);
    return days;
  }));

  return (elementId, kind, effectiveAt) => {
    const check = verified.get(elementId);
    if (check) return check;
    const window = writeWindow(kind);
    if (!window) return undefined;
    const day = dayNumber(parisDay(effectiveAt));
    for (let written = day - window.before; written <= day + window.after; written += 1) {
      if (!covered.has(written)) return { status: "to_verify" };
    }
    return { status: "not_found" };
  };
}
