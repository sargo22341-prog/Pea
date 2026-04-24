import { AddPositionForm } from "../components/AddPositionForm";
import { EmptyState } from "../components/EmptyState";
import { PositionList } from "../components/PositionList";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";

export function PortfolioPage() {
  const portfolio = useAsync(() => api.portfolio(), []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Portefeuille</h1>
          <p className="muted">Ajoutez vos actions et ETF éligibles ou à vérifier pour suivre la valorisation.</p>
        </div>
        {portfolio.loading ? (
          <div className="card p-6">Chargement...</div>
        ) : portfolio.data && portfolio.data.positions.length > 0 ? (
          <PositionList positions={portfolio.data.positions} />
        ) : (
          <EmptyState />
        )}
      </div>
      <AddPositionForm onCreated={portfolio.reload} />
    </div>
  );
}
