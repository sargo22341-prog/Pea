import type { TrackedMarketDto, TrackedMarketsSettingsDto } from "@pea/shared";
import { Activity, Clock, RefreshCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../lib/api";
import { ConfirmDialog } from "../../../components/common/feedback/ConfirmDialog";
import { Collapsible, Toast, type SettingsToast } from "../../../components/common/feedback";

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
  const { t } = useTranslation(["common"]);
  const [data, setData] = useState<TrackedMarketsSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteMarket, setPendingDeleteMarket] = useState<TrackedMarketDto | null>(null);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      setData(await api.trackedMarketsSettings());
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("admin.markets.stateUnavailable", { ns: "common" }) });
    } finally {
      setLoading(false);
    }
  }, [t]);

  async function deleteMarket(market: TrackedMarketDto) {
    setPendingDeleteMarket(null);
    setToast(null);
    try {
      const result = await api.deleteTrackedMarket(market.marketKey);
      setData((current) => current ? { ...current, markets: current.markets.filter((item) => item.marketKey !== market.marketKey) } : current);
      setToast({ tone: "success", text: t("admin.markets.deleted", { logs: result.logs, market: market.displayName, ns: "common", runs: result.runs }) });
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("admin.markets.deleteFailed", { ns: "common" }) });
      await load();
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Collapsible title={t("admin.markets.title", { ns: "common" })}>
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <NextTask data={data} loading={loading} />
        <button className="btn-ghost shrink-0 gap-2" disabled={loading} onClick={() => void load()} type="button">
          <RefreshCcw size={16} />
          {t("actions.refreshNow", { ns: "common" })}
        </button>
      </div>
      <SchedulerHealth data={data} />
      <MarketsTable markets={data?.markets ?? []} loading={loading} onDelete={setPendingDeleteMarket} />
      {pendingDeleteMarket ? (
        <ConfirmDialog
          danger
          confirmLabel={t("actions.delete", { ns: "common" })}
          description={t("admin.markets.deleteDescription", { market: pendingDeleteMarket.displayName, ns: "common" })}
          onCancel={() => setPendingDeleteMarket(null)}
          onConfirm={() => void deleteMarket(pendingDeleteMarket)}
          title={t("admin.markets.deleteTitle", { market: pendingDeleteMarket.displayName, ns: "common" })}
        />
      ) : null}
    </Collapsible>
  );
}

function NextTask({ data, loading }: { data: TrackedMarketsSettingsDto | null; loading: boolean }) {
  const { t } = useTranslation(["common"]);
  const task = data?.nextTask;
  const label = task?.type === "open" ? t("admin.markets.open", { ns: "common" }) : task?.type === "close" ? t("admin.markets.close", { ns: "common" }) : t("admin.markets.noTask", { ns: "common" });
  const time = task ? `${formatDateTime(task.runAt)} ${userTimezone} / ${formatDateTime(task.runAt, task.marketTimezone)} ${task.marketTimezone}` : "-";

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-panel2/70 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky/40 bg-sky/10 text-sky">
        <Clock size={18} />
      </div>
      <div className="min-w-0">
        <p className="muted">{t("admin.markets.nextTask", { ns: "common" })}</p>
        <p className="truncate text-sm font-semibold">
          {loading ? t("common.loading", { ns: "common" }) : task ? `${label} - ${task.marketName} - ${time}` : t("admin.markets.noPlannedTask", { ns: "common" })}
        </p>
      </div>
    </div>
  );
}

function SchedulerHealth({ data }: { data: TrackedMarketsSettingsDto | null }) {
  const { t } = useTranslation(["common"]);
  const health = data?.health;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <HealthTile label={t("admin.markets.lastTick", { ns: "common" })} value={formatDateTime(health?.last_tick_at)} />
      <HealthTile label={t("admin.markets.lastSuccessfulTick", { ns: "common" })} value={formatDateTime(health?.last_successful_tick_at)} />
      <HealthTile label={t("admin.markets.lastError", { ns: "common" })} value={health?.last_error || "-"} />
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

function MarketsTable({ markets, loading, onDelete }: { markets: TrackedMarketDto[]; loading: boolean; onDelete: (market: TrackedMarketDto) => void }) {
  const { t } = useTranslation(["common"]);

  if (loading) return <p className="muted">{t("admin.markets.loading", { ns: "common" })}</p>;
  if (!markets.length) return <p className="muted">{t("admin.markets.empty", { ns: "common" })}</p>;

  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="min-w-[1400px] w-full text-left text-sm">
        <thead className="bg-panel2/80 text-xs uppercase text-slate-400">
          <tr>
            <th className="p-3">{t("admin.markets.exchange", { ns: "common" })}</th>
            <th className="p-3">Timezone</th>
            <th className="p-3">{t("admin.markets.tradingDate", { ns: "common" })}</th>
            <th className="p-3">Assets</th>
            <th className="p-3">{t("admin.markets.expectedOpen", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.confirmedOpen", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.lastOpenCheck", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.nextOpenCheck", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.openStatus", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.openMessage", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.openAttempts", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.expectedClose", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.confirmedClose", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.lastCloseCheck", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.nextCloseCheck", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.closeStatus", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.closeMessage", { ns: "common" })}</th>
            <th className="p-3">{t("admin.markets.closeAttempts", { ns: "common" })}</th>
            <th className="p-3 text-right">{t("admin.users.actions", { ns: "common" })}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {markets.map((market) => (
            <MarketRow key={market.marketKey} market={market} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketRow({ market, onDelete }: { market: TrackedMarketDto; onDelete: (market: TrackedMarketDto) => void }) {
  const { t } = useTranslation(["common"]);
  const canDelete = market.assetsCount === 0;

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
      <td className="p-3 text-right">
        {canDelete ? (
          <button
            aria-label={t("admin.markets.deleteMarket", { market: market.displayName, ns: "common" })}
            className="btn-ghost px-2 text-coral"
            onClick={() => onDelete(market)}
            title={t("admin.markets.deleteMarketTitle", { ns: "common" })}
            type="button"
          >
            <Trash2 size={16} />
          </button>
        ) : null}
      </td>
    </tr>
  );
}
