import { COMPARE_MAX_SYMBOLS, COMPARE_MIN_SYMBOLS } from "@pea/shared";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CompareModal } from "../../components/common/CompareModal";
import { MOTION } from "../../components/common/motion";
import { StaleBadge } from "../../components/common/StaleBadge";
import { CompareChartSection } from "./components/CompareChartSection";
import { CompareSelection } from "./components/CompareSelection";
import { CompareTable } from "./components/CompareTable";
import { canCompare } from "./compare-symbols";
import { useCompareData } from "./hooks/useCompareData";
import { useCompareSelection } from "./hooks/useCompareSelection";

/** Comparateur de 2 à 4 actifs : courbe de performance puis indicateurs par familles. */
export function ComparePage({ localPeaSearchEnabled = false }: { localPeaSearchEnabled?: boolean }) {
  const { t } = useTranslation("compare");
  const { symbols, issue, add, remove } = useCompareSelection();
  const compare = useCompareData(symbols);
  const [picking, setPicking] = useState(false);
  const ready = canCompare(symbols);
  const assets = useMemo(() => (ready ? compare.data ?? [] : []), [compare.data, ready]);
  const targets = useMemo(
    () => symbols.map((symbol) => ({ symbol, name: assets.find((asset) => asset.symbol === symbol)?.name ?? symbol })),
    [assets, symbols]
  );

  useEffect(() => {
    document.title = `${t("title")} | PEA Portfolio`;
    return () => { document.title = "PEA Portfolio"; };
  }, [t]);

  return (
    <div className={`space-y-6 ${MOTION.stagger}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <StaleBadge show={assets.some((asset) => asset.stale)} />
        </div>
        <p className="muted">{t("subtitle", { min: COMPARE_MIN_SYMBOLS, max: COMPARE_MAX_SYMBOLS })}</p>
        <CompareSelection assets={assets} onAdd={() => { setPicking(true); }} onRemove={remove} symbols={symbols} />
        {issue && <p className="text-sm text-amber" role="status">{t(`issues.${issue}`, { max: COMPARE_MAX_SYMBOLS })}</p>}
      </div>

      {!ready ? (
        <div className="card p-6 text-center text-sm text-slate-400">{t("pickAtLeast", { min: COMPARE_MIN_SYMBOLS })}</div>
      ) : (
        <>
          <CompareChartSection targets={targets} />
          {compare.error ? <div className="card border-coral p-4 text-sm text-coral">{compare.error}</div> : null}
          {compare.loading ? <div className="h-48 animate-pulse rounded-[14px] bg-panel2" /> : compare.error ? null : <CompareTable assets={assets} />}
        </>
      )}

      {picking && (
        <CompareModal
          currentSymbol=""
          localPeaSearchEnabled={localPeaSearchEnabled}
          onAdd={(asset) => { add(asset.symbol); }}
          onClose={() => { setPicking(false); }}
          onRemove={remove}
          selected={targets}
        />
      )}
    </div>
  );
}
