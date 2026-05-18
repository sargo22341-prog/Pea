import type { YahooUsageBucketDto } from "@pea/shared";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { SafeResponsiveContainer } from "../../../../components/charts/SafeResponsiveContainer";
import { chartBucketPayload } from "./yahooUsageUtils";

export function YahooUsageChart({ data, onSelect, title }: { data: YahooUsageBucketDto[]; onSelect: (bucket: YahooUsageBucketDto) => void; title: string }) {
  const { t } = useTranslation(["common"]);
  return (
    <section className="rounded-md border border-line bg-panel2/40 p-3">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">{title}</h3>
      <div className="h-64">
        {data.length ? (
          <SafeResponsiveContainer>
            <BarChart data={data} margin={{ bottom: 8, left: 0, right: 12, top: 8 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis dataKey="key" minTickGap={24} stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#071014", border: "1px solid #1f2937", borderRadius: 6 }} />
              <Bar dataKey="calls" fill="#38bdf8" onClick={(bucket) => onSelect(chartBucketPayload(bucket))} radius={[4, 4, 0, 0]} />
            </BarChart>
          </SafeResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">{t("admin.yahooUsage.noData", { ns: "common" })}</div>
        )}
      </div>
    </section>
  );
}
