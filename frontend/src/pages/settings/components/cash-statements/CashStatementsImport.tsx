import type { CashStatementContinuity, CashStatementPreview } from "@pea/shared";
import { BadgeCheck, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InfoHint } from "../../../../components/common/disclosure/InfoHint";
import { usePrivacy } from "../../../../contexts/privacy-context";
import { cashMoney } from "../../../../lib/cash/cash-format";
import { formatStatementPeriod } from "../../../../lib/cash/ledger-entry";
import { formatMaybeDate } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";
import { CashStatementLine } from "./CashStatementLine";
import { isActionable, useCashStatementsImport, type CashStatementsImportState } from "./useCashStatementsImport";

/** Lignes affichées par défaut : celles qui attendent une décision ou signalent un manque. */
const NEEDS_ATTENTION = new Set<string>(["verify", "ambiguous", "create", "missing_trade", "missing_dividend"]);

function ContinuityNote({ continuity }: { continuity: CashStatementContinuity | undefined }) {
  const { t } = useTranslation("cash");
  if (!continuity || continuity.status === "continuous") return null;
  const months = (continuity.missingPeriods ?? []).map(formatStatementPeriod).join(", ");
  const key = continuity.status === "gap" ? (continuity.balanceMatches ? "gapQuiet" : "gapMissing") : continuity.status;
  const warning = key === "gapMissing" || key === "balance_break";
  return <p className={`text-xs ${warning ? "text-coral" : "muted"}`} role={warning ? "alert" : undefined}>{t(`cashStatements.continuity.${key}`, { previous: formatStatementPeriod(continuity.previousPeriod), months })}</p>;
}

function StatementCard({ statement, state, showAll }: { statement: CashStatementPreview; state: CashStatementsImportState; showAll: boolean }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const lines = statement.lines.filter((line) => showAll || NEEDS_ATTENTION.has(line.case));
  const title = statement.period ? t("cashStatements.period", { period: formatStatementPeriod(statement.period) }) : statement.fileName;
  return (
    <div className={`rounded-md border p-3 ${statement.error ? "border-coral/60 bg-coral/5" : "border-line bg-ink/40"}`}>
      <p className="font-semibold">{title}</p>
      {statement.error ? <p className="text-sm text-coral" role="alert">{t("statements.rejected", { error: statement.error })}</p> : null}
      {statement.openingBalance !== undefined && statement.closingBalance !== undefined ? (
        <p className="muted text-xs">{t("cashStatements.balances", { opening: masquerValeur(cashMoney(statement.openingBalance), prive), openingDate: formatMaybeDate(statement.openingDate), closing: masquerValeur(cashMoney(statement.closingBalance), prive), closingDate: formatMaybeDate(statement.closingDate) })}</p>
      ) : null}
      {statement.alreadyImported ? <p className="muted text-xs">{t("cashStatements.alreadyImported")}</p> : null}
      <ContinuityNote continuity={statement.continuity} />
      {lines.length ? (
        <ul className="mt-2 divide-y divide-line">
          {lines.map((line) => <CashStatementLine choice={state.choices[line.key]} key={line.key} line={line} onChoose={(choice) => { state.choose(line.key, choice); }} positions={state.preview?.positions ?? []} />)}
        </ul>
      ) : statement.error ? null : <p className="muted mt-1 text-xs">{t("cashStatements.nothingToDo")}</p>}
    </div>
  );
}

/**
 * Import des relevés espèces mensuels (Réglages) : plusieurs PDF à la fois, aperçu par relevé
 * (continuité, rapprochements, manques), confirmation, puis compte rendu. Aucun relevé n'est
 * conservé par l'application.
 */
export function CashStatementsImport() {
  const { t } = useTranslation("cash");
  const state = useCashStatementsImport();
  const [showAll, setShowAll] = useState(false);
  const { preview, result } = state;
  const pending = preview?.statements.flatMap((statement) => statement.lines).filter(isActionable).length ?? 0;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">{t("cashStatements.title")} <InfoHint label={t("cashStatements.info")}>{t("cashStatements.hint")}</InfoHint></h2>
          <p className="muted">{t("cashStatements.help")}</p>
        </div>
        <label className="btn-ghost cursor-pointer">
          <Upload size={17} />
          {t("cashStatements.choose")}
          <input accept="application/pdf,.pdf" className="hidden" multiple onChange={(event) => { void state.load(event.target.files); event.target.value = ""; }} type="file" />
        </label>
      </div>
      {state.loading ? <p className="p-4 text-slate-400">{t("statements.reading")}</p> : null}
      {state.error ? <p className="m-4 rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral" role="alert">{state.error}</p> : null}
      {result ? (
        <div className="space-y-1 p-4 text-sm text-mint" role="status">
          <p className="flex items-center gap-2"><BadgeCheck size={16} />{t("cashStatements.result", { ...result, errors: result.errors.length })}</p>
          {result.errors.map((error) => <p className="text-coral" key={`${error.fileName}-${String(error.lineNo ?? 0)}`}>{error.fileName}{error.lineNo ? ` #${String(error.lineNo)}` : ""} : {error.message}</p>)}
        </div>
      ) : null}
      {preview ? (
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="muted">{t("cashStatements.summary", { statements: preview.statements.length, pending })}</p>
            <label className="flex items-center gap-2 text-xs">
              <input checked={showAll} onChange={(event) => { setShowAll(event.target.checked); }} type="checkbox" />
              {t("cashStatements.showAll")}
            </label>
          </div>
          {preview.statements.map((statement) => <StatementCard key={`${statement.fileName}-${statement.period ?? ""}`} showAll={showAll} state={state} statement={statement} />)}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" disabled={state.loading} onClick={state.cancel} type="button">{t("statements.cancel")}</button>
            <button className="btn-primary" disabled={state.loading} onClick={() => void state.confirm()} type="button">{t("statements.confirm")}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
