import { useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "./useAsync";
import { useMarketEventReload } from "./useMarketEventReload";

const ALERT_EVENT_TYPES = ["alerts-triggered"] as const;

/**
 * Derniers déclenchements et nombre de non lus. Rechargés à l'évènement SSE `alerts-triggered`
 * (émis par le rafraîchissement live) et au retour sur l'application.
 */
export function useAlertEvents(limit: number, enabled = true) {
  const events = useAsync((signal) => (enabled ? api.alertEvents(limit, signal) : Promise.resolve({ events: [], unread: 0 })), `${limit}:${String(enabled)}`);
  const [error, setError] = useState<string | null>(null);
  useMarketEventReload({ enabled, eventTypes: ALERT_EVENT_TYPES, reload: events.reload });

  return {
    events: events.data?.events ?? [],
    unread: events.data?.unread ?? 0,
    loading: events.loading,
    error: error ?? events.error,
    reload: events.reload,
    markAllRead: async () => {
      setError(null);
      try {
        await api.markAlertEventsRead();
        void events.reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  };
}
