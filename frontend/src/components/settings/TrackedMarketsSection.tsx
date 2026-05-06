import type { TrackedMarketDto, TrackedMarketsSettingsDto } from "@pea/shared";
import { Activity, Clock, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Collapsible, Toast, type SettingsToast } from "./SettingsSection";

const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatDateTime(value?: string | null, timezone = userTimezone) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export function TrackedMarketsSection() {
  const [data, setData] = useState<TrackedMarketsSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  async function load() {
    setLoading(true);
    setToast(null);
    try {
      setData(await api.trackedMarketsSettings());
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Etat marche indisponible" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Collapsible title="Marches suivis">
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <NextTask data={data} loading={loading} />
        <button className="btn-ghost shrink-0 gap-2" disabled={loading} onClick={() => void load()} type="button">
          <RefreshCcw size={16} />
          Actualiser
        </button>
      </div>
      <SchedulerHealth data={data} />
      <MarketsTable markets={data?.markets ?? []} loading={loading} />
    </Collapsible>
  );
}

function NextTask({ data, loading }: { data: TrackedMarketsSettingsDto | null; loading: boolean }) {
  const task = data?.nextTask;
  const label = task?.type === "open" ? "Ouverture" : task?.type === "close" ? "Fermeture" : "Aucune tache";
  const time = task ? `${formatDateTime(task.runAt)} ${userTimezone} / ${formatDateTime(task.runAt, task.marketTimezone)} ${task.marketTimezone}` : "-";

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-panel2/70 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky/40 bg-sky/10 text-sky">
        <Clock size={18} />
      </div>
      <div className="min-w-0">
        <p className="muted">Prochaine tache</p>
        <p className="truncate text-sm font-semibold">
          {loading ? "Chargement..." : task ? `${label} - ${task.marketName} - ${time}` : "Aucune tache planifiee"}
        </p>
      </div>
    </div>
  );
}

function SchedulerHealth({ data }: { data: TrackedMarketsSettingsDto | null }) {
  const health = data?.health;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <HealthTile label="Dernier tick" value={formatDateTime(health?.last_tick_at)} />
      <HealthTile label="Dernier tick reussi" value={formatDateTime(health?.last_successful_tick_at)} />
      <HealthTile label="Derniere erreur" value={health?.last_error || "-"} />
    </div>
  );
}

function HealthTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-panel2/60 p-3">
      <p className="muted">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function MarketsTable({ markets, loading }: { markets: TrackedMarketDto[]; loading: boolean }) {
  if (loading) return <p className="muted">Chargement des marches suivis...</p>;
  if (!markets.length) return <p className="muted">Aucune bourse active pour le moment.</p>;

  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="min-w-[1400px] w-full text-left text-sm">
        <thead className="bg-panel2/80 text-xs uppercase text-slate-400">
          <tr>
            <th className="p-3">Bourse</th>
            <th className="p-3">Timezone</th>
            <th className="p-3">Date trading</th>
            <th className="p-3">Assets</th>
            <th className="p-3">Ouverture prevue</th>
            <th className="p-3">Ouverture confirmee</th>
            <th className="p-3">Dernier check ouv.</th>
            <th className="p-3">Prochain check ouv.</th>
            <th className="p-3">Statut ouv.</th>
            <th className="p-3">Message ouv.</th>
            <th className="p-3">Tentatives ouv.</th>
            <th className="p-3">Fermeture prevue</th>
            <th className="p-3">Fermeture confirmee</th>
            <th className="p-3">Dernier check ferm.</th>
            <th className="p-3">Prochain check ferm.</th>
            <th className="p-3">Statut ferm.</th>
            <th className="p-3">Message ferm.</th>
            <th className="p-3">Tentatives ferm.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {markets.map((market) => (
            <MarketRow key={market.marketKey} market={market} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketRow({ market }: { market: TrackedMarketDto }) {
  return (
    <tr className="align-top">
      <td className="p-3 font-semibold">
        <span className="inline-flex items-center gap-2">
          <Activity size={15} className={market.enabled ? "text-mint" : "text-slate-500"} />
          {market.displayName}
        </span>
      </td>
      <td className="p-3 text-slate-300">{market.timezone}</td>
      <td className="p-3 text-slate-300">{market.tradingDate || "-"}</td>
      <td className="p-3 text-slate-300">{market.assetsCount}</td>
      <td className="p-3 text-slate-300">{formatDateTime(market.openExpectedAt, market.timezone)}</td>
      <td className="p-3 text-slate-300">{formatDateTime(market.openConfirmedAt)}</td>
      <td className="p-3 text-slate-300">{formatDateTime(market.openLastCheckedAt)}</td>
      <td className="p-3 text-slate-300">{formatDateTime(market.nextOpenCheckAt)}</td>
      <td className="p-3 text-slate-300">{statusLabel(market.openStatus)}</td>
      <td className="max-w-60 p-3 text-slate-300">{market.openMessage || "-"}</td>
      <td className="p-3 text-slate-300">{market.openAttempts}</td>
      <td className="p-3 text-slate-300">{formatDateTime(market.closeExpectedAt, market.timezone)}</td>
      <td className="p-3 text-slate-300">{formatDateTime(market.closeConfirmedAt)}</td>
      <td className="p-3 text-slate-300">{formatDateTime(market.closeLastCheckedAt)}</td>
      <td className="p-3 text-slate-300">{formatDateTime(market.nextCloseCheckAt)}</td>
      <td className="p-3 text-slate-300">{statusLabel(market.closeStatus)}</td>
      <td className="max-w-60 p-3 text-slate-300">{market.closeMessage || "-"}</td>
      <td className="p-3 text-slate-300">{market.closeAttempts}</td>
    </tr>
  );
}
