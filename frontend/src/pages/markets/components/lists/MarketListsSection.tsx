import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "../../../../components/common/disclosure/SegmentedTabs";
import { MOTION } from "../../../../components/common/motion";
import { useMarketList } from "../../hooks/useMarketList";
import { MARKET_LISTS, PRIMARY_LIST_COUNT } from "./market-lists";
import { TopMoverRow, TopMoverSkeleton } from "./TopMoverRow";

/** « Top du jour » : listes Yahoo Finance, chargées une par une à la demande. */
export function MarketListsSection() {
  const { t } = useTranslation(["markets"]);
  const { listId, peaOnly, result, selectList, togglePeaOnly } = useMarketList();
  const secondary = MARKET_LISTS.slice(PRIMARY_LIST_COUNT);
  const selectedIsSecondary = secondary.some((list) => list.id === listId);
  const [showMore, setShowMore] = useState(selectedIsSecondary);
  const items = result.data?.id === listId ? result.data.items : [];
  const options = (lists: typeof MARKET_LISTS) => lists.map((list) => ({ value: list.id, label: t(`markets:lists.names.${list.id}`) }));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t("markets:lists.title")}</h2>
          <p className="muted">{t("markets:lists.help")}</p>
        </div>
        <button
          aria-pressed={peaOnly}
          className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition ${peaOnly ? "border-mint/50 bg-mint/10 text-mint" : "border-line text-slate-400 hover:text-slate-200"}`}
          onClick={togglePeaOnly}
          type="button"
        >
          {t("markets:lists.peaOnly")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedTabs ariaLabel={t("markets:lists.title")} onChange={selectList} options={options(MARKET_LISTS.slice(0, PRIMARY_LIST_COUNT))} value={listId} />
        <button aria-expanded={showMore} className="btn-ghost h-9 px-3 text-xs" onClick={() => { setShowMore(!showMore); }} type="button">
          {t("markets:lists.more")}
          <ChevronDown className={`transition-transform ${showMore ? "rotate-180" : ""}`} size={15} />
        </button>
      </div>
      {showMore ? (
        <div className={MOTION.rise}>
          <SegmentedTabs ariaLabel={t("markets:lists.more")} onChange={selectList} options={options(secondary)} value={listId} />
        </div>
      ) : null}

      {result.error ? <div className="card border-coral p-4 text-sm text-coral">{result.error}</div> : null}
      <div className="card overflow-hidden">
        {result.loading ? (
          <TopMoverSkeleton />
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">{peaOnly ? t("markets:lists.noPeaAsset") : t("markets:lists.empty")}</p>
        ) : (
          <div className="divide-y divide-line">
            {items.map((item, index) => <TopMoverRow index={index} item={item} key={item.symbol} />)}
          </div>
        )}
      </div>
    </section>
  );
}
