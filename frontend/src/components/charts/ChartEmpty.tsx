import { useTranslation } from "react-i18next";

export function ChartEmpty({ label }: { label?: string }) {
  const { t } = useTranslation(["dashboard"]);

  return (
    <div className="flex h-72 items-center justify-center rounded-lg border border-line/60 text-sm text-slate-400">
      {label ?? t("chart.empty", { ns: "dashboard" })}
    </div>
  );
}
