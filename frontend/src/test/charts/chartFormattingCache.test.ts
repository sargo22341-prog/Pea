import type { MarketSessionDto } from "@pea/shared";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { compactMoney, formatPercent } from "../../components/charts/chartFormat";
import { useChartDataModel } from "../../components/charts/useChartDataModel";
import { localIsoDate, normalizeTimeZone, zonedTimeToUtc } from "../../lib/timezone";

const OriginalDateTimeFormat = Intl.DateTimeFormat;
const OriginalNumberFormat = Intl.NumberFormat;

function countConstructions() {
  const counts = { dateTime: 0, number: 0 };
  Intl.DateTimeFormat = function (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
    counts.dateTime += 1;
    return new OriginalDateTimeFormat(...args);
  } as unknown as typeof Intl.DateTimeFormat;
  Intl.NumberFormat = function (...args: ConstructorParameters<typeof Intl.NumberFormat>) {
    counts.number += 1;
    return new OriginalNumberFormat(...args);
  } as unknown as typeof Intl.NumberFormat;
  return counts;
}

describe("chart formatting caches", () => {
  afterEach(() => {
    Intl.DateTimeFormat = OriginalDateTimeFormat;
    Intl.NumberFormat = OriginalNumberFormat;
  });

  it("reuses timezone formatters while keeping DST-correct conversions", () => {
    const counts = countConstructions();
    for (let index = 0; index < 300; index += 1) {
      expect(zonedTimeToUtc("2026-07-01", "09:00", "Asia/Tokyo").toISOString()).toBe("2026-07-01T00:00:00.000Z");
      expect(localIsoDate(new Date("2026-01-05T23:30:00.000Z"), "Asia/Tokyo")).toBe("2026-01-06");
    }
    expect(zonedTimeToUtc("2026-01-05", "09:00", "Europe/Paris").toISOString()).toBe("2026-01-05T08:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-01", "09:00", "Europe/Paris").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(counts.dateTime).toBeLessThanOrEqual(6);
  });

  it("falls back to Paris for an unknown timezone and remembers the answer", () => {
    const counts = countConstructions();
    expect(normalizeTimeZone("Mars/Olympus")).toBe("Europe/Paris");
    expect(normalizeTimeZone("Mars/Olympus")).toBe("Europe/Paris");
    expect(normalizeTimeZone("  ")).toBe("Europe/Paris");
    expect(counts.dateTime).toBeLessThanOrEqual(2);
  });

  it("formats percentages and compact amounts without rebuilding number formatters", () => {
    const counts = countConstructions();
    const outputs = Array.from({ length: 200 }, (_value, index) => formatPercent(index / 10));
    expect(outputs[15]?.replace(/\s/g, " ")).toBe("1,5 %");
    expect(formatPercent(Number.NaN).replace(/\s/g, " ")).toBe("0 %");
    expect(compactMoney(1_250_000).replace(/\s/g, " ")).toMatch(/1,3 M/);
    expect(counts.number).toBeLessThanOrEqual(2);
  });

  it("keeps the intraday chart data reference stable across renders", () => {
    const session: MarketSessionDto = { timezone: "Europe/Paris", city: "Paris", open: "09:00", close: "17:30", sessions: [{ open: "09:00", close: "17:30" }] };
    const data = [{ date: "2026-07-01T08:00:00.000Z", value: 10 }, { date: "2026-07-01T09:00:00.000Z", value: 11 }];
    const { result, rerender } = renderHook(() => useChartDataModel({ data, marketSession: session, range: "1d" }));
    const first = result.current.timeChartData;
    rerender();

    expect(result.current.timeChartData).toBe(first);
    expect(first.map((point) => point.value)).toEqual([null, 10, 11, null]);
  });
});
