import type { TopMover } from "@pea/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MOTION, staggerDelay } from "../../../../components/common/motion";
import { formatSignedMoney, money, percent } from "../../../../lib/format";
import { formatCompactMoney } from "../../../../lib/format-metrics";

/** Indicateurs secondaires disponibles (PER, rendement, capitalisation), sur une seconde ligne. */
function metricsLine(item: TopMover, t: TFunction) {
  const currency = item.currency ?? "USD";
  return [
    item.trailingPE === undefined ? undefined : t("markets:lists.pe", { value: item.trailingPE.toFixed(1) }),
    item.dividendYield === undefined ? undefined : t("markets:lists.yield", { value: percent(item.dividendYield * 100) }),
    item.marketCap === undefined ? undefined : t("markets:lists.cap", { value: formatCompactMoney(item.marketCap, currency) })
  ].filter((part): part is string => part !== undefined).join(" · ");
}

export function TopMoverRow({ item, index }: { item: TopMover; index: number }) {
  const { t } = useTranslation(["markets"]);
  const currency = item.currency ?? "USD";
  const tone = item.change >= 0 ? "text-mint" : "text-coral";
  const metrics = metricsLine(item, t);

  return (
    <Link
      className={`grid grid-cols-[1fr_auto] items-center gap-3 p-4 transition hover:bg-panel2/40 ${MOTION.rise}`}
      style={{ animationDelay: staggerDelay(index) }}
      to={`/assets/${encodeURIComponent(item.symbol)}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="font-semibold">{item.symbol}</p>
          {item.shortName ? <p className="truncate text-sm text-slate-400">{item.shortName}</p> : null}
          {item.peaEligible ? <span className="rounded-full border border-mint/40 px-2 text-[10px] font-semibold text-mint">PEA</span> : null}
        </div>
        <p className="mt-1 text-sm text-slate-300">{money(item.price, currency)}</p>
        {metrics ? <p className="mt-0.5 text-xs text-slate-400">{metrics}</p> : null}
      </div>
      <div className="text-right">
        <p className={`font-semibold ${tone}`}>{percent(item.changePercent)}</p>
        <p className={`text-sm ${tone}`}>{formatSignedMoney(item.change, currency)}</p>
      </div>
    </Link>
  );
}

export function TopMoverSkeleton() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 6 }, (_, item) => (
        <div className="grid grid-cols-[1fr_auto] gap-3 p-4" key={item}>
          <div className="space-y-2">
            <div className="h-4 w-36 animate-pulse rounded bg-panel2" />
            <div className="h-3 w-20 animate-pulse rounded bg-panel2" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-16 animate-pulse rounded bg-panel2" />
            <div className="h-3 w-14 animate-pulse rounded bg-panel2" />
          </div>
        </div>
      ))}
    </div>
  );
}
