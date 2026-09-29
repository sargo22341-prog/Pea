import { SlidersHorizontal } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MOTION } from "../../components/common/motion";
import { StaleBadge } from "../../components/common/StaleBadge";
import { MarketListsSection } from "./components/lists/MarketListsSection";
import { MarketOverviewSection } from "./components/overview/MarketOverviewSection";
import { useMarketOverview } from "./hooks/useMarketOverview";

function OverviewSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => <div className="h-[92px] animate-pulse rounded-[14px] bg-panel2" key={index} />)}
    </div>
  );
}

/** Contexte de marché : indices, devises, matières premières et taux, puis les listes du jour. */
export function MarketsPage() {
  const { t } = useTranslation(["markets", "navigation"]);
  const overview = useMarketOverview();
  const items = overview.data?.items ?? [];

  useEffect(() => {
    document.title = `${t("navigation:markets")} | PEA Portfolio`;
    return () => { document.title = "PEA Portfolio"; };
  }, [t]);

  return (
    <div className={`space-y-8 ${MOTION.stagger}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{t("navigation:markets")}</h1>
            <StaleBadge show={items.some((item) => item.stale)} />
          </div>
          <p className="muted">{t("markets:subtitle")}</p>
        </div>
        <Link className="btn-ghost h-9 px-3 text-xs" to="/search">
          <SlidersHorizontal size={15} />
          {t("markets:searchAsset")}
        </Link>
      </div>

      {overview.error ? <div className="card border-coral p-4 text-sm text-coral">{overview.error}</div> : null}
      {overview.loading ? (
        <OverviewSkeleton />
      ) : items.length ? (
        <MarketOverviewSection items={items} />
      ) : overview.error ? null : (
        <div className="card p-4 text-sm text-slate-400">{t("markets:overview.empty")}</div>
      )}

      <MarketListsSection />
    </div>
  );
}
