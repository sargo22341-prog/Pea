import type { AnalystRecommendationPeriod } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { MOTION } from "../../../../components/common/motion";
import { CONSENSUS_SCALE } from "../../../../utils/assetTone";

const COUNT_KEYS = ["strongBuy", "buy", "hold", "sell", "strongSell"] as const;

/** Barre empilée des avis d'un mois, aux couleurs de l'échelle de consensus. */
export function RecommendationBar({ period, compact = false }: { period: AnalystRecommendationPeriod; compact?: boolean }) {
  const { t } = useTranslation("asset");
  const total = COUNT_KEYS.reduce((sum, key) => sum + period[key], 0);
  if (!total) return null;
  const label = COUNT_KEYS.map((key, index) => `${t(`analyst.${CONSENSUS_SCALE[index]?.key ?? key}`)} ${period[key]}`).join(", ");

  return (
    <div aria-label={label} className={`flex w-full overflow-hidden rounded-full bg-slate-950/80 ${compact ? "h-2" : "h-3"}`} role="img">
      {COUNT_KEYS.map((key, index) =>
        period[key] > 0 ? (
          <span
            className={`h-full ${MOTION.barGrow} ${CONSENSUS_SCALE[index]?.bar ?? ""}`}
            key={key}
            style={{ width: `${(period[key] / total) * 100}%` }}
            title={`${t(`analyst.${CONSENSUS_SCALE[index]?.key ?? key}`)} : ${period[key]}`}
          />
        ) : null
      )}
    </div>
  );
}
