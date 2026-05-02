/**
 * Rôle du fichier : bouton de sélection/désactivation du benchmark.
 * - Inactif : icône discrète, ouvre un menu au clic.
 * - Actif : icône et label en jaune doré, désactive la comparaison au clic.
 */

import { useEffect, useRef, useState } from "react";
import { BENCHMARK_COLOR, BENCHMARKS, type BenchmarkKey } from "./benchmarks.config";

export function BenchmarkButton({
  activeBenchmark,
  onSelect
}: {
  activeBenchmark: BenchmarkKey | null;
  onSelect: (key: BenchmarkKey | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ferme le menu si l'utilisateur clique en dehors
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleButtonClick() {
    if (activeBenchmark) {
      // Comparaison active → la désactiver
      onSelect(null);
    } else {
      // Aucune comparaison → ouvrir le menu de sélection
      setOpen((prev) => !prev);
    }
  }

  function handleSelect(key: BenchmarkKey) {
    onSelect(key);
    setOpen(false);
  }

  const activeLabel = activeBenchmark ? BENCHMARKS.find((b) => b.key === activeBenchmark)?.label : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-label={activeBenchmark ? `Désactiver la comparaison (${activeLabel})` : "Comparer avec un benchmark"}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-white/10"
        onClick={handleButtonClick}
        style={{ color: activeBenchmark ? BENCHMARK_COLOR : "#94a3b8" }}
        title={activeBenchmark ? `Comparaison active : ${activeLabel} — cliquer pour désactiver` : "Comparer avec un indice de référence"}
        type="button"
      >
        {/* Icône : deux courbes superposées suggérant une comparaison */}
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
          viewBox="0 0 16 16"
        >
          <path d="M1 14 L4 8 L7 10 L10 5 L13 3" />
          <path d="M1 13 L4 11 L7 12 L10 9 L13 7" strokeDasharray="1.5 1" />
          <line x1="1" x2="15" y1="15" y2="15" strokeWidth="1" strokeOpacity="0.5" />
        </svg>

        {activeLabel && (
          <span className="hidden sm:inline" style={{ color: BENCHMARK_COLOR }}>
            {activeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[148px] rounded-lg border border-white/10 bg-[#071014] shadow-xl">
          {BENCHMARKS.map((b) => (
            <button
              className="block w-full px-4 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg"
              key={b.key}
              onClick={() => handleSelect(b.key)}
              type="button"
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
