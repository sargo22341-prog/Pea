/**
 * Role du fichier : fournir la tuile de metrique reutilisee dans l'en-tete du
 * Dashboard, avec son etat de chargement et sa tonalite visuelle.
 */

import type { LucideIcon } from "lucide-react";

export function Metric({
  icon: Icon,
  label,
  value,
  tone,
  loading = false
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  tone?: "positive" | "negative";
  loading?: boolean;
}) {
  return (
    <div className="card min-h-[112px] min-w-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="muted truncate">{label}</p>
        <Icon className="shrink-0 text-sky" size={20} />
      </div>
      {loading ? (
        <div className="h-6 w-28 max-w-full animate-pulse rounded bg-panel2 sm:h-7" />
      ) : (
        <p className={`break-words text-lg font-bold sm:text-xl ${tone === "positive" ? "text-mint" : tone === "negative" ? "text-coral" : ""}`}>
          {value}
        </p>
      )}
    </div>
  );
}
