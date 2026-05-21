import { Target } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ObjectiveEmptyState() {
  const { t } = useTranslation("objectives");
  return (
    <section className="card grid min-h-72 place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <Target className="mx-auto text-sky" size={32} />
        <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
        <p className="muted">{t("empty.description")}</p>
      </div>
    </section>
  );
}
