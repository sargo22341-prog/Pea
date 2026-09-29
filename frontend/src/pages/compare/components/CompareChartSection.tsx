import type { RangeKey } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ComparisonChart } from "../../../components/charts/comparison/ComparisonChart";
import { RangeSelector } from "../../../components/common/RangeSelector";
import { type ComparableAsset, useAssetComparisonSeries } from "../../../hooks/useAssetComparisonSeries";

const DEFAULT_RANGE: RangeKey = "1y";

/** Performance relative des actifs sélectionnés (variation en % depuis le début de la période). */
export function CompareChartSection({ targets }: { targets: ComparableAsset[] }) {
  const { t } = useTranslation("compare");
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const { series, loading, error, preparingSymbols } = useAssetComparisonSeries(targets, range);
  const main = series.find((serie) => serie.symbol === targets[0]?.symbol) ?? series[0];
  const others = series.filter((serie) => serie !== main);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t("chart.title")}</h2>
        <RangeSelector onChange={setRange} value={range} />
      </div>
      {main ? (
        // La légende est dessinée par `ComparisonChart` sous la courbe, hors de sa hauteur fixe : on lui réserve la place.
        <div className="pb-8">
          <ComparisonChart comparisonSeries={others} data={main.points} mainSymbol={main.symbol} range={range} />
        </div>
      ) : loading ? (
        <div className="h-72 animate-pulse rounded-md bg-panel2" />
      ) : (
        <p className="text-sm text-slate-400">{t("chart.empty")}</p>
      )}
      {preparingSymbols.length > 0 && <p className="text-xs text-slate-400">{t("chart.preparing", { symbols: preparingSymbols.join(", ") })}</p>}
      {error && preparingSymbols.length === 0 && <p className="text-xs text-coral">{error}</p>}
    </section>
  );
}
