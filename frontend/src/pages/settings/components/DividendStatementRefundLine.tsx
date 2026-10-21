import type { DividendStatementRefundPreview } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { DividendVerificationBadge } from "../../../components/common/cash/verification/DividendVerificationBadge";
import { usePrivacy } from "../../../contexts/privacy-context";
import { cashMoney } from "../../../lib/cash/cash-format";
import { formatMaybeDate, formatNumber } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { isRefundApplicable, type LineChoice } from "../hooks/useDividendStatementsImport";

/**
 * Un remboursement de capital dans l'aperçu : rapprochement proposé et choix de l'utilisateur. Un
 * cas ambigu n'est appliqué qu'au remboursement enregistré choisi explicitement.
 */
export function DividendStatementRefundLine({ refund, choice, onChoose }: {
  refund: DividendStatementRefundPreview;
  choice: LineChoice | undefined;
  onChoose: (choice: LineChoice) => void;
}) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const money = (value: number) => masquerValeur(cashMoney(value), prive);
  const ambiguous = refund.case === "ambiguous";
  const label = t("statements.refundLine", { date: formatMaybeDate(refund.paymentDate), name: refund.name, isin: refund.isin, quantity: formatNumber(refund.quantity), amount: money(refund.amount) });

  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">{label}<DividendVerificationBadge verification={refund.movement?.verification} /></p>
          <p className={`text-xs ${ambiguous ? "text-amber" : "muted"}`}>{t(`statements.refundCases.${refund.case}`)}</p>
        </div>
        {isRefundApplicable(refund) ? (
          <div className="flex shrink-0 items-center gap-2">
            {ambiguous ? (
              <select
                aria-label={t("statements.chooseMovement")}
                className="input py-1 text-xs"
                onChange={(event) => { const id = Number(event.target.value); onChoose({ apply: id > 0, movementId: id > 0 ? id : undefined }); }}
                value={choice?.movementId ?? ""}
              >
                <option value="">{t("statements.noPosition")}</option>
                {refund.candidates?.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{t("statements.movementOption", { amount: money(candidate.amount), date: formatMaybeDate(candidate.effectiveAt) })}</option>
                ))}
              </select>
            ) : null}
            <label className="flex items-center gap-1 text-xs">
              <input checked={choice?.apply ?? false} disabled={ambiguous && !choice?.movementId} onChange={(event) => { onChoose({ ...choice, apply: event.target.checked }); }} type="checkbox" />
              {t("statements.apply")}
            </label>
          </div>
        ) : null}
      </div>
      {refund.beforeStart && refund.case !== "already_certified" ? <p className="muted text-xs">{t("statements.refundBeforeStart")}</p> : null}
      {refund.possibleDuplicate ? <p className="text-xs text-amber">{t("statements.refundDuplicate")}</p> : null}
    </li>
  );
}
