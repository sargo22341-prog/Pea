import { MARKET_OVERVIEW_CATEGORIES, type MarketOverviewCategory, type MarketOverviewItem } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { Collapsible } from "../../../../components/common/feedback/Collapsible";
import { MOTION } from "../../../../components/common/motion";
import { MarketCard } from "./MarketCard";

/** Seuls les indices sont ouverts d'emblée ; devises, matières premières et taux sont repliés. */
const OPEN_BY_DEFAULT: ReadonlySet<MarketOverviewCategory> = new Set(["indices"]);

function CardGrid({ items }: { items: readonly MarketOverviewItem[] }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${MOTION.stagger}`}>
      {items.map((item) => <MarketCard item={item} key={item.symbol} />)}
    </div>
  );
}

export function MarketOverviewSection({ items }: { items: readonly MarketOverviewItem[] }) {
  const { t } = useTranslation(["markets"]);
  const categories = MARKET_OVERVIEW_CATEGORIES
    .map((category) => ({ category, items: items.filter((item) => item.category === category) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4">
      {categories.map(({ category, items: categoryItems }) => (
        OPEN_BY_DEFAULT.has(category) ? (
          <section className="space-y-3" key={category}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t(`markets:categories.${category}`)}</h2>
            <CardGrid items={categoryItems} />
          </section>
        ) : (
          <Collapsible key={category} title={t(`markets:categories.${category}`)}>
            <CardGrid items={categoryItems} />
          </Collapsible>
        )
      ))}
    </div>
  );
}
