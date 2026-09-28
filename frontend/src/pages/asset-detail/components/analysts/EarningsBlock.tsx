import type { AssetEarnings, EarningsQuarter } from "@pea/shared";
import { CalendarClock } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { MetricGrid } from "../../../../components/common/metrics/MetricGrid";
import { MOTION, staggerDelay } from "../../../../components/common/motion";
import { formatMaybeDate, money } from "../../../../lib/format";
import { formatCompactMoney, formatFractionPercent } from "../../../../lib/format-metrics";

const MONTHS_PER_QUARTER = 3;
/** Marge verticale autour des bénéfices extrêmes du graphique, pour que les points ne touchent pas les bords. */
const DOT_CHART_PADDING = 0.15;

function quarterLabel(quarter: EarningsQuarter, t: TFunction<"asset">) {
  if (!quarter.endDate) return quarter.period;
  const date = new Date(quarter.endDate);
  return t("statements.quarter", { quarter: Math.floor(date.getUTCMonth() / MONTHS_PER_QUARTER) + 1, year: date.getUTCFullYear() });
}

/** Bénéfice par action estimé (cercle vide) et publié (cercle plein, vert si battu), trimestre par trimestre. */
function EarningsDots({ quarters, currency }: { quarters: EarningsQuarter[]; currency: string }) {
  const { t } = useTranslation("asset");
  const values = quarters.flatMap((quarter) => [quarter.epsActual, quarter.epsEstimate]).filter((value): value is number => value !== undefined);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const low = min - span * DOT_CHART_PADDING;
  const position = (value: number) => ((value - low) / (span * (1 + 2 * DOT_CHART_PADDING))) * 100;

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${quarters.length}, minmax(0, 1fr))` }}>
      {quarters.map((quarter, index) => {
        const beat = quarter.epsActual !== undefined && quarter.epsEstimate !== undefined && quarter.epsActual >= quarter.epsEstimate;
        return (
          <div className="flex flex-col items-center gap-1 text-center text-xs" key={quarter.period}>
            <div className="relative h-28 w-full rounded-md bg-slate-950/40">
              {quarter.epsEstimate !== undefined ? (
                <span
                  className={`absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-slate-300 ${MOTION.pop}`}
                  style={{ bottom: `${position(quarter.epsEstimate)}%`, animationDelay: staggerDelay(index) }}
                  title={t("earnings.estimate", { value: money(quarter.epsEstimate, currency) })}
                />
              ) : null}
              {quarter.epsActual !== undefined ? (
                <span
                  className={`absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-full ${beat ? "bg-mint" : "bg-coral"} ${MOTION.pop}`}
                  style={{ bottom: `${position(quarter.epsActual)}%`, animationDelay: staggerDelay(index + 1) }}
                  title={t("earnings.actual", { value: money(quarter.epsActual, currency) })}
                />
              ) : null}
            </div>
            <span className="text-slate-400">{quarterLabel(quarter, t)}</span>
            {quarter.surprisePercent !== undefined ? (
              <span className={quarter.surprisePercent >= 0 ? "text-mint" : "text-coral"}>{formatFractionPercent(quarter.surprisePercent, { signed: true })}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Prochaine publication (niveau 1) puis historique des surprises (niveau 2). */
export function EarningsBlock({ earnings, fallbackCurrency }: { earnings: AssetEarnings; fallbackCurrency: string }) {
  const { t } = useTranslation("asset");
  const currency = earnings.currency ?? fallbackCurrency;
  const next = earnings.next;

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("earnings.title")}</h2>
      {next ? (
        <MetricGrid
          columnsClassName="grid-cols-1 sm:grid-cols-3"
          items={[
            {
              key: "date",
              label: t("earnings.nextDate"),
              icon: <CalendarClock size={18} />,
              iconTone: "cyan",
              value: next.date ? formatMaybeDate(next.date) : undefined,
              sub: next.date && next.isEstimate ? t("earnings.estimatedDate") : undefined
            },
            {
              key: "eps",
              label: t("earnings.expectedEps"),
              value: next.epsAverage === undefined ? undefined : money(next.epsAverage, currency),
              sub: next.epsLow !== undefined && next.epsHigh !== undefined ? t("earnings.range", { low: money(next.epsLow, currency), high: money(next.epsHigh, currency) }) : undefined
            },
            {
              key: "revenue",
              label: t("earnings.expectedRevenue"),
              value: next.revenueAverage === undefined ? undefined : formatCompactMoney(next.revenueAverage, currency),
              sub: next.revenueLow !== undefined && next.revenueHigh !== undefined ? t("earnings.range", { low: formatCompactMoney(next.revenueLow, currency), high: formatCompactMoney(next.revenueHigh, currency) }) : undefined
            }
          ]}
          minVisible={1}
        />
      ) : null}
      {earnings.quarters.length ? (
        <DetailsToggle label={t("earnings.history")} storageKey="earnings-history">
          <EarningsDots currency={currency} quarters={earnings.quarters} />
          <p className="mt-2 text-xs text-slate-500">{t("earnings.legend")}</p>
        </DetailsToggle>
      ) : null}
    </section>
  );
}
