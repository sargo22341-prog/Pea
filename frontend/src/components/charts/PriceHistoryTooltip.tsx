import { money } from "../../lib/format";
import { masquerValeur } from "../../lib/privacy";

export type ChartTooltipPayload = ReadonlyArray<{
  dataKey?: string | number | ((obj: unknown) => unknown);
  name?: string | number;
  payload?: unknown;
  value?: unknown;
}>;

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

  return (
    <div className="rounded-lg border-0 bg-ink/80 p-3 text-xs text-slate-200 shadow-lg backdrop-blur">
      <p className="mb-2 font-medium text-slate-300">{labelFormatter(typeof label === "number" || typeof label === "string" ? label : "")}</p>
      {valuePayload?.value != null && (
        <p className="mb-2 text-slate-100">{masquerValeur(money(Number(valuePayload.value), currency), maskValues)}</p>
      )}
    </div>
  );
}
