import { freeCashFlowCoverage, summarizeDividendGrowth, type AssetDetails } from "@pea/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AristocratBadge } from "../../../../components/common/dividends/AristocratBadge";
import { DividendHistoryBars } from "../../../../components/common/dividends/DividendHistoryBars";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { MetricGrid } from "../../../../components/common/metrics/MetricGrid";
import { METRIC_GRID_MIN_VISIBLE, visibleMetrics } from "../../../../components/common/metrics/metric-items";
import { useFeatureEnabled } from "../../../../contexts/feature-flags-context";
import { useFinancialStatements } from "../fundamentals/statements/useFinancialStatements";
import { sustainabilityItems } from "./sustainability-items";

/**
 * Bloc « Croissance et soutenabilité » de l'onglet Dividendes : taux de distribution, couverture
 * par le flux de trésorerie disponible (comptes annuels, si les fondamentaux étendus sont actifs),
 * croissance sur 5 ans et régularité. L'historique annuel reste derrière « Historique annuel ».
 */
export function DividendSustainabilityBlock({ asset }: { asset: AssetDetails }) {
  const { t } = useTranslation("asset");
  const extendedEnabled = useFeatureEnabled("extended_fundamentals");
  const statements = useFinancialStatements(asset.quote.symbol, "annual", extendedEnabled && !asset.isEtf);
  const growth = useMemo(
    () => summarizeDividendGrowth(asset.dividends.filter((event) => event.status === "real"), new Date().getUTCFullYear()),
    [asset.dividends]
  );
  const coverage = statements.data ? freeCashFlowCoverage(statements.data.rows) : undefined;
  const items = sustainabilityItems({ payoutRatio: asset.marketInfo?.payoutRatio, coverage, growth }, t);
  const hasHistory = growth.history.length > 1;
  if (visibleMetrics(items).length < METRIC_GRID_MIN_VISIBLE && !hasHistory) return null;
  const currency = asset.marketInfo?.currency ?? asset.quote.currency;

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t("dividendSustainability.title")}</h2>
        {growth.aristocrat ? <AristocratBadge streak={growth.increaseStreak} /> : null}
      </div>
      <MetricGrid items={items} />
      {hasHistory ? (
        <DetailsToggle label={t("dividendSustainability.history")} storageKey="asset.dividends.history">
          <DividendHistoryBars currency={currency} history={growth.history} />
        </DetailsToggle>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">{t("dividendSustainability.source")}</p>
    </section>
  );
}
