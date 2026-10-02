import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Signale les articles arrivés pendant la lecture ; la liste n'est mise à jour qu'au clic. */
export function NewArticlesButton({ count, onShow }: { count: number; onShow: () => void }) {
  const { t } = useTranslation("navigation");
  if (count <= 0) return null;
  return (
    <div className="flex justify-center">
      <button className="btn-ghost border border-sky text-sky" onClick={onShow} type="button">
        <ArrowUp size={16} />
        {t("newArticles", { count })}
      </button>
    </div>
  );
}
