import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export function NewsPagination({
  currentPage,
  onChange,
  totalPages
}: {
  currentPage: number;
  onChange: (page: number) => void;
  totalPages: number;
}) {
  const { t } = useTranslation("navigation");
  return (
    <div className="flex items-center justify-end gap-3">
      <button className="btn-ghost" disabled={currentPage <= 1} onClick={() => { onChange(currentPage - 1); }} type="button">
        <ChevronLeft size={17} />
        {t("newsPreviousPage")}
      </button>
      <span className="text-sm text-slate-400">
        {t("newsPageOf", { page: currentPage, total: totalPages })}
      </span>
      <button className="btn-ghost" disabled={currentPage >= totalPages} onClick={() => { onChange(currentPage + 1); }} type="button">
        {t("newsNextPage")}
        <ChevronRight size={17} />
      </button>
    </div>
  );
}
