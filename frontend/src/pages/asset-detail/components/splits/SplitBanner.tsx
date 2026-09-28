import type { SplitDecision, UserAssetSplit } from "@pea/shared";
import { Split } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { MOTION } from "../../../../components/common/motion";
import { formatMaybeDate } from "../../../../lib/format";
import { splitRatioLabel } from "../../../../lib/split-label";

/**
 * Bannière de division d'action détectée : l'ajustement des transactions antérieures n'est
 * appliqué qu'après la décision explicite de l'utilisateur.
 */
export function SplitBanner({
  splits,
  decidingId,
  error,
  onDecide
}: {
  splits: UserAssetSplit[];
  decidingId: number | null;
  error: string | null;
  onDecide: (split: UserAssetSplit, decision: SplitDecision) => void;
}) {
  const { t } = useTranslation("asset");
  if (!splits.length) return null;

  return (
    <section aria-live="polite" className={`card border-amber/40 p-4 text-sm ${MOTION.rise}`}>
      {splits.map((split) => (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" key={split.id}>
          <p className="flex items-start gap-2 text-amber">
            <Split aria-hidden className="mt-0.5 shrink-0" size={18} />
            <span>{t("splits.detected", { ratio: splitRatioLabel(split, t), date: formatMaybeDate(split.date, "UTC") })}</span>
          </p>
          <div className="flex shrink-0 gap-2">
            <button className="btn-primary" disabled={decidingId !== null} onClick={() => { onDecide(split, "apply"); }} type="button">
              {t("splits.apply")}
            </button>
            <button className="btn-ghost" disabled={decidingId !== null} onClick={() => { onDecide(split, "ignore"); }} type="button">
              {t("splits.ignore")}
            </button>
          </div>
        </div>
      ))}
      {error ? <p className="mt-2 text-coral">{error}</p> : null}
      <DetailsToggle label={t("splits.learnMore")} storageKey="split-explanation">
        <p className="text-slate-300">{t("splits.explanation")}</p>
      </DetailsToggle>
    </section>
  );
}
