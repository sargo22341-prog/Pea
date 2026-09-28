import type { FinancialYearItem, StatementsPeriod } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FinancialComboChart } from "../../../../../components/charts/financial/FinancialComboChart";
import { DetailsToggle } from "../../../../../components/common/disclosure/DetailsToggle";
import { SegmentedTabs } from "../../../../../components/common/disclosure/SegmentedTabs";
import { useFeatureEnabled } from "../../../../../contexts/feature-flags-context";
import { STATEMENT_SERIES, hasSeriesData, statementPeriodLabel, type StatementsView } from "./statements-series";
import { StatementsChart } from "./StatementsChart";
import { StatementsTable } from "./StatementsTable";
import { useFinancialStatements } from "./useFinancialStatements";

/**
 * Carte « États financiers » : résultats (comptes annuels existants), bilan et flux de trésorerie.
 * Sans fondamentaux étendus, seule la vue Résultats reste, comme avant.
 */
export function FinancialStatementsCard({ symbol, financials, currency }: { symbol: string; financials?: FinancialYearItem[] | undefined; currency: string }) {
  const { t } = useTranslation("asset");
  const extendedEnabled = useFeatureEnabled("extended_fundamentals");
  const quarterlyEnabled = useFeatureEnabled("quarterly_statements");
  const hasResults = Boolean(financials?.length);
  const [view, setView] = useState<StatementsView>(hasResults ? "results" : "balance");
  const [period, setPeriod] = useState<StatementsPeriod>("annual");
  const statementsView = view !== "results";
  const statements = useFinancialStatements(symbol, period, extendedEnabled && (statementsView || period === "annual"));
  const rows = (statements.data?.rows ?? []).map((row) => ({ ...row, label: statementPeriodLabel(row, period, t) }));
  const statementsCurrency = statements.data?.currency ?? currency;
  const availableViews = (["results", "balance", "flows"] as const).filter((item) =>
    item === "results" ? hasResults : extendedEnabled && (statements.loading || period === "quarterly" || hasSeriesData(rows, STATEMENT_SERIES[item]))
  );
  if (!availableViews.length) return null;
  const activeView = availableViews.includes(view) ? view : availableViews[0] ?? "results";

  return (
    <section className="card min-w-0 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t("statements.title")}</h2>
        {activeView !== "results" && quarterlyEnabled ? (
          <SegmentedTabs
            ariaLabel={t("statements.periodLabel")}
            onChange={setPeriod}
            options={[{ value: "annual", label: t("statements.annual") }, { value: "quarterly", label: t("statements.quarterly") }]}
            value={period}
          />
        ) : null}
      </div>
      {availableViews.length > 1 ? (
        <div className="mb-4">
          <SegmentedTabs ariaLabel={t("statements.viewLabel")} onChange={setView} options={availableViews.map((item) => ({ value: item, label: t(`statements.views.${item}`) }))} value={activeView} />
        </div>
      ) : null}
      {activeView === "results" && financials ? <FinancialComboChart data={financials} /> : null}
      {activeView !== "results" ? (
        statements.loading ? (
          <p className="muted py-10 text-center">{t("statements.loading")}</p>
        ) : statements.error ? (
          <p className="py-10 text-center text-sm text-coral">{statements.error}</p>
        ) : hasSeriesData(rows, STATEMENT_SERIES[activeView]) ? (
          <>
            <StatementsChart currency={statementsCurrency} rows={rows} series={STATEMENT_SERIES[activeView]} />
            <DetailsToggle label={t("statements.showData")} storageKey="statements-table">
              <StatementsTable currency={statementsCurrency} rows={rows} />
            </DetailsToggle>
          </>
        ) : (
          <p className="muted py-10 text-center">{t("statements.empty")}</p>
        )
      ) : null}
    </section>
  );
}
