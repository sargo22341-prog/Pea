import type { AllocationChartItem } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { SectorAllocationChart } from "../../../../components/charts/allocation/SectorAllocationChart";
import { InfoHint } from "../../../../components/common/disclosure/InfoHint";

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
      {title}
      <InfoHint label={title}>{hint}</InfoHint>
    </h3>
  );
}

/** Répartition par tranche de capitalisation et par devise de cotation, en deux anneaux. */
export function CapitalizationCurrencyPanel({ capitalization, currency }: { capitalization: AllocationChartItem[]; currency: AllocationChartItem[] }) {
  const { t } = useTranslation("common");
  const capitalizationItems = capitalization.map((item) => ({ ...item, name: t(`analysis.capitalization.buckets.${item.name}`, { defaultValue: item.name }) }));

  return (
    <div className="grid gap-6">
      <section>
        <SectionTitle hint={t("analysis.capitalization.hint")} title={t("analysis.capitalization.title")} />
        <SectorAllocationChart data={capitalizationItems} />
      </section>
      {currency.length ? (
        <section>
          <SectionTitle hint={t("analysis.capitalization.currencyHint")} title={t("analysis.capitalization.currencyTitle")} />
          <SectorAllocationChart data={currency} />
        </section>
      ) : null}
    </div>
  );
}
