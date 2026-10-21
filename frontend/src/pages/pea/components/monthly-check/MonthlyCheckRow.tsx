import type { CashMonthCheck, CashMonthIssue } from "@pea/shared";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cashMoney, signedCashMoney } from "../../../../lib/cash/cash-format";
import { formatStatementPeriod, formatStatementReference } from "../../../../lib/cash/ledger-entry";
import { formatMaybeDate } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";

const statusStyles: Record<CashMonthCheck["status"], string> = {
  ok: "border-mint/40 bg-mint/10 text-mint",
  mismatch: "border-coral/40 bg-coral/10 text-coral",
  opening: "border-line bg-ink/40 text-slate-400",
  quiet: "border-line bg-ink/40 text-slate-400",
  missing: "border-amber/40 bg-amber/10 text-amber"
};

/** Un mois a-t-il quelque chose à montrer sous sa ligne (causes, documents manquants) ? */
function hasMonthDetails(month: CashMonthCheck) {
  const missing = month.missingDocuments;
  return month.issues.length > 0 || missing.cashStatement || missing.tradeNotices > 0 || missing.couponStatements > 0;
}

/** Jour `AAAA-MM-JJ` affiché à midi UTC : toujours le même jour, quel que soit le fuseau. */
const formatDay = (day: string) => formatMaybeDate(`${day}T12:00:00.000Z`);

function IssueItem({ issue, prive }: { issue: CashMonthIssue; prive: boolean }) {
  const { t } = useTranslation("cash");
  const origin = issue.source === "statement_line" ? t("monthlyCheck.statementLine", { reference: formatStatementReference(issue.reference) }) : t("monthlyCheck.appEntry");
  const parts = [formatDay(issue.date), t(`kinds.${issue.kind}`), issue.label, masquerValeur(signedCashMoney(issue.amount), prive)].filter(Boolean);
  return (
    <li>
      <span className="font-medium">{parts.join(" · ")}</span>
      <span className="muted block text-xs">
        {origin}
        {issue.missingDocument ? ` : ${t(`monthlyCheck.documents.${issue.missingDocument}`)}` : ""}
      </span>
    </li>
  );
}

function MonthDetails({ month, prive }: { month: CashMonthCheck; prive: boolean }) {
  const { t } = useTranslation("cash");
  const missing = month.missingDocuments;
  const documents = [
    missing.cashStatement ? t("monthlyCheck.missingCashStatement") : "",
    missing.tradeNotices > 0 ? t("monthlyCheck.missingTradeNotices", { count: missing.tradeNotices }) : "",
    missing.couponStatements > 0 ? t("monthlyCheck.missingCouponStatements", { count: missing.couponStatements }) : ""
  ].filter(Boolean);
  const carried = month.monthDifference !== undefined && month.difference !== undefined && month.monthDifference !== month.difference;
  return (
    <div className="space-y-3 text-sm">
      {carried && month.monthDifference !== undefined ? <p>{t("monthlyCheck.monthDifference", { amount: masquerValeur(signedCashMoney(month.monthDifference), prive) })}</p> : null}
      {documents.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase text-slate-500">{t("monthlyCheck.missingDocuments")}</h4>
          <ul className="list-inside list-disc">{documents.map((document) => <li key={document}>{document}</li>)}</ul>
        </div>
      ) : null}
      {month.issues.length ? (
        <div>
          <h4 className="text-xs font-semibold uppercase text-slate-500">{t("monthlyCheck.issues")}</h4>
          <ul className="space-y-1">{month.issues.map((issue) => <IssueItem issue={issue} key={issue.reference ?? issue.elementId ?? issue.date} prive={prive} />)}</ul>
        </div>
      ) : null}
    </div>
  );
}

/** Ligne d'un mois : statut, soldes du relevé et de l'application, écart, détail dépliable. */
export function MonthlyCheckRow({ month, prive }: { month: CashMonthCheck; prive: boolean }) {
  const { t } = useTranslation("cash");
  const [open, setOpen] = useState(false);
  const expandable = hasMonthDetails(month);
  const amount = (value: number | undefined, signed = false) => value === undefined ? "" : masquerValeur(signed ? signedCashMoney(value) : cashMoney(value), prive);
  return (
    <>
      <tr>
        <td className="whitespace-nowrap px-4 py-2 font-medium">{formatStatementPeriod(month.period)}</td>
        <td className="whitespace-nowrap px-4 py-2">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusStyles[month.status]}`} title={t(`monthlyCheck.statusTitles.${month.status}`)}>
            {t(`monthlyCheck.statuses.${month.status}`)}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-right">{amount(month.statementBalance)}</td>
        <td className="whitespace-nowrap px-4 py-2 text-right">{amount(month.appBalance)}</td>
        <td className={`whitespace-nowrap px-4 py-2 text-right font-semibold ${month.difference ? "text-coral" : ""}`}>{amount(month.difference, true)}</td>
        <td className="px-4 py-2 text-right">
          {expandable ? (
            <button aria-expanded={open} aria-label={t("monthlyCheck.details")} className="btn-ghost px-2" onClick={() => { setOpen((current) => !current); }} title={t("monthlyCheck.details")} type="button">
              <ChevronDown className={`transition ${open ? "rotate-180" : ""}`} size={15} />
            </button>
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr>
          <td className="bg-ink/30 px-4 py-3" colSpan={6}><MonthDetails month={month} prive={prive} /></td>
        </tr>
      ) : null}
    </>
  );
}
