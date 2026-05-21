import type { ObjectiveContributionPoint } from "@pea/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { SafeResponsiveContainer } from "../../../components/charts/SafeResponsiveContainer";
import { money } from "../../../lib/format";
import { ObjectiveContributionTooltip } from "./ObjectiveContributionTooltip";

const monthLabels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sep", "Oct", "Nov", "Dec"];

export function ObjectiveContributionChart({ data }: { data: ObjectiveContributionPoint[] }) {
  const { t } = useTranslation("objectives");
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const chartData = useMemo(() => {
    const byMonth = new Map(data.map((item) => [item.month, item]));
    return monthLabels.map((label, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      const item = byMonth.get(month);
      return {
        month,
        label,
        amount: item?.amount ?? 0,
        kind: item?.kind ?? "estimated"
      };
    });
  }, [data, year]);

  return (
    <section className="card border border-line bg-panel/70 p-4 text-slate-100" data-testid="objective-contribution-chart">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("contributions.title")}</h2>
        <div className="flex items-center gap-2">
          <button className="btn-ghost h-8 w-8 p-0" onClick={() => setYear((value) => value - 1)} title={t("contributions.previousYear")} type="button">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-14 text-center text-sm font-semibold text-slate-100">{year}</span>
          {year < currentYear ? (
            <button className="btn-ghost h-8 w-8 p-0" onClick={() => setYear((value) => Math.min(currentYear, value + 1))} title={t("contributions.nextYear")} type="button">
              <ChevronRight size={16} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="h-44">
        <SafeResponsiveContainer>
          <BarChart data={chartData}>
            <CartesianGrid stroke="#263844" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
            <YAxis stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 11 }} tickFormatter={(value) => money(Number(value), "EUR")} width={72} />
            <Tooltip content={<ObjectiveContributionTooltip />} />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
              {chartData.map((item) => (
                <Cell fill={item.kind === "real" ? "#34d399" : "#38bdf8"} key={item.month} />
              ))}
            </Bar>
          </BarChart>
        </SafeResponsiveContainer>
      </div>
      <div className="mt-3 flex gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />{t("contributions.real")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky" />{t("contributions.estimated")}</span>
      </div>
    </section>
  );
}
