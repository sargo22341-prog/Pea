import type { CurrencyCode } from "@pea/shared";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/privacy-context";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { SafeResponsiveContainer } from "../../../components/charts/SafeResponsiveContainer";
import { CHART_ANIMATION_MS } from "../../../components/charts/chartFormat";
import { MOTION } from "../../../components/common/motion";
import { money } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { projectionBasisYears } from "../utils/projectDividendYear";
import type { DividendStatusTotals } from "../utils/dividendInsights";

/** Barres pleines pour les montants connus ou estimes, attenuees pour une annee projetee. */
const BAR_COLOR = "#22c55e";
const PROJECTED_BAR_COLOR = "#22c55e80";

export interface MonthlyDividendEntry {
  symbol: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
}

export interface MonthlyDividend {
  month: string;
  label: string;
  total: number;
  currency: CurrencyCode;
  entries: MonthlyDividendEntry[];
}

interface DividendAnnualEstimateProps {
  currency: CurrencyCode;
  monthlyDividends: MonthlyDividend[];
  onYearChange: (year: string) => void;
  projectedYear?: string | undefined;
  /** Part du total déjà détachée, annoncée par les sociétés ou estimée. */
  statusTotals: DividendStatusTotals;
  total: number;
  year: string;
  years: string[];
}

export function DividendAnnualEstimate({ currency, monthlyDividends, onYearChange, projectedYear, statusTotals, total, year, years }: DividendAnnualEstimateProps) {
  const { t } = useTranslation(["dashboard"]);
  const prive = usePrivacy();
  const showingProjection = projectedYear !== undefined && year === projectedYear;
  const projectionBasis = showingProjection ? projectionBasisYears(Number(year)) : undefined;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="muted">
            {showingProjection
              ? t("dividendsPage.projectionTitle", { ns: "dashboard", year })
              : t("dividendsPage.annualEstimate", { ns: "dashboard" })}
          </p>
          <p className="mt-1 text-3xl font-bold text-mint">{masquerValeur(money(total, currency), prive)}</p>
          {!showingProjection ? <StatusBreakdown currency={currency} prive={prive} totals={statusTotals} /> : null}
          {projectionBasis && (
            <p className={`mt-1 text-xs text-slate-500 ${MOTION.fadeIn}`}>
              {t("dividendsPage.projectionBasis", { ns: "dashboard", base: projectionBasis.base, reference: projectionBasis.reference })}
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
          <h2 className="font-semibold sm:pb-2">{t("dividendsPage.monthlyForecast", { ns: "dashboard" })}</h2>
          <label className="w-full sm:w-44">
            <span className="muted mb-2 block">{t("dividendsPage.year", { ns: "dashboard" })}</span>
            <select className="input" onChange={(event) => { onYearChange(event.target.value); }} value={year}>
              {years.map((item) => (
                <option key={item} value={item}>
                  {item === projectedYear ? t("dividendsPage.projectedOption", { ns: "dashboard", year: item }) : item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="h-72 min-w-0 p-4">
        <SafeResponsiveContainer>
          <BarChart data={monthlyDividends}>
            <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <YAxis hide />
            <Tooltip
              content={<MonthlyDividendTooltip prive={prive} />}
              cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
              wrapperStyle={{ outline: "none" }}
            />
            <Bar animationDuration={CHART_ANIMATION_MS} dataKey="total" fill={showingProjection ? PROJECTED_BAR_COLOR : BAR_COLOR} radius={[6, 6, 0, 0]} />
          </BarChart>
        </SafeResponsiveContainer>
      </div>
    </section>
  );
}

/** Origine des montants de l'année : détachés, annoncés par les sociétés, estimés. */
function StatusBreakdown({ totals, currency, prive }: { totals: DividendStatusTotals; currency: CurrencyCode; prive: boolean }) {
  const { t } = useTranslation(["dashboard"]);
  const parts = (["real", "announced", "estimated"] as const).filter((status) => totals[status] > 0);
  if (parts.length < 2 && !parts.includes("announced")) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
      {parts.map((status) => (
        <span key={status}>
          {t(`dividendsPage.status.${status}`, { ns: "dashboard", value: masquerValeur(money(totals[status], currency), prive) })}
        </span>
      ))}
    </p>
  );
}

function MonthlyDividendTooltip({
  active,
  payload,
  prive
}: {
  active?: boolean;
  payload?: { payload?: MonthlyDividend }[];
  prive: boolean;
}) {
  const month = payload?.[0]?.payload;
  const { t } = useTranslation(["dashboard"]);
  if (!active || !month) return null;

  return (
    <div className="min-w-52 rounded-md border border-line bg-panel p-3 shadow-glow">
      <p className="mb-2 font-semibold capitalize">{month.label}</p>
      {month.entries.length === 0 ? (
        <p className="text-sm text-slate-400">{t("dividendsPage.noDividend", { ns: "dashboard" })}</p>
      ) : (
        <div className="space-y-2">
          {month.entries.map((entry) => (
            <div className="flex items-center justify-between gap-3" key={entry.symbol}>
              <div className="flex min-w-0 items-center gap-2">
                <AssetIcon className="h-7 w-7" symbol={entry.symbol} />
                <span className="truncate text-sm">{entry.symbol}</span>
              </div>
              <span className="whitespace-nowrap text-sm font-semibold">{masquerValeur(money(entry.amount, entry.currency), prive)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2 font-semibold">
        <span>{t("dividendsPage.total", { ns: "dashboard" })}</span>
        <span className="text-mint">{masquerValeur(money(month.total, month.currency), prive)}</span>
      </div>
    </div>
  );
}
