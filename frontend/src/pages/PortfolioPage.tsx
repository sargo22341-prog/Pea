import type { User } from "@pea/shared";
import { AddPositionForm } from "../components/AddPositionForm";
import { EmptyState } from "../components/EmptyState";
import { PositionList } from "../components/PositionList";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";

export function PortfolioPage({ user }: { user: User }) {
  const range = user.defaultChartRange ?? "1d";
  const portfolio = useAsync((signal) => api.portfolio(range, signal), [range]);
  const positionsPerformance = useAsync(() => api.positionsPerformance(range), [range]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <aside className="order-first lg:order-last">
        <AddPositionForm compact onCreated={() => { void portfolio.reload(); void positionsPerformance.reload(); }} />
      </aside>
      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Portefeuille</h1>
          <p className="muted">Ajoutez vos actions et ETF eligibles ou a verifier pour suivre la valorisation.</p>
        </div>
        {portfolio.loading || positionsPerformance.loading ? (
          <div className="card p-6">Chargement...</div>
        ) : positionsPerformance.data && positionsPerformance.data.length > 0 ? (
          <PositionList positions={positionsPerformance.data} range={range} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
