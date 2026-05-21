import type { ObjectiveMissingData } from "@pea/shared";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ObjectiveMissingDataState({ items }: { items: ObjectiveMissingData[] }) {
  const { t } = useTranslation("objectives");
  return (
    <section className="rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm text-amber-50">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <AlertCircle size={18} />
        {t("missing.title")}
      </div>
      <p className="mb-3 text-slate-200">{t("missing.description")}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item.field} className="rounded-md border border-amber/30 bg-black/20 px-2 py-1 text-xs">
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}
