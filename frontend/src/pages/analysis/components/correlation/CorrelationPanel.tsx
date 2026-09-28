import { HIGH_CORRELATION_THRESHOLD, type PortfolioCorrelation } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { InfoHint } from "../../../../components/common/disclosure/InfoHint";
import { MOTION, staggerDelay } from "../../../../components/common/motion";
import { formatRatio } from "../../../../lib/format-metrics";
import { CorrelationHeatmap } from "./CorrelationHeatmap";

/** Paires citées au niveau 1 ; les suivantes restent dans la matrice. */
const LISTED_PAIRS_LIMIT = 5;

/**
 * Corrélation entre les lignes : une phrase et les paires les plus corrélées (niveau 1), puis la
 * matrice complète derrière « Voir la matrice » (niveau 2).
 */
export function CorrelationPanel({ correlation }: { correlation: PortfolioCorrelation }) {
  const { t } = useTranslation("common");
  const threshold = formatRatio(HIGH_CORRELATION_THRESHOLD, 1);
  const names = new Map(correlation.assets.map((asset) => [asset.symbol, asset.name]));
  const pairs = correlation.highPairs.slice(0, LISTED_PAIRS_LIMIT);

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1 text-sm text-slate-200">
        {correlation.highPairs.length
          ? t("analysis.correlation.summary", { count: correlation.highPairs.length, threshold })
          : t("analysis.correlation.none", { threshold })}
        <InfoHint label={t("analysis.charts.correlation")}>{t("analysis.correlation.hint")}</InfoHint>
      </p>
      {pairs.length ? (
        <ul className="space-y-1.5">
          {pairs.map((pair, index) => (
            <li className={`flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-slate-950/20 px-3 py-2 text-sm ${MOTION.rise}`} key={`${pair.a}-${pair.b}`} style={{ animationDelay: staggerDelay(index) }}>
              <span className="min-w-0 truncate text-slate-100">{t("analysis.correlation.pair", { a: names.get(pair.a) ?? pair.a, b: names.get(pair.b) ?? pair.b })}</span>
              <span className="shrink-0 font-semibold tabular-nums text-coral">{formatRatio(pair.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-slate-400">{t("analysis.correlation.observations", { count: correlation.observations })}</p>
      <DetailsToggle label={t("analysis.correlation.showMatrix")} storageKey="analysis.correlation.matrix">
        <CorrelationHeatmap correlation={correlation} />
      </DetailsToggle>
    </div>
  );
}
