import type { PositionRangePerformance } from "@pea/shared";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { localIsoDate, normalizeTimeZone, zonedTimeToUtc } from "../../../lib/timezone";

export const MiniSparkline = memo(function MiniSparkline({ miniChart, tone }: { miniChart?: PositionRangePerformance["miniChart"]; tone: "positive" | "negative" | "neutral" }) {
  const { t } = useTranslation(["dashboard"]);
  const points = miniChart?.points ?? [];
  const colorClass = tone === "positive" ? "text-mint" : tone === "negative" ? "text-coral" : "text-slate-400";

  if (points.length < 2) {
    return (
      <div className="h-9 w-[84px] sm:w-28" aria-label={t("positionRows.miniGraphUnavailable", { ns: "dashboard" })}>
        <div className="mt-[17px] h-px w-full rounded bg-line/80" />
      </div>
    );
  }

  const width = 112;
  const height = 36;
  const padding = 3;
  const sessionDomain = miniChart?.range === "1d" ? miniChartSessionDomain(points[0].t, miniChart.marketSession) : undefined;
  const minT = sessionDomain?.open ?? points[0].t;
  const maxT = sessionDomain?.close ?? points[points.length - 1].t;
  const values = points.map((point) => point.v);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const spanT = maxT - minT || 1;
  const spanV = maxV - minV || 1;
  const path = points
    .map((point, index) => {
      const x = padding + ((point.t - minT) / spanT) * (width - padding * 2);
      const y = height - padding - ((point.v - minV) / spanV) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-label={t("positionRows.miniGraph", { ns: "dashboard", range: miniChart?.range ?? "" })}
      className={`h-9 w-[84px] overflow-visible sm:w-28 ${colorClass}`}
      focusable="false"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

function miniChartSessionDomain(firstTimestamp: number, marketSession?: PositionRangePerformance["miniChart"]["marketSession"]) {
  if (!marketSession) return undefined;
  const timeZone = normalizeTimeZone(marketSession.timezone);
  const day = localIsoDate(new Date(firstTimestamp), timeZone);
  return {
    open: zonedTimeToUtc(day, marketSession.open, timeZone).getTime(),
    close: zonedTimeToUtc(day, marketSession.close, timeZone).getTime()
  };
}
