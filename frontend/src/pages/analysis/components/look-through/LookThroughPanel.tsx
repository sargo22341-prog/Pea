import type { LookThroughItem, PortfolioLookThrough, PortfolioTreemapItem } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PortfolioTreemap } from "../../../../components/charts/allocation/PortfolioTreemap";
import { formatPercent } from "../../../../components/charts/chartFormat";
import { SegmentedTabs } from "../../../../components/common/disclosure/SegmentedTabs";
import { MOTION } from "../../../../components/common/motion";

type LookThroughMode = "direct" | "withEtf";

function lookThroughTreemap(items: readonly LookThroughItem[]): PortfolioTreemapItem[] {
  return items.map((item) => ({
    symbol: item.symbol ?? item.name,
    name: item.name,
    value: item.totalWeight,
    percentage: item.totalWeight,
    viaEtf: item.viaEtf.length ? item.viaEtf : undefined
  }));
}

/** Ligne la plus exposée à travers les ETF : exemple concret affiché en tête du bloc. */
function mainIndirectExposure(items: readonly LookThroughItem[]) {
  return items.reduce<LookThroughItem | undefined>((best, item) => (item.viaEtfWeight > (best?.viaEtfWeight ?? 0) ? item : best), undefined);
}

/**
 * Transparence ETF : le treemap existant, en vue directe (les ETF comme des lignes) ou « éclatée »
 * selon les lignes détenues par chaque ETF. La part que Yahoo ne détaille pas est signalée.
 */
export function LookThroughPanel({ lookThrough, direct }: { lookThrough: PortfolioLookThrough; direct: PortfolioTreemapItem[] }) {
  const { t } = useTranslation("common");
  const [mode, setMode] = useState<LookThroughMode>("withEtf");
  const highlight = mainIndirectExposure(lookThrough.items);

  return (
    <div className="space-y-3">
      <SegmentedTabs
        ariaLabel={t("analysis.lookThrough.mode")}
        onChange={setMode}
        options={[
          { value: "direct", label: t("analysis.lookThrough.direct") },
          { value: "withEtf", label: t("analysis.lookThrough.withEtf") }
        ]}
        value={mode}
      />
      {highlight ? (
        <p className={`text-sm text-slate-200 ${MOTION.fadeIn}`}>
          {highlight.directWeight > 0
            ? t("analysis.lookThrough.highlightWithDirect", { via: formatPercent(highlight.viaEtfWeight), name: highlight.name, total: formatPercent(highlight.totalWeight) })
            : t("analysis.lookThrough.highlight", { via: formatPercent(highlight.viaEtfWeight), name: highlight.name })}
        </p>
      ) : null}
      <div className={MOTION.rise} key={mode}>
        <PortfolioTreemap data={mode === "direct" ? direct : lookThroughTreemap(lookThrough.items)} />
      </div>
      {mode === "withEtf" && lookThrough.undisclosedEtfWeight > 0 ? (
        <p className="text-xs text-slate-400">{t("analysis.lookThrough.undisclosed", { weight: formatPercent(lookThrough.undisclosedEtfWeight) })}</p>
      ) : null}
    </div>
  );
}
