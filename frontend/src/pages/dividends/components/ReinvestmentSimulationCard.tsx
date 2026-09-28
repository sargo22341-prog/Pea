import type { CurrencyCode } from "@pea/shared";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_ANIMATION_MS } from "../../../components/charts/chartFormat";
import { SafeResponsiveContainer } from "../../../components/charts/SafeResponsiveContainer";
import { Collapsible } from "../../../components/common/feedback/Collapsible";
import { usePrivacy } from "../../../contexts/privacy-context";
import { money } from "../../../lib/format";
import { formatFractionPercent } from "../../../lib/format-metrics";
import { masquerValeur } from "../../../lib/privacy";
import { REINVESTMENT_GROWTH, REINVESTMENT_HORIZON_YEARS, simulateReinvestment, type ReinvestmentPoint } from "../utils/reinvestmentSimulation";

const WITH_COLOR = "#22c55e";
const WITHOUT_COLOR = "#94a3b8";

/**
 * « Simuler le réinvestissement » : revenu annuel des dividendes avec et sans réinvestissement,
 * selon l'horizon et la croissance choisis. Replié par défaut ; masqué sans revenu attendu.
 */
export function ReinvestmentSimulationCard({ marketValue, annualIncome, defaultGrowth, currency }: {
  marketValue: number | undefined;
  annualIncome: number | undefined;
  defaultGrowth: number;
  currency: CurrencyCode;
}) {
  const { t } = useTranslation("dashboard");
  const prive = usePrivacy();
  const horizonId = useId();
  const growthId = useId();
  const [horizon, setHorizon] = useState<number>(REINVESTMENT_HORIZON_YEARS.default);
  const [growth, setGrowth] = useState(defaultGrowth);
  const points = useMemo(
    () => simulateReinvestment({ marketValue: marketValue ?? 0, annualIncome: annualIncome ?? 0, growthRate: growth, horizonYears: horizon }),
    [annualIncome, growth, horizon, marketValue]
  );
  const last = points.at(-1);
  if (!last) return null;
  const format = (value: number) => masquerValeur(money(value, currency), prive);

  return (
    <Collapsible title={t("dividendsPage.simulation.title")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm" htmlFor={horizonId}>
          <span className="flex justify-between text-slate-400">
            {t("dividendsPage.simulation.horizon")}
            <span className="font-semibold text-slate-200">{t("dividendsPage.simulation.years", { count: horizon })}</span>
          </span>
          <input
            className="mt-2 w-full"
            id={horizonId}
            max={REINVESTMENT_HORIZON_YEARS.max}
            min={REINVESTMENT_HORIZON_YEARS.min}
            onChange={(event) => { setHorizon(Number(event.target.value)); }}
            step={1}
            type="range"
            value={horizon}
          />
        </label>
        <label className="text-sm" htmlFor={growthId}>
          <span className="flex justify-between text-slate-400">
            {t("dividendsPage.simulation.growth")}
            <span className="font-semibold text-slate-200">{t("dividendsPage.perYear", { value: formatFractionPercent(growth) })}</span>
          </span>
          <input
            className="mt-2 w-full"
            id={growthId}
            max={REINVESTMENT_GROWTH.max}
            min={REINVESTMENT_GROWTH.min}
            onChange={(event) => { setGrowth(Number(event.target.value)); }}
            step={REINVESTMENT_GROWTH.step}
            type="range"
            value={growth}
          />
        </label>
      </div>

      <p className="text-sm text-slate-300">
        {t("dividendsPage.simulation.summary", { years: horizon, with: format(last.incomeWith), without: format(last.incomeWithout) })}
      </p>

      <div className="h-56 min-w-0">
        <SafeResponsiveContainer>
          <LineChart data={points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="year" stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={(year: number) => t("dividendsPage.simulation.yearTick", { year })} />
            <YAxis hide />
            <Tooltip content={<SimulationTooltip format={format} />} wrapperStyle={{ outline: "none" }} />
            <Legend formatter={(key: string) => t(`dividendsPage.simulation.${key}`)} wrapperStyle={{ fontSize: 12 }} />
            <Line animationDuration={CHART_ANIMATION_MS} dataKey="incomeWith" dot={false} stroke={WITH_COLOR} strokeWidth={2.5} type="monotone" />
            <Line animationDuration={CHART_ANIMATION_MS} dataKey="incomeWithout" dot={false} stroke={WITHOUT_COLOR} strokeDasharray="5 4" strokeWidth={2} type="monotone" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="text-xs text-slate-500">{t("dividendsPage.simulation.assumption")}</p>
    </Collapsible>
  );
}

function SimulationTooltip({ active, payload, format }: { active?: boolean; payload?: { payload?: ReinvestmentPoint }[]; format: (value: number) => string }) {
  const { t } = useTranslation("dashboard");
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-line bg-panel p-3 text-xs shadow-glow">
      <p className="mb-1 font-semibold">{t("dividendsPage.simulation.yearTick", { year: point.year })}</p>
      <p className="text-mint">{t("dividendsPage.simulation.incomeWith")} : {format(point.incomeWith)}</p>
      <p className="text-slate-300">{t("dividendsPage.simulation.incomeWithout")} : {format(point.incomeWithout)}</p>
      <p className="mt-1 text-slate-400">{t("dividendsPage.simulation.cumulative", { with: format(point.cumulativeWith), without: format(point.cumulativeWithout) })}</p>
    </div>
  );
}
