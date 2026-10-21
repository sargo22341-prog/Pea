import type { CashStatementLinePreview, CashStatementTarget, CashStatementsPreviewDto } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../../contexts/privacy-context";
import { cashMoney, signedCashMoney } from "../../../../lib/cash/cash-format";
import { formatMaybeDate, formatNumber } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";
import { isActionable, type CashLineChoice } from "./useCashStatementsImport";

const ATTENTION_CASES = new Set<CashStatementLinePreview["case"]>(["ambiguous", "missing_trade", "missing_dividend"]);

function caseMessageKey(line: CashStatementLinePreview) {
  if (line.case === "create") return `cashStatements.create.${line.kind}`;
  return `cashStatements.cases.${line.case}`;
}

/**
 * Une ligne de relevé espèces dans l'aperçu : opération lue, rapprochement proposé et choix de
 * l'utilisateur. Une ligne ambiguë n'est rapprochée que de l'opération choisie ; un coupon à
 * créer attend sa position (le relevé espèces ne donne pas d'ISIN).
 */
export function CashStatementLine({ line, choice, positions, onChoose }: {
  line: CashStatementLinePreview;
  choice: CashLineChoice | undefined;
  positions: CashStatementsPreviewDto["positions"];
  onChoose: (choice: CashLineChoice) => void;
}) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const money = (value: number) => masquerValeur(cashMoney(value), prive);
  const kind = line.kind === "balance_transfer" ? t("cashStatements.balanceTransfer") : t(`kinds.${line.kind}`);
  const security = [line.quantity ? formatNumber(line.quantity) : "", line.name ?? ""].filter(Boolean).join(" ");
  const targetLabel = (target: CashStatementTarget) => t("cashStatements.targetOption", { kind: t(`kinds.${target.kind}`), symbol: target.symbol ?? "", date: formatMaybeDate(target.effectiveAt), amount: money(Math.abs(target.amount)) });
  const ambiguous = line.case === "ambiguous";
  const needsPosition = line.case === "create" && line.kind === "dividend";
  const ready = (ambiguous ? Boolean(choice?.targetId) : true) && (needsPosition ? Boolean(choice?.positionId) : true);

  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">
            {formatMaybeDate(line.operationDate)} · {kind}{security ? ` · ${security}` : ""} · <span className={line.amount >= 0 ? "text-mint" : "text-coral"}>{masquerValeur(signedCashMoney(line.amount), prive)}</span>
          </p>
          <p className={`text-xs ${ATTENTION_CASES.has(line.case) ? "text-amber" : "muted"}`}>{t(caseMessageKey(line))}</p>
          {line.target && line.case === "verify" ? <p className="muted text-xs">{targetLabel(line.target)}</p> : null}
        </div>
        {isActionable(line) ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {ambiguous ? (
              <select aria-label={t("cashStatements.chooseTarget")} className="input py-1 text-xs" onChange={(event) => { onChoose({ apply: Boolean(event.target.value), targetId: event.target.value || undefined }); }} value={choice?.targetId ?? ""}>
                <option value="">{t("statements.noPosition")}</option>
                {line.candidates?.map((candidate) => <option key={candidate.id} value={candidate.id}>{targetLabel(candidate)}</option>)}
              </select>
            ) : null}
            {needsPosition ? (
              <select aria-label={t("statements.choosePosition")} className="input py-1 text-xs" onChange={(event) => { const id = Number(event.target.value); onChoose({ apply: id > 0, positionId: id > 0 ? id : undefined }); }} value={choice?.positionId ?? ""}>
                <option value="">{t("statements.noPosition")}</option>
                {positions.map((position) => <option key={position.id} value={position.id}>{position.symbol} · {position.name}</option>)}
              </select>
            ) : null}
            <label className="flex items-center gap-1 text-xs">
              <input checked={choice?.apply ?? false} disabled={!ready} onChange={(event) => { onChoose({ ...choice, apply: event.target.checked }); }} type="checkbox" />
              {t("statements.apply")}
            </label>
          </div>
        ) : null}
      </div>
      {line.beforeStart && line.case !== "opening" && line.case !== "missing_dividend" ? <p className="muted text-xs">{t("cashStatements.beforeStart")}</p> : null}
    </li>
  );
}
