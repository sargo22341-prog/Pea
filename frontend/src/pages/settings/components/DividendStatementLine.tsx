import type { DividendStatementLinePreview, DividendStatementsPreviewDto } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { DividendVerificationBadge } from "../../../components/common/cash/verification/DividendVerificationBadge";
import { usePrivacy } from "../../../contexts/privacy-context";
import { cashMoney } from "../../../lib/cash/cash-format";
import { formatMaybeDate, formatNumber } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { isApplicable, type LineChoice } from "../hooks/useDividendStatementsImport";

const PERCENT = 100;

/** Une ligne de relevé dans l'aperçu : ce qui sera fait, et le choix de l'utilisateur. */
export function DividendStatementLine({ line, choice, positions, onChoose }: {
  line: DividendStatementLinePreview;
  choice: LineChoice | undefined;
  positions: DividendStatementsPreviewDto["positions"];
  onChoose: (choice: LineChoice) => void;
}) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const money = (value: number) => masquerValeur(cashMoney(value), prive);
  const label = t("statements.line", { date: formatMaybeDate(line.paymentDate), name: line.name, isin: line.isin, net: money(line.net) });
  const detail = t(`statements.cases.${line.case}`, { amount: money(line.movement?.amount ?? 0), date: formatMaybeDate(line.movement?.effectiveAt) });
  const unknown = line.case === "unknown_asset";

  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">{label}<DividendVerificationBadge verification={line.movement?.verification} /></p>
          <p className={`text-xs ${line.case === "mismatch" || unknown ? "text-amber" : "muted"}`}>{detail}</p>
        </div>
        {isApplicable(line) ? (
          <div className="flex shrink-0 items-center gap-2">
            {unknown ? (
              <select
                aria-label={t("statements.choosePosition")}
                className="input py-1 text-xs"
                onChange={(event) => { const id = Number(event.target.value); onChoose({ apply: id > 0, positionId: id > 0 ? id : undefined }); }}
                value={choice?.positionId ?? ""}
              >
                <option value="">{t("statements.noPosition")}</option>
                {positions.filter((position) => !position.isin).map((position) => <option key={position.id} value={position.id}>{position.symbol} · {position.name}</option>)}
              </select>
            ) : null}
            <label className="flex items-center gap-1 text-xs">
              <input checked={choice?.apply ?? false} disabled={unknown && !choice?.positionId} onChange={(event) => { onChoose({ ...choice, apply: event.target.checked }); }} type="checkbox" />
              {t("statements.apply")}
            </label>
          </div>
        ) : null}
      </div>
      {line.possibleDuplicate ? <p className="text-xs text-amber">{t("statements.possibleDuplicate")}</p> : null}
      {line.withholdingCheck?.notable ? (
        <p className="text-xs text-amber">{t("statements.withholdingGap", { actual: formatNumber(line.withholdingCheck.actualRate * PERCENT), estimated: formatNumber(line.withholdingCheck.estimatedRate * PERCENT) })}</p>
      ) : null}
    </li>
  );
}
