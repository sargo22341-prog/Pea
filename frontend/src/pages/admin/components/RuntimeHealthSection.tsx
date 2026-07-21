import type { RuntimeHealthDto } from "@pea/shared";
import { RefreshCcw, ServerCog } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible, Toast } from "../../../components/common/feedback";
import { api } from "../../../lib/api";
import { RuntimeHealthDetails } from "./RuntimeHealthDetails";
import { formatDateTime, warningBadges } from "./runtime-health-format";

const autoRefreshMs = 60_000;

export function RuntimeHealthSection({ open, onToggle }: { open?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation(["common"]);
  const [data, setData] = useState<RuntimeHealthDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await api.getRuntimeHealth());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("admin.runtime.unavailable", { ns: "common" }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), autoRefreshMs);
    return () => window.clearInterval(timer);
  }, [load]);

  const badges = useMemo(() => warningBadges(data, t), [data, t]);

  return (
    <Collapsible onToggle={onToggle} open={open} title={t("admin.runtime.title", { ns: "common" })}>
      {error ? <Toast tone="error">{error}</Toast> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky/40 bg-sky/10 text-sky">
            <ServerCog size={18} />
          </div>
          <div className="min-w-0">
            <p className="muted">{t("admin.runtime.lastReading", { ns: "common" })}</p>
            <p className="truncate text-sm font-semibold">{loading && !data ? t("common.loading", { ns: "common" }) : formatDateTime(data?.generatedAt)}</p>
          </div>
        </div>
        <button className="btn-ghost shrink-0 gap-2" disabled={loading || refreshing} onClick={() => void load(true)} type="button">
          <RefreshCcw size={16} />
          {t("actions.refresh", { ns: "common" })}
        </button>
      </div>

      {!loading && !data && !error ? <p className="muted">{t("admin.runtime.empty", { ns: "common" })}</p> : null}
      {data ? (
        <RuntimeHealthDetails data={data} t={t} warnings={badges} />
      ) : null}
    </Collapsible>
  );
}
