import { useTranslation } from "react-i18next";

const OPERATION_FILTERS = ["all", "buy", "sell", "dividend"] as const;
export type OperationFilterValue = (typeof OPERATION_FILTERS)[number];

/** Filtre de la liste des opérations d'une position : Tous / Achats / Ventes / Dividendes. */
export function OperationFilter({ value, onChange }: { value: OperationFilterValue; onChange: (value: OperationFilterValue) => void }) {
  const { t } = useTranslation("portfolio");
  return (
    <div aria-label={t("position.filters.filterLabel")} className="flex flex-wrap gap-1" role="group">
      {OPERATION_FILTERS.map((filter) => (
        <button aria-pressed={value === filter} className={value === filter ? "btn-primary px-3 py-1 text-xs" : "btn-ghost px-3 py-1 text-xs"} key={filter} onClick={() => { onChange(filter); }} type="button">
          {t(`position.filters.${filter}`)}
        </button>
      ))}
    </div>
  );
}
