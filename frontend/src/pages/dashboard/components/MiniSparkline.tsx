import type { PositionRangePerformance } from "@pea/shared";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { sparklinePath } from "../../../components/charts/sparklinePath";
import { localIsoDate, normalizeTimeZone, zonedTimeToUtc } from "../../../lib/timezone";

export const MiniSparkline = memo(function MiniSparkline({ miniChart, tone }: { miniChart?: PositionRangePerformance["miniChart"]; tone: "positive" | "negative" | "neutral" }) {
  const { t } = useTranslation(["dashboard"]);
  const points = miniChart?.points ?? [];
  const colorClass = tone === "positive" ? "text-mint" : tone === "negative" ? "text-coral" : "text-slate-400";

  const firstPoint = points[0];
  const lastPoint = points.at(-1);

  if (points.length < 2 || !firstPoint || !lastPoint) {
    return (
      <div className="h-9 w-[84px] sm:w-28" aria-label={t("positionRows.miniGraphUnavailable", { ns: "dashboard" })}>
        <div className="mt-[17px] h-px w-full rounded bg-line/80" />
      </div>
    );
  }

  const sessionDomain = miniChart?.range === "1d" ? miniChartSessionDomain(firstPoint.t, miniChart.marketSession) : undefined;
  const path = sparklinePath(points, { width: 112, height: 36, padding: 3 }, sessionDomain && { min: sessionDomain.open, max: sessionDomain.close });

  return (
    <svg
      aria-label={t("positionRows.miniGraph", { ns: "dashboard", range: miniChart?.range ?? "" })}
      className={`h-9 w-[84px] overflow-visible sm:w-28 ${colorClass}`}
      focusable="false"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 112 36"
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
