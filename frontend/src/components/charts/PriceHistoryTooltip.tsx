import { money } from "../../lib/format";
import { masquerValeur } from "../../lib/privacy";
import { tooltipLabel, tooltipNumberValue, type ChartTooltipPayload } from "./rechartsTypes";

export type { ChartTooltipPayload } from "./rechartsTypes";

export function HistoryTooltip({
  active,
  payload,
  label,
  currency,
  labelFormatter,
  maskValues = false
}: {
  active?: boolean;
  payload?: ChartTooltipPayload;
  label?: unknown;
  currency: string;
  labelFormatter: (value: string | number) => string;
  maskValues?: boolean;
}) {
  if (!active) return null;
  const valuePayload = payload?.find((item) => item.dataKey === "value");
  const valueNumber = tooltipNumberValue(valuePayload?.value);

  return (
    <div className="rounded-lg border-0 bg-ink/80 p-3 text-xs text-slate-200 shadow-lg backdrop-blur">
      <p className="mb-2 font-medium text-slate-300">{labelFormatter(tooltipLabel(label))}</p>
      {valueNumber !== undefined && (
        <p className="mb-2 text-slate-100">{masquerValeur(money(valueNumber, currency), maskValues)}</p>
      )}
    </div>
  );
}
