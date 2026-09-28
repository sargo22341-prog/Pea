import { useTranslation } from "react-i18next";
import { formatFractionPercent } from "../../../lib/format-metrics";
import { money } from "../../../lib/format";
import { MOTION } from "../motion";
import { RANGE52_FILL_CLASSES, range52Position } from "./range52";

/**
 * Micro-jauge de la fourchette 52 semaines (ligne du dashboard) : remplissage jusqu'au cours,
 * valeurs exactes au survol. Rien n'est rendu sans fourchette connue.
 */
export function Range52Gauge({ low, high, price, currency, className = "" }: {
  low: number | undefined;
  high: number | undefined;
  price: number | undefined;
  currency: string;
  className?: string;
}) {
  const { t } = useTranslation("dashboard");
  const position = range52Position(low, high, price);
  if (!position || low === undefined || high === undefined) return null;

  const distance = position.distanceFromHigh === 0
    ? t("positionSignals.atHigh")
    : t("positionSignals.belowHigh", { value: formatFractionPercent(-position.distanceFromHigh) });
  const label = t("positionSignals.range52", { low: money(low, currency), high: money(high, currency), distance });

  return (
    <span aria-label={label} className={`relative block h-1 w-10 overflow-hidden rounded-full bg-slate-950/80 ${className}`} role="img" title={label}>
      <span className={`block h-full rounded-full ${MOTION.gaugeFill} ${RANGE52_FILL_CLASSES[position.tone]}`} style={{ width: `${position.ratio * 100}%` }} />
    </span>
  );
}
