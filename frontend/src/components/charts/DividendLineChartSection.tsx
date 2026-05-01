import type { AssetMarketInfo, DividendEvent } from "@pea/shared";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Props as LabelProps } from "recharts/types/component/Label";
import { formatMaybeDate, formatMonthYear, formatPlainPercent, money } from "../../lib/format";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

type DividendChartPoint = {
  date: string;
  amount: number;
  currency: string;
  status: DividendEvent["status"];
};

export function DividendLineChartSection({
  dividends,
  marketInfo,
  currentPrice,
  averageBuyPrice
}: {
  dividends: DividendEvent[];
  marketInfo?: AssetMarketInfo;
  currentPrice?: number;
  averageBuyPrice?: number;
}) {
  const currentYear = new Date().getUTCFullYear();
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(currentYear - 5);
  const chartEvents = mergeMarketDividend(dividends, marketInfo, currentYear);

  const chartData = chartEvents
    .filter((event) => {
      const date = new Date(event.date);
      return Number.isFinite(date.getTime()) && date >= fiveYearsAgo && Number.isFinite(event.amount);
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((event) => ({
      date: event.date,
      amount: event.amount,
      currency: event.currency,
      status: event.status
    }));

  if (chartData.length === 0) return null;

  const marketDividendState = marketDividendYearState(marketInfo, currentYear);
  const annualDividendPerShare =
    marketDividendState === "outdated"
      ? 0
      : marketDividendState === "current" && Number.isFinite(marketInfo?.dividendRate) && Number(marketInfo?.dividendRate) > 0
        ? Number(marketInfo?.dividendRate)
        : chartEvents.reduce((total, event) => {
            const date = new Date(event.date);
            if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== currentYear || !Number.isFinite(event.amount)) return total;
            return total + event.amount;
          }, 0);

  const marketYield = currentPrice && currentPrice > 0 ? (annualDividendPerShare / currentPrice) * 100 : undefined;
  const personalYield = averageBuyPrice && averageBuyPrice > 0 ? (annualDividendPerShare / averageBuyPrice) * 100 : undefined;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-white/[0.06] p-4">
        <h2 className="text-2xl font-bold text-white">
          {formatPlainPercent(marketYield)}
          <span className="ml-2 text-base font-semibold text-amber">({formatPlainPercent(personalYield)} sur PRU)</span>
        </h2>
      </div>
      <div className="h-[320px] min-w-0 px-1 py-4 sm:h-[360px] sm:px-3">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ bottom: 8, left: 0, right: 20, top: 36 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" vertical={false} />

            <XAxis
              axisLine={false}
              dataKey="date"
              padding={{ left: 20, right: 20 }}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              tickFormatter={(value) => formatMonthYear(String(value))}
              tickLine={false}
            />

            <YAxis hide domain={["auto", "auto"]} />

            <Tooltip
              contentStyle={{
                background: "rgba(7, 16, 20, 0.9)",
                border: "1px solid rgba(212, 175, 55, 0.22)",
                borderRadius: 8,
                boxShadow: "0 18px 40px rgba(0,0,0,0.35)"
              }}
              formatter={(value, _name, item) => money(Number(value), (item.payload as DividendChartPoint).currency)}
              labelFormatter={(value, payload) => {
                const point = payload?.[0]?.payload as DividendChartPoint | undefined;
                const suffix = point?.status === "estimated" ? " (infos marche)" : "";
                return `${formatMaybeDate(String(value))}${suffix}`;
              }}
              labelStyle={{ color: "#f8fafc" }}
            />

            <Line
              activeDot={false}
              dataKey="amount"
              dot={false}
              label={<DividendPointLabel />}
              name="Dividende / action"
              stroke="#d4af37"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              type="monotone"
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </section>
  );
}

function mergeMarketDividend(dividends: DividendEvent[], marketInfo: AssetMarketInfo | undefined, currentYear: number): DividendEvent[] {
  const marketDividend = marketDividendEvent(dividends, marketInfo, currentYear);
  if (!marketDividend) return dividends;
  return [...dividends, marketDividend];
}

function marketDividendEvent(dividends: DividendEvent[], marketInfo: AssetMarketInfo | undefined, currentYear: number): DividendEvent | undefined {
  const amount = marketInfo?.dividendRate;
  const exDate = marketInfo?.exDividendDate;
  if (!exDate) return undefined;

  const parsedExDate = new Date(exDate);
  if (!Number.isFinite(parsedExDate.getTime())) return undefined;
  const exDateYear = parsedExDate.getUTCFullYear();
  const currentYearDividends = dividendsForYear(dividends, currentYear);
  const hasCurrentYearEvent = currentYearDividends.length > 0;
  const currency = marketInfo.currency ?? dividends[0]?.currency ?? "EUR";

  if (exDateYear !== currentYear) {
    if (hasCurrentYearEvent) return undefined;
    return {
      symbol: dividends[0]?.symbol ?? "",
      date: currentYearDateFor(parsedExDate, currentYear),
      amount: 0,
      currency,
      status: "estimated"
    };
  }

  if (!Number.isFinite(amount) || Number(amount) <= 0) return undefined;

  const sameDay = dividends.some((event) => sameUtcDay(event.date, parsedExDate));
  if (sameDay) return undefined;

  const knownCurrentYearAmount = latestDividendAmount(currentYearDividends);
  const fractionCount = knownCurrentYearAmount === undefined ? previousYearDividendCount(dividends, currentYear) : 0;
  const eventAmount = knownCurrentYearAmount ?? (fractionCount > 1 ? Number(amount) / fractionCount : Number(amount));

  return {
    symbol: dividends[0]?.symbol ?? "",
    date: parsedExDate.toISOString(),
    amount: eventAmount,
    currency,
    status: "estimated"
  };
}

function marketDividendYearState(marketInfo: AssetMarketInfo | undefined, currentYear: number) {
  if (!marketInfo?.exDividendDate) return "unknown";
  const exDate = new Date(marketInfo.exDividendDate);
  if (!Number.isFinite(exDate.getTime())) return "unknown";
  return exDate.getUTCFullYear() === currentYear ? "current" : "outdated";
}

function currentYearDateFor(date: Date, currentYear: number) {
  return new Date(Date.UTC(currentYear, date.getUTCMonth(), date.getUTCDate(), 12)).toISOString();
}

function previousYearDividendCount(dividends: DividendEvent[], currentYear: number) {
  return dividendsForYear(dividends, currentYear - 1).length;
}

function dividendsForYear(dividends: DividendEvent[], year: number) {
  return dividends.filter((event) => {
    const date = new Date(event.date);
    return Number.isFinite(date.getTime()) && date.getUTCFullYear() === year && Number.isFinite(event.amount);
  });
}

function latestDividendAmount(dividends: DividendEvent[]) {
  const latest = [...dividends].sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest ? Number(latest.amount) : undefined;
}

function sameUtcDay(value: string, expected: Date) {
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === expected.getUTCFullYear() &&
    date.getUTCMonth() === expected.getUTCMonth() &&
    date.getUTCDate() === expected.getUTCDate()
  );
}

function DividendPointLabel({ x, y, value, payload }: LabelProps & { payload?: DividendChartPoint }) {
  if (x === undefined || y === undefined || value === undefined) return null;
  const currency = payload?.currency ?? "EUR";

  return (
    <text fill="#f8fafc" fontSize={11} fontWeight={700} textAnchor="middle" x={Number(x)} y={Number(y) - 14}>
      {money(Number(value), currency)}
    </text>
  );
}
