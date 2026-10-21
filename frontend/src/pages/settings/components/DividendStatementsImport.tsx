import { DIVIDEND_STATEMENT_CASES, type DividendStatementPreview, type OpeningDividendsCertification } from "@pea/shared";
import { BadgeCheck, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InfoHint } from "../../../components/common/disclosure/InfoHint";
import { usePrivacy } from "../../../contexts/privacy-context";
import { cashMoney, signedCashMoney } from "../../../lib/cash/cash-format";
import { formatStatementPeriod } from "../../../lib/cash/ledger-entry";
import { formatMaybeDate } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { useDividendStatementsImport, type DividendStatementsImportState } from "../hooks/useDividendStatementsImport";
import { DividendStatementLine } from "./DividendStatementLine";
import { DividendStatementRefundLine } from "./DividendStatementRefundLine";

function StatementCard({ statement, state }: { statement: DividendStatementPreview; state: DividendStatementsImportState }) {
  const { t } = useTranslation("cash");
  const positions = state.preview?.positions ?? [];
  return (
    <div className={`rounded-md border p-3 ${statement.error ? "border-coral/60 bg-coral/5" : "border-line bg-ink/40"}`}>
      <p className="font-semibold">{statement.period ? t("statements.period", { period: formatStatementPeriod(statement.period) }) : statement.fileName}</p>
      {statement.error ? <p className="text-sm text-coral" role="alert">{t("statements.rejected", { error: statement.error })}</p> : null}
      {DIVIDEND_STATEMENT_CASES.map((lineCase) => {
        const lines = statement.lines.filter((line) => line.case === lineCase);
        if (!lines.length) return null;
        return (
          <div className="mt-2" key={lineCase}>
            <p className="text-xs font-medium uppercase text-slate-500">{t(`statements.caseTitles.${lineCase}`)}</p>
            <ul className="divide-y divide-line">
              {lines.map((line) => <DividendStatementLine choice={state.choices[line.key]} key={line.key} line={line} onChoose={(choice) => { state.choose(line.key, choice); }} positions={positions} />)}
            </ul>
          </div>
        );
      })}
      {statement.refunds.length ? (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase text-slate-500">{t("statements.refundTitle")}</p>
          <ul className="divide-y divide-line">
            {statement.refunds.map((refund) => <DividendStatementRefundLine choice={state.choices[refund.key]} key={refund.key} onChoose={(choice) => { state.choose(refund.key, choice); }} refund={refund} />)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function OpeningCard({ opening, state }: { opening: OpeningDividendsCertification; state: DividendStatementsImportState }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const money = (value: number) => masquerValeur(cashMoney(value), prive);
  const gap = opening.declared === undefined ? undefined : opening.certifiable - opening.declared;
  return (
    <div className="rounded-md border border-sky/40 bg-sky/5 p-3 text-sm">
      <p className="font-semibold">{t("statements.openingTitle")}</p>
      <p className="muted">
        {t("statements.openingText", {
          date: formatMaybeDate(opening.referenceAt),
          amount: money(opening.certifiable),
          declared: opening.declared === undefined ? t("statements.openingNone") : money(opening.declared),
          gap: gap === undefined ? "-" : masquerValeur(signedCashMoney(gap), prive)
        })}
      </p>
      <label className="mt-2 flex items-center gap-2">
        <input checked={state.certifyOpening} onChange={(event) => { state.setCertifyOpening(event.target.checked); }} type="checkbox" />
        {t("statements.openingCertify")}
      </label>
    </div>
  );
}

/**
 * Import des relevés mensuels de coupons (Réglages) : plusieurs PDF à la fois, aperçu par relevé
 * et par cas, confirmation, puis compte rendu. Aucun relevé n'est conservé par l'application.
 */
export function DividendStatementsImport() {
  const { t } = useTranslation("cash");
  const state = useDividendStatementsImport();
  const { preview, result } = state;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">{t("statements.title")} <InfoHint label={t("verification.info")}>{t("verification.hint")}</InfoHint></h2>
          <p className="muted">{t("statements.help")}</p>
        </div>
        <label className="btn-ghost cursor-pointer">
          <Upload size={17} />
          {t("statements.choose")}
          <input accept="application/pdf,.pdf" className="hidden" multiple onChange={(event) => { void state.load(event.target.files); event.target.value = ""; }} type="file" />
        </label>
      </div>
      {state.loading ? <p className="p-4 text-slate-400">{t("statements.reading")}</p> : null}
      {state.error ? <p className="m-4 rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral" role="alert">{state.error}</p> : null}
      {result ? (
        <div className="space-y-1 p-4 text-sm text-mint" role="status">
          <p className="flex items-center gap-2"><BadgeCheck size={16} />{t("statements.result", { ...result, errors: result.errors.length })}</p>
          {result.openingCertified ? <p>{t("statements.openingCertified")}</p> : null}
          {result.errors.map((error) => <p className="text-coral" key={`${error.fileName}-${String(error.lineNo ?? 0)}`}>{error.fileName}{error.lineNo ? ` #${String(error.lineNo)}` : ""} : {error.message}</p>)}
        </div>
      ) : null}
      {preview ? (
        <div className="space-y-3 p-4">
          {preview.statements.map((statement) => <StatementCard key={`${statement.fileName}-${statement.period ?? ""}`} state={state} statement={statement} />)}
          {preview.opening ? <OpeningCard opening={preview.opening} state={state} /> : null}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" disabled={state.loading} onClick={state.cancel} type="button">{t("statements.cancel")}</button>
            <button className="btn-primary" disabled={state.loading} onClick={() => void state.confirm()} type="button">{t("statements.confirm")}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
