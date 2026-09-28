import type { AssetInsights } from "@pea/shared";
import type { TFunction } from "i18next";

const LEVEL_COLORS = { support: "#4ade80", resistance: "#fb7185", stopLoss: "#fbbf24" } as const;

/** Niveaux techniques à tracer sur le graphique de cours. */
export function chartReferenceLevels(insights: AssetInsights, t: TFunction<"asset">) {
  return (Object.keys(LEVEL_COLORS) as (keyof typeof LEVEL_COLORS)[]).flatMap((key) => {
    const value = insights[key];
    return value === undefined ? [] : [{ key, label: t(`insights.${key}`), value, color: LEVEL_COLORS[key] }];
  });
}

export function hasChartLevels(insights: AssetInsights | null) {
  return insights !== null && (insights.support !== undefined || insights.resistance !== undefined || insights.stopLoss !== undefined);
}
