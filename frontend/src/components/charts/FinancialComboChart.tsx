import type { FinancialYearItem } from "@pea/shared";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Props as LabelProps } from "recharts/types/component/Label";
import { ChartEmpty } from "./ChartEmpty";
import { compactMoney, formatPercent } from "./chartFormat";

function MarginLabel({ x, y, value }: LabelProps) {
  if (x === undefined || y === undefined || value === undefined) return null;

  return (
    <text fill="#f8fafc" fontSize={11} fontWeight={700} textAnchor="middle" x={Number(x)} y={Number(y) - 12}>
      {formatPercent(Number(value))}
    </text>
  );
}

export function FinancialComboChart({ data }: { data: FinancialYearItem[] }) {
  if (!data.length) return <ChartEmpty label="Aucune donnée financière annuelle disponible." />;

  return (
    <div className="h-[420px] min-w-0">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ bottom: 8, left: 0, right: 8, top: 34 }}>
          <CartesianGrid stroke="#263844" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="year" tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(value) => compactMoney(Number(value))} yAxisId="amount" />
          <YAxis orientation="right" tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(value) => formatPercent(Number(value))} yAxisId="margin" />
          <Tooltip
            contentStyle={{ background: "rgba(7, 16, 20, 0.95)", border: "1px solid #263844", borderRadius: 8 }}
            formatter={(value, name) => (name === "Marge nette" ? formatPercent(Number(value)) : compactMoney(Number(value)))}
            labelFormatter={(value) => String(value)}
            labelStyle={{ color: "#f8fafc" }}
          />
          <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
          <Bar dataKey="revenue" fill="#38bdf8" name="Revenue" radius={[6, 6, 0, 0]} yAxisId="amount" />
          <Bar dataKey="netIncome" fill="#4ade80" name="Net Income" radius={[6, 6, 0, 0]} yAxisId="amount" />
          <Line
            dataKey="netMargin"
            dot={{ fill: "#d4af37", r: 4 }}
            label={<MarginLabel />}
            name="Marge nette"
            stroke="#d4af37"
            strokeWidth={3}
            type="monotone"
            yAxisId="margin"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
