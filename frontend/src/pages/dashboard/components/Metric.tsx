import type { LucideIcon } from "lucide-react";
import { InfoHint } from "../../../components/common/disclosure/InfoHint";

export function Metric({
  icon: Icon,
  label,
  value,
  tone,
  hint,
  loading = false
}: {
  icon: LucideIcon;
  label: string;
  value?: string | undefined;
  tone?: "positive" | "negative" | undefined;
  /** Définition affichée au survol d'une icône ⓘ à côté du libellé. */
  hint?: string | undefined;
  loading?: boolean;
}) {
  return (
    <div className="card min-h-[112px] min-w-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="muted flex min-w-0 items-center gap-1">
          <span className="truncate">{label}</span>
          {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
        </p>
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
