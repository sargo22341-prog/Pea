import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "./useAsync";
import { useMarketEventReload } from "./useMarketEventReload";

const ALERT_EVENT_TYPES = ["alerts-triggered"] as const;
/** Émis après « Tout marquer comme lu » : la cloche et la page Alertes se resynchronisent. */
const ALERTS_READ_EVENT = "pea:alerts-read";

/**
 * Derniers déclenchements et nombre de non lus. Rechargés à l'évènement SSE `alerts-triggered`
 * (émis par le rafraîchissement live), au retour sur l'application et quand un autre affichage
 * marque les alertes comme lues. Désactivé, aucun appel n'est fait.
 */
export function useAlertEvents(limit: number, enabled = true) {
  const events = useAsync((signal) => (enabled ? api.alertEvents(limit, signal) : Promise.resolve({ events: [], unread: 0 })), `${limit}:${String(enabled)}`);
  const { reload } = events;
  const [error, setError] = useState<string | null>(null);
  useMarketEventReload({ enabled, eventTypes: ALERT_EVENT_TYPES, reload });

  useEffect(() => {
    if (!enabled) return undefined;
    const onRead = () => { void reload(); };
    window.addEventListener(ALERTS_READ_EVENT, onRead);
    return () => { window.removeEventListener(ALERTS_READ_EVENT, onRead); };
  }, [enabled, reload]);

  return {
    events: events.data?.events ?? [],
    unread: events.data?.unread ?? 0,
    loading: events.loading,
    error: error ?? events.error,
    markAllRead: async () => {
      setError(null);
      try {
        await api.markAlertEventsRead();
        window.dispatchEvent(new Event(ALERTS_READ_EVENT));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  };
}

export type AlertEventsState = ReturnType<typeof useAlertEvents>;
