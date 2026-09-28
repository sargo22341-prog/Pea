import type { AssetFinancialHealth, HealthCategory } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { InfoHint } from "../../../../components/common/disclosure/InfoHint";
import { MetricGrid } from "../../../../components/common/metrics/MetricGrid";
import { MOTION } from "../../../../components/common/motion";
import { ratingToneClass } from "../../../../utils/assetTone";
import { otherHealthItems, ratedHealthItems } from "./health-items";

const CATEGORIES: readonly HealthCategory[] = ["profitability", "debt", "growth"];

/**
 * Bloc « Santé financière » : un verdict d'abord, puis une pastille par famille ; la grille
 * complète des ratios reste derrière « Voir les ratios ». Masqué sans verdict possible.
 */
export function FinancialHealthBlock({ health }: { health: AssetFinancialHealth }) {
  const { t } = useTranslation("asset");
  const verdict = health.verdict;
  if (!verdict) return null;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
          {t("health.title")}
          <InfoHint label={t("health.title")}>{t(health.isFinancialSector ? "health.financialSectorHint" : "health.verdictHint")}</InfoHint>
        </h2>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${MOTION.pop} ${ratingToneClass(verdict.overall)}`}>
          {t(`health.verdict.${verdict.overall}`)}
        </span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {CATEGORIES.map((category) => {
          const rating = verdict.categories[category];
          if (!rating) return null;
          return (
            <li className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${ratingToneClass(rating)}`} key={category}>
              {t(`health.categories.${category}`)} · {t(`health.rating.${rating}`)}
            </li>
          );
        })}
      </ul>
      <DetailsToggle label={t("health.showRatios")} storageKey="financial-health">
        <div className="space-y-3">
          <MetricGrid columnsClassName="grid-cols-2 lg:grid-cols-4" items={ratedHealthItems(health, t)} minVisible={1} />
          <MetricGrid columnsClassName="grid-cols-2 lg:grid-cols-4" items={otherHealthItems(health, t)} minVisible={1} />
        </div>
      </DetailsToggle>
      <p className="mt-3 text-xs text-slate-500">{t("health.disclaimer")}</p>
    </section>
  );
}
