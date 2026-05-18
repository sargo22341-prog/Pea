import { PlusCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function EmptyState() {
  const { t } = useTranslation(["common", "dashboard"]);

  return (
    <div className="card flex min-h-[260px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-panel2 p-4 text-mint">
        <PlusCircle size={32} />
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t("dashboard:empty.title")}</h2>
        <p className="mt-2 max-w-md text-sm text-slate-400">{t("dashboard:empty.description")}</p>
      </div>
      <Link className="btn-primary" to="/search">
        {t("common:actions.addPosition")}
      </Link>
    </div>
  );
}
