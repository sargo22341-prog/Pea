import { ratePayoutRatio } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { formatFractionPercent } from "../../../lib/format-metrics";
import { ratingFillClass } from "../../../utils/assetTone";
import { MOTION } from "../motion";

/**
 * Micro-jauge du taux de distribution (dividendes / bénéfice), colorée selon les seuils partagés.
 * Au-delà de 100 %, la jauge est pleine : le dividende dépasse le bénéfice.
 */
export function PayoutGauge({ value, className = "" }: { value: number | undefined; className?: string }) {
  const { t } = useTranslation("common");
  const rating = ratePayoutRatio(value);
  if (value === undefined || !rating) return null;
  const label = t("dividends.payoutGauge", { value: formatFractionPercent(value, { digits: 0 }), rating: t(`dividends.rating.${rating}`) });
  const width = Math.max(0, Math.min(1, value)) * 100;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={label}>
      <span aria-label={label} className="relative block h-1 w-10 overflow-hidden rounded-full bg-slate-950/80" role="img">
        <span className={`block h-full rounded-full ${MOTION.gaugeFill} ${ratingFillClass(rating)}`} style={{ width: `${width}%` }} />
      </span>
      <span aria-hidden className="text-xs tabular-nums text-slate-400">{formatFractionPercent(value, { digits: 0 })}</span>
    </span>
  );
}
