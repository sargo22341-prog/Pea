/**
 * Role du fichier : partager l'en-tete du bloc d'evolution entre l'etat charge
 * et le skeleton, afin de garder un rendu identique.
 */

import type { RangeKey } from "@pea/shared";
import { GitCompare } from "lucide-react";
import { RangeSelector } from "../../../components/common/RangeSelector";
import type { DashboardRangeSetter } from "./types";

export function PortfolioEvolutionHeader({
  range,
  setRange,
  comparisonCount = 0,
  onCompareClick
}: {
  range: RangeKey;
  setRange: DashboardRangeSetter;
  comparisonCount?: number;
  onCompareClick?: () => void;
}) {
  return (
    <div className="flex min-h-[76px] flex-col justify-between gap-4 px-2 pb-3 sm:flex-row sm:items-center sm:px-0 sm:pb-0">
      <div>
        <h1 className="text-xl font-bold">Evolution du portefeuille</h1>
        <p className="muted">Valorisation agregee depuis les historiques Yahoo Finance.</p>
      </div>
      <div className="flex items-center justify-end gap-2">
        {onCompareClick && (
          <button
            className={comparisonCount > 0 ? "btn bg-blue-600 text-white" : "btn-ghost"}
            onClick={onCompareClick}
            type="button"
          >
            <GitCompare size={17} />
            {comparisonCount > 0 ? comparisonCount : "Comparer"}
          </button>
        )}
        <RangeSelector onChange={(nextRange) => setRange("user-click", nextRange)} value={range} />
      </div>
    </div>
  );
}
