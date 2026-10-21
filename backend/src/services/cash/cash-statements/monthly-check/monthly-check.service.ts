import { CASH_MONTH_CHECK_STATUSES, type CashAccountCheckDto, type CashMonthCheckStatus } from "@pea/shared";
import { cashStatementsRepository } from "../../../../repositories/cash/cash-statements.repository.js";
import { cashAccountService } from "../../cash-account.service.js";
import { isAbsorbed } from "../../cash-ledger.js";
import { parisDay } from "../../dividend-statements/statement-reconciliation.js";
import { createdEffectiveAt } from "../statement-context.js";
import { linkedElementId } from "../statement-keys.js";
import { previousPeriod } from "./month-periods.js";
import { buildMonthlyCheck, type MonthlyCheckItem } from "./monthly-check.js";

/**
 * Contrôle mensuel du compte de l'utilisateur. La date d'écriture d'une opération rapprochée est
 * celle de sa ligne de relevé, enregistrée au rapprochement (`cash_statement_lines`).
 */
export function monthlyCheck(userId: number, now = new Date()): CashAccountCheckDto {
  const loaded = cashAccountService.load(userId);
  const counts = Object.fromEntries(CASH_MONTH_CHECK_STATUSES.map((status) => [status, 0])) as Record<CashMonthCheckStatus, number>;
  // Compte non configuré : aucun relevé n'a pu être importé ni comparé.
  if (loaded.account.status !== "ready") return { months: [], counts };

  const referenceAt = loaded.account.reference_at ?? undefined;
  const lines = cashStatementsRepository.listLines(userId);
  const writtenOn = new Map(lines.flatMap((row) => {
    const id = linkedElementId(row);
    return id ? [[id, row.operation_date] as const] : [];
  }));
  const certifiedMovements = new Set(loaded.result.entries.flatMap((entry) => entry.item?.origin === "movement" && entry.item.movement.verification === "document" ? [entry.id] : []));

  const items = loaded.result.entries.flatMap((entry): MonthlyCheckItem[] => {
    const item = entry.item;
    if (!item) return [];
    const written = writtenOn.get(item.id);
    const label = item.origin === "trade" ? item.trade.symbol : item.movement.symbol ?? undefined;
    return [{ id: item.id, kind: item.kind, accountingDay: written ?? parisDay(item.effectiveAt), amountCents: item.amountCents, absorbed: entry.absorbed, linked: written !== undefined, label }];
  });

  const months = buildMonthlyCheck({
    referenceDay: referenceAt === undefined ? undefined : parisDay(referenceAt),
    openingCashCents: loaded.account.opening_cash_cents,
    items,
    statements: cashStatementsRepository.listStatements(userId).map((row) => ({ period: row.period, openingDate: row.opening_date, closingDate: row.closing_date, openingCents: row.opening_cents, closingCents: row.closing_cents })),
    lines: lines.map((row) => {
      const id = linkedElementId(row);
      return {
        period: row.period,
        lineNo: row.line_no,
        operationDate: row.operation_date,
        kind: row.kind,
        amountCents: row.amount_cents,
        name: row.name ?? undefined,
        linked: id !== undefined,
        certified: row.dividend_line_id !== null || (id !== undefined && certifiedMovements.has(id)),
        beforeStart: isAbsorbed(createdEffectiveAt({ kind: row.kind, operationDate: row.operation_date, couponDate: row.coupon_date ?? undefined }), referenceAt)
      };
    }),
    lastPeriod: previousPeriod(parisDay(now.toISOString()).slice(0, 7))
  });
  for (const month of months) counts[month.status] += 1;
  return { months, counts };
}
