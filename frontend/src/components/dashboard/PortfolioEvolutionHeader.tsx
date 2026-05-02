/**
 * Role du fichier : partager l'en-tete du bloc d'evolution entre l'etat charge
 * et le skeleton, afin de garder un rendu identique.
 * Le bouton benchmark est positionné à droite du titre, avant le sélecteur de range.
 */

import type { RangeKey } from "@pea/shared";
import { BenchmarkButton } from "./benchmark/BenchmarkButton";
import type { BenchmarkKey } from "./benchmark/benchmarks.config";
import { RangeSelector } from "../common/RangeSelector";
import type { DashboardRangeSetter } from "./types";

export function PortfolioEvolutionHeader({
  range,
  setRange,
  activeBenchmark = null,
  onBenchmarkChange = () => undefined
}: {
  range: RangeKey;
  setRange: DashboardRangeSetter;
  /** Benchmark actif — null si aucune comparaison en cours. */
  activeBenchmark?: BenchmarkKey | null;
  /** Callback de sélection/désélection du benchmark. */
  onBenchmarkChange?: (key: BenchmarkKey | null) => void;
}) {
  return (
    <div className="flex min-h-[76px] flex-col justify-between gap-4 px-2 pb-3 sm:flex-row sm:items-center sm:px-0 sm:pb-0">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Evolution du portefeuille</h1>
          <p className="muted">Valorisation agregee depuis les historiques Yahoo Finance.</p>
        </div>
        <BenchmarkButton activeBenchmark={activeBenchmark} onSelect={onBenchmarkChange} />
      </div>
      <RangeSelector onChange={(nextRange) => setRange("user-click", nextRange)} value={range} />
    </div>
  );
}
