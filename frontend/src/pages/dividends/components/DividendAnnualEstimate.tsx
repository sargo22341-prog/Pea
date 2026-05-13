import type { CurrencyCode } from "@pea/shared";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { usePrivacy } from "../../../contexts/PrivacyContext";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { SafeResponsiveContainer } from "../../../components/charts/SafeResponsiveContainer";
import { money } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";

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
  total: number;
  year: string;
  years: string[];
}

export function DividendAnnualEstimate({ currency, monthlyDividends, onYearChange, total, year, years }: DividendAnnualEstimateProps) {
  const prive = usePrivacy();

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="muted">Total annuel estime</p>
          <p className="mt-1 text-3xl font-bold text-mint">{masquerValeur(money(total, currency), prive)}</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
          <h2 className="font-semibold sm:pb-2">Prevision mensuelle</h2>
          <label className="w-full sm:w-44">
            <span className="muted mb-2 block">Annee</span>
            <select className="input" onChange={(event) => onYearChange(event.target.value)} value={year}>
              {years.map((item) => (
                <option key={item} value={item}>{item}</option>
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
            <Bar dataKey="total" fill="#22c55e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </SafeResponsiveContainer>
      </div>
    </section>
  );
}

function MonthlyDividendTooltip({
  active,
  payload,
  prive
}: {
  active?: boolean;
  payload?: Array<{ payload?: MonthlyDividend }>;
  prive: boolean;
}) {
  const month = payload?.[0]?.payload;
  if (!active || !month) return null;

  return (
    <div className="min-w-52 rounded-md border border-line bg-panel p-3 shadow-glow">
      <p className="mb-2 font-semibold capitalize">{month.label}</p>
      {month.entries.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun dividende</p>
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
        <span>Total</span>
        <span className="text-mint">{masquerValeur(money(month.total, month.currency), prive)}</span>
      </div>
    </div>
  );
}
