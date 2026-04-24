import type { HistoryPoint } from "@pea/shared";
import { Line, LineChart, ResponsiveContainer } from "recharts";

export function MiniChart({ data }: { data: HistoryPoint[] }) {
  const first = data[0]?.close ?? 0;
  const last = data[data.length - 1]?.close ?? first;
  const positive = last >= first;

  if (data.length < 2) {
    return <div className="h-10 w-24 rounded bg-panel2" />;
  }

  return (
    <div className="h-10 w-24">
      <ResponsiveContainer>
        <LineChart data={data}>
          <Line dataKey="close" dot={false} stroke={positive ? "#4ade80" : "#fb7185"} strokeWidth={2} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
