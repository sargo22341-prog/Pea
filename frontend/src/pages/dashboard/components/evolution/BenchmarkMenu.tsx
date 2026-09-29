import { Landmark } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_COMPARE } from "../../../../components/charts/comparison/compare-limits";
import { MOTION } from "../../../../components/common/motion";
import { useDismiss } from "../../../../hooks/useDismiss";
import type { ComparableAsset } from "../../../../hooks/useAssetComparisonSeries";
import { DEFAULT_BENCHMARKS } from "./benchmarks";

/**
 * Raccourci « Comparer à un indice » de l'évolution du portefeuille. Aucun indice n'est actif par
 * défaut ; les indices cochés partagent la limite de séries de la comparaison libre.
 */
export function BenchmarkMenu({ selected, onToggle }: { selected: readonly ComparableAsset[]; onToggle: (benchmark: ComparableAsset) => void }) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); }, []);
  const selectedSymbols = new Set(selected.map((target) => target.symbol));
  const activeCount = DEFAULT_BENCHMARKS.filter((benchmark) => selectedSymbols.has(benchmark.symbol)).length;
  const full = selected.length >= MAX_COMPARE;

  useDismiss(open, containerRef, close);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t("benchmarks.label")}
        className={activeCount ? "btn bg-sky/15 text-sky" : "btn-ghost"}
        onClick={() => { setOpen((current) => !current); }}
        title={t("benchmarks.label")}
        type="button"
      >
        <Landmark size={17} />
        {activeCount || null}
      </button>
      {open ? (
        <div className={`absolute right-0 z-30 mt-2 w-60 rounded-lg border border-line bg-panel p-2 shadow-glow ${MOTION.menu}`} role="menu">
          <p className="px-2 pb-1 text-xs text-slate-400">{t("benchmarks.hint")}</p>
          {DEFAULT_BENCHMARKS.map((benchmark) => {
            const checked = selectedSymbols.has(benchmark.symbol);
            const disabled = !checked && full;
            return (
              <label className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-panel2"}`} key={benchmark.symbol}>
                <input checked={checked} disabled={disabled} onChange={() => { onToggle(benchmark); }} role="menuitemcheckbox" type="checkbox" />
                {benchmark.name}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
