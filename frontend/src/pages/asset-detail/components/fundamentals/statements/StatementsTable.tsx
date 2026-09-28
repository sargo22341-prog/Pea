import type { FinancialStatementRow } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { formatCompactMoney, MISSING_VALUE } from "../../../../../lib/format-metrics";
import { STATEMENT_TABLE_METRICS } from "./statements-series";

/** Données chiffrées du graphique, une colonne par période. */
export function StatementsTable({ rows, currency }: { rows: (FinancialStatementRow & { label: string })[]; currency: string }) {
  const { t } = useTranslation("asset");
  const metrics = STATEMENT_TABLE_METRICS.filter((metric) => rows.some((row) => row[metric] !== undefined));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-right text-sm">
        <thead className="text-xs uppercase text-slate-400">
          <tr>
            <th className="p-2 text-left font-medium">{t("statements.metric")}</th>
            {rows.map((row) => <th className="p-2 font-medium" key={`${row.endDate}-${String(row.isTtm)}`} scope="col">{row.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {metrics.map((metric) => (
            <tr key={metric}>
              <th className="p-2 text-left font-medium text-slate-300" scope="row">{t(`statements.metrics.${metric}`)}</th>
              {rows.map((row) => (
                <td className="p-2 tabular-nums" key={`${row.endDate}-${String(row.isTtm)}`}>
                  {row[metric] === undefined ? MISSING_VALUE : formatCompactMoney(row[metric], currency)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
