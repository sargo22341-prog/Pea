/**
 * Onglets compacts à l'intérieur d'une carte (Annuel / Trimestriel, Résultats / Bilan...).
 * Même gabarit que le sélecteur de période du graphique.
 */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div aria-label={ariaLabel} className="inline-flex h-9 max-w-full overflow-x-auto rounded-md border border-line bg-panel2 p-0.5" role="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-selected={selected}
            className={`shrink-0 rounded px-3 text-xs font-semibold transition ${selected ? "bg-sky/15 text-sky" : "text-slate-400 hover:text-slate-200"}`}
            key={option.value}
            onClick={() => { onChange(option.value); }}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
