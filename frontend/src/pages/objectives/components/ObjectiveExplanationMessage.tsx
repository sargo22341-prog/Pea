import type { ObjectiveDto, ObjectiveProjection } from "@pea/shared";
import { useTranslation } from "react-i18next";

function roundedAge(age?: number) {
  return age === undefined ? undefined : Math.round(age);
}

function maxProjectionAge(projection: ObjectiveProjection) {
  return projection.series.reduce<number | undefined>((maxAge, point) => {
    if (point.projected === undefined || point.age === undefined) return maxAge;
    return maxAge === undefined ? point.age : Math.max(maxAge, point.age);
  }, undefined);
}

export function ObjectiveExplanationMessage({ objective, projection }: { objective: ObjectiveDto; projection: ObjectiveProjection }) {
  const { t } = useTranslation("objectives");
  const summary = projection.summary;
  if (!summary) return null;

  const isAnnuity = objective.type !== "fixed_capital";
  const reachedAge = roundedAge(summary.reachedAge);
  const horizonAge = roundedAge(maxProjectionAge(projection));

  return (
    <section className="rounded-lg border border-sky/30 bg-sky/10 p-4 text-sm text-sky-50">
      {reachedAge !== undefined
        ? t(isAnnuity ? "summaryMessage.annuityReachable" : "summaryMessage.fixedReachable", {
          age: reachedAge,
          returnRate: objective.assumptions.annualReturnRate
        })
        : t("summaryMessage.unreachable", {
          age: horizonAge ?? objective.assumptions.projectionEndAge ?? 90
        })}
    </section>
  );
}
