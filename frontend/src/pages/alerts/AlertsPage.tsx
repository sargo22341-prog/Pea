import { ALERT_LIMITS } from "@pea/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "../../components/common/disclosure/SegmentedTabs";
import { MOTION } from "../../components/common/motion";
import { useAlertEvents } from "../../hooks/useAlertEvents";
import { readLocalPreference, writeLocalPreference } from "../../lib/local-preference";
import { AlertHistory } from "./components/AlertHistory";
import { AlertsList } from "./components/AlertsList";
import { useAlerts } from "./hooks/useAlerts";

const TABS = ["alerts", "history"] as const;
type AlertsTab = (typeof TABS)[number];
const TAB_KEY = "alerts.tab";

/** Mes alertes et leur historique de déclenchements. La création se fait depuis la fiche actif. */
export function AlertsPage() {
  const { t } = useTranslation("alerts");
  const [tab, setTab] = useState<AlertsTab>(() => TABS.find((value) => value === readLocalPreference(TAB_KEY)) ?? "alerts");
  const alerts = useAlerts();
  const history = useAlertEvents(ALERT_LIMITS.historyPageSize);

  useEffect(() => {
    document.title = `${t("title")} | PEA Portfolio`;
    return () => { document.title = "PEA Portfolio"; };
  }, [t]);

  function changeTab(next: AlertsTab) {
    setTab(next);
    writeLocalPreference(TAB_KEY, next);
  }

  const error = tab === "alerts" ? alerts.error : history.error;
  const loading = tab === "alerts" ? alerts.loading : history.loading;

  return (
    <div className={`space-y-6 ${MOTION.stagger}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="muted">{t("subtitle")}</p>
        </div>
        <SegmentedTabs
          ariaLabel={t("title")}
          onChange={changeTab}
          options={[
            { value: "alerts", label: t("tabs.alerts", { count: alerts.alerts.length }) },
            { value: "history", label: history.unread ? t("tabs.historyUnread", { count: history.unread }) : t("tabs.history") }
          ]}
          value={tab}
        />
      </div>

      {error ? <div className="card border-coral p-4 text-sm text-coral">{error}</div> : null}
      {loading ? (
        <div className="h-40 animate-pulse rounded-[14px] bg-panel2" />
      ) : tab === "alerts" ? (
        <AlertsList alerts={alerts.alerts} onDelete={(alert) => void alerts.remove(alert.id)} onToggle={(alert) => void alerts.setActive(alert.id, !alert.active)} />
      ) : (
        <AlertHistory events={history.events} onMarkAllRead={() => void history.markAllRead()} unread={history.unread} />
      )}
      <p className="text-xs text-slate-500">{t("disclaimer")}</p>
    </div>
  );
}
