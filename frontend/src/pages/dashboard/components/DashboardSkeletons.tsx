import type { RangeKey } from "@pea/shared";
import { PortfolioEvolutionHeader } from "./evolution/PortfolioEvolutionHeader";
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
