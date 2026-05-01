/**
 * Role du fichier : partager l'en-tete du bloc d'evolution entre l'etat charge
 * et le skeleton, afin de garder un rendu identique.
 */

import type { RangeKey } from "@pea/shared";
import { RangeSelector } from "../common/RangeSelector";
import type { DashboardRangeSetter } from "./types";

export function PortfolioEvolutionHeader({ range, setRange }: { range: RangeKey; setRange: DashboardRangeSetter }) {
  return (
    <div className="flex min-h-[76px] flex-col justify-between gap-4 px-2 pb-3 sm:flex-row sm:items-center sm:px-0 sm:pb-0">
      <div>
        <h1 className="text-xl font-bold">Evolution du portefeuille</h1>
        <p className="muted">Valorisation agregee depuis les historiques Yahoo Finance.</p>
      </div>
      <RangeSelector onChange={(nextRange) => setRange("user-click", nextRange)} value={range} />
    </div>
  );
}
