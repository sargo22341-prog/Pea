import type { MarketOverviewItem } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { sparklinePath } from "../../../../components/charts/sparklinePath";
import { flashClass } from "../../../../components/common/motion";
import { useNumberPulse } from "../../../../hooks/useValuePulse";
import { money, numberFormatter, percent } from "../../../../lib/format";

const SPARKLINE_BOX = { width: 120, height: 36, padding: 3 };

/** Indices en points, devises à 4 décimales, matières premières dans leur devise, taux en pourcentage. */
function formatPrice(item: MarketOverviewItem) {
  if (item.price === undefined) return "";
  if (item.category === "commodities" && item.currency) return money(item.price, item.currency);
  const digits = item.category === "currencies" ? 4 : 2;
  const value = numberFormatter({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(item.price);
  return item.category === "rates" ? `${value} %` : value;
}

/** Cotation d'un indice, d'une devise, d'une matière première ou d'un taux, avec sa mini-courbe du mois. */
export function MarketCard({ item }: { item: MarketOverviewItem }) {
  const { t } = useTranslation(["markets"]);
  const pulse = useNumberPulse(item.price);
  const changePercent = item.changePercent ?? 0;
  const tone = changePercent > 0 ? "text-mint" : changePercent < 0 ? "text-coral" : "text-slate-400";
  const path = sparklinePath(item.sparkline, SPARKLINE_BOX);
  const price = formatPrice(item);

  return (
    <article className="flex items-center justify-between gap-3 rounded-[14px] border border-white/[0.05] bg-slate-950/20 p-3 transition hover:-translate-y-0.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{t(`markets:instruments.${item.key}`)}</p>
        <p className="text-[11px] text-slate-500">{item.symbol}</p>
        <p className="mt-1 text-base font-bold">
          <span className={`-mx-1 inline-block rounded px-1 ${flashClass(pulse.trend)}`} key={pulse.pulseKey}>{price}</span>
        </p>
        {item.changePercent !== undefined ? <p className={`text-xs font-semibold ${tone}`}>{percent(item.changePercent)}</p> : null}
      </div>
      {path ? (
        <svg aria-label={t("markets:overview.sparkline")} className={`h-9 w-[120px] shrink-0 ${tone}`} focusable="false" preserveAspectRatio="none" role="img" viewBox={`0 0 ${SPARKLINE_BOX.width} ${SPARKLINE_BOX.height}`}>
          <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
    </article>
  );
}
