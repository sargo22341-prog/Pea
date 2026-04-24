import { formatChartTime } from "./format";

const PARIS_OPEN = "09:00";
const PARIS_CLOSE = "17:30";

function timeToMinutes(time: string) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function formatMinutes(minutes: number) {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    return `${h}:${m}`;
}

function toParisMinutes(date = new Date()) {
    const parts = new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(date);

    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

    return hour * 60 + minute;
}

function roundDownToStep(minutes: number, step = 30) {
    return Math.floor(minutes / step) * step;
}

export function buildOneDayChartData(history: any[], step = 30) {
    const openMinutes = timeToMinutes(PARIS_OPEN);
    const closeMinutes = timeToMinutes(PARIS_CLOSE);

    const nowMinutes = toParisMinutes();
    const cutoffMinutes = Math.min(
        Math.max(roundDownToStep(nowMinutes, step), openMinutes),
        closeMinutes
    );

    const historyMap = new Map<string, number>();

    history.forEach((point) => {
        const time = formatChartTime(String(point.date)); // doit retourner "15:30"
        historyMap.set(time, Number(point.close));
    });

    const chartData = [];

    for (let minutes = openMinutes; minutes <= closeMinutes; minutes += step) {
        const time = formatMinutes(minutes);

        chartData.push({
            date: time,
            close: minutes <= cutoffMinutes ? historyMap.get(time) ?? null : null,
        });
    }

    return chartData;
}

export type ChartPoint = {
    date: string;
    close: number | null;
};

export function getTrend(chartData: ChartPoint[]): "up" | "down" | "neutral" {
    const valid = chartData.filter(
        (point): point is { date: string; close: number } => point.close !== null
    );

    if (valid.length < 2) return "neutral";

    const first = valid[0].close;
    const last = valid[valid.length - 1].close;

    if (last > first) return "up";
    if (last < first) return "down";

    return "neutral";
}