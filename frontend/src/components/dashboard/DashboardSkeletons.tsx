/**
 * Role du fichier : regrouper les placeholders propres au Dashboard pour
 * stabiliser le layout pendant les chargements progressifs.
 */

import type { RangeKey } from "@pea/shared";
import { PortfolioEvolutionHeader } from "./PortfolioEvolutionHeader";
import type { DashboardRangeSetter } from "./types";

export function PortfolioEvolutionSkeleton({ range, setRange }: { range: RangeKey; setRange: DashboardRangeSetter }) {
  return (
    <section className="card p-0 sm:p-4">
      <PortfolioEvolutionHeader range={range} setRange={setRange} />
      <ChartSkeleton />
    </section>
  );
}

export function ChartSkeleton() {
  return (
    <div className="h-72 p-4">
      <div className="relative h-full overflow-hidden rounded-md border border-line bg-ink">
        <div className="absolute inset-x-4 bottom-8 top-6 animate-pulse rounded bg-panel2/70" />
        <div className="absolute bottom-8 left-4 right-4 h-px bg-line" />
      </div>
    </div>
  );
}

export function PositionsSectionSkeleton({ count }: { count: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex min-h-[77px] items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 className="font-semibold">Positions</h2>
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-panel2" />
        </div>
        <div className="h-9 w-20 animate-pulse rounded-md bg-panel2" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: count }).map((_, index) => (
          <div className="min-h-[76px] p-3 sm:min-h-[88px] sm:p-4" key={index}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-md bg-panel2" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 max-w-full animate-pulse rounded bg-panel2" />
                <div className="h-3 w-20 animate-pulse rounded bg-panel2" />
              </div>
              <div className="min-w-[92px] space-y-2">
                <div className="ml-auto h-3 w-20 animate-pulse rounded bg-panel2" />
                <div className="ml-auto h-3 w-16 animate-pulse rounded bg-panel2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
