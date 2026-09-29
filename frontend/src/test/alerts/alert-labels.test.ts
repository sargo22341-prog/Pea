import type { AlertEvent } from "@pea/shared";
import { describe, expect, it } from "vitest";
import { describeAlert, describeEvent } from "../../components/common/alerts/alert-labels";
import { i18n } from "../../i18n";

const dailyChange: AlertEvent = {
  id: 1,
  alertId: 1,
  symbol: "TTE.PA",
  assetName: "TotalEnergies",
  type: "daily_change",
  triggeredAt: "2026-09-29T10:00:00.000Z",
  payload: { changePercent: -5.234, threshold: 2.5 },
  read: false
};

describe("alert labels", () => {
  it("formats percentages with the application number format", () => {
    const t = i18n.getFixedT("fr");
    expect(describeEvent(dailyChange, t)).toMatch(/^Variation du jour : -5,23\s%$/);
    expect(describeAlert("daily_change", { threshold: 2.5 }, "EUR", t)).toContain("2,5 %");
  });
});
