/**
 * Role du fichier : afficher les controles de pagination du mode d'actualites
 * actuellement actif.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";

export function NewsPagination({
  currentPage,
  onChange,
  totalPages
}: {
  currentPage: number;
  onChange: (page: number) => void;
  totalPages: number;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      <button className="btn-ghost" disabled={currentPage <= 1} onClick={() => onChange(currentPage - 1)} type="button">
        <ChevronLeft size={17} />
        Precedent
      </button>
      <span className="text-sm text-slate-400">
        Page {currentPage} / {totalPages}
      </span>
      <button className="btn-ghost" disabled={currentPage >= totalPages} onClick={() => onChange(currentPage + 1)} type="button">
        Suivant
        <ChevronRight size={17} />
      </button>
    </div>
  );
}
