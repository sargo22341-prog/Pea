import type { ObjectiveAssumptions, ObjectiveConfig, ObjectiveDto, ObjectiveProjection } from "@pea/shared";
import type { ObjectiveRow } from "../../repositories/objectives/objectives.repository.js";

const emptyProjection: ObjectiveProjection = {
  status: "missing_data",
  missingData: [],
  series: [],
  contributions: []
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function mapObjective(row: ObjectiveRow): ObjectiveDto {
  const projection = parseJson<ObjectiveProjection>(row.projection_json, emptyProjection);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: row.title,
    type: row.type,
    active: Boolean(row.active),
    config: parseJson<ObjectiveConfig>(row.config_json, {}),
    assumptions: parseJson<ObjectiveAssumptions>(row.assumptions_json, {
      futureMonthlySavings: null,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      withdrawalRate: 4,
      projectionEndAge: 90,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projection: {
      ...projection,
      lastUpdatedAt: projection.lastUpdatedAt ?? row.last_updated_at ?? undefined,
      nextUpdateAt: projection.nextUpdateAt ?? row.next_update_at ?? undefined
    }
  };
}
