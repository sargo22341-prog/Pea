import { useTranslation } from "react-i18next";
import { money } from "../../../lib/format";

interface ContributionTooltipPayload {
  value?: number | string;
  payload?: {
    kind?: "real" | "estimated";
  };
}

export function ObjectiveContributionTooltip({
  active,
  label,
  payload
}: {
  active?: boolean;
  label?: string | number;
  payload?: ContributionTooltipPayload[];
}) {
  const { t } = useTranslation("objectives");
  const item = payload?.[0];
  if (!active || !item) return null;
  const kind = item.payload?.kind === "real" ? t("contributions.real") : t("contributions.estimated");

  return (
    <div className="rounded-lg border border-line bg-panel p-3 text-sm text-slate-100 shadow-xl">
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-slate-300">{kind}</p>
      <p className="mt-1 font-bold text-slate-50">{money(Number(item.value), "EUR")}</p>
    </div>
  );
}
