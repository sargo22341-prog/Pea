import type { CalendarEvent } from "@pea/shared";
import { describe, expect, it } from "vitest";
import { currentMonth, eventFamily, groupEventsByDay, monthGridDays, monthRange, shiftMonth } from "../../pages/calendar/calendar-grid";

describe("calendar grid", () => {
  it("covers whole weeks from Monday to Sunday around the month", () => {
    const days = monthGridDays("2026-09");
    expect(days[0]).toEqual({ day: "2026-08-31", inMonth: false });
    expect(days.at(-1)).toEqual({ day: "2026-10-04", inMonth: false });
    expect(days).toHaveLength(35);
    expect(days.filter((day) => day.inMonth)).toHaveLength(30);
    expect(monthRange("2026-02")).toEqual({ from: "2026-01-26", to: "2026-03-01" });
  });

  it("moves across years and reads the current month in the application time zone", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(currentMonth("Europe/Paris", new Date("2026-09-30T22:30:00.000Z"))).toBe("2026-10");
  });

  it("groups events by civil day and files earnings calls with earnings", () => {
    const event = (id: number, eventDate: string): CalendarEvent => ({ id, symbol: "AI.PA", eventType: "earnings", eventDate, isEstimate: false, assetName: "Air Liquide" });
    const byDay = groupEventsByDay([event(1, "2026-09-02T00:00:00.000Z"), event(2, "2026-09-02T15:00:00.000Z"), event(3, "invalid")], "America/New_York");
    expect([...byDay.keys()]).toEqual(["2026-09-02"]);
    expect(byDay.get("2026-09-02")?.map((item) => item.id)).toEqual([1, 2]);
    expect(eventFamily("earnings_call")).toBe("earnings");
  });
});
