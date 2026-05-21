import { useTranslation } from "react-i18next";
import { money } from "../../../lib/format";
import { projectionSeries } from "./projectionChartConfig";

const labels: Record<string, { labelKey: string; color: string }> = {
  real: projectionSeries.real,
  projected: projectionSeries.projected,
  objective: projectionSeries.required
};

interface ObjectiveProjectionTooltipPayload {
  dataKey?: string | number;
  value?: number | string;
  payload?: {
    possibleMonthlyIncome?: number;
  };
}

interface ObjectiveProjectionTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ObjectiveProjectionTooltipPayload[];
}

export function ObjectiveProjectionTooltip({ active, label, payload }: ObjectiveProjectionTooltipProps) {
  const { t } = useTranslation("objectives");
  if (!active || !payload?.length) return null;
  const possibleMonthlyIncome = payload.find((item) => item.payload?.possibleMonthlyIncome !== undefined)?.payload?.possibleMonthlyIncome;

  return (
    <div className="max-w-72 rounded-lg border border-line bg-panel p-3 text-sm shadow-xl">
      <p className="mb-2 font-semibold text-slate-100">{label}</p>
      <div className="space-y-1">
        {payload
          .filter((item) => item.value !== undefined && item.dataKey && labels[String(item.dataKey)])
          .map((item) => {
            const config = labels[String(item.dataKey)];
            return (
              <div className="flex items-center justify-between gap-4" key={String(item.dataKey)}>
                <span className="inline-flex items-center gap-2 text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                  {t(config.labelKey)}
                </span>
                <span className="font-semibold text-slate-50">{money(Number(item.value), "EUR")}</span>
              </div>
            );
          })}
      </div>
      {payload.some((item) => item.dataKey === "objective") ? (
        <p className="mt-3 border-t border-line/70 pt-2 text-xs text-slate-400">
          {t(projectionSeries.required.descriptionKey)}
        </p>
      ) : null}
      {possibleMonthlyIncome !== undefined ? (
        <p className="mt-2 text-xs text-emerald-200">
          {t("chart.possibleIncome", { amount: money(possibleMonthlyIncome, "EUR") })}
        </p>
      ) : null}
    </div>
  );
}
