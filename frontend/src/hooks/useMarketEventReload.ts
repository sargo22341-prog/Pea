import type { MarketEventPayload, MarketEventType } from "@pea/shared";
import { useCallback, useEffect, useRef } from "react";
import { useLatestRef } from "./useLatestRef";

// Type partagé via @pea/shared pour synchroniser avec le backend SSE.
export type { MarketEventPayload, MarketEventType } from "@pea/shared";

export type UseMarketEventReloadOptions = {
  debounceMs?: number;
  enabled?: boolean;
  eventTypes?: ReadonlyArray<MarketEventType>;
  filterEvent?: (payload: MarketEventPayload) => boolean;
  intervalMs?: number;
  minReloadIntervalMs?: number;
  onEvent?: (payload: MarketEventPayload) => void;
  reload: () => Promise<unknown> | unknown;
  reloadOnFocus?: boolean;
  reloadOnVisibility?: boolean;
};

export function useMarketEventReload({
  debounceMs = 400,
  enabled = true,
  eventTypes = [],
  filterEvent,
  intervalMs,
  minReloadIntervalMs = 1500,
  onEvent,
  reload,
  reloadOnFocus = true,
  reloadOnVisibility = true
}: UseMarketEventReloadOptions) {
  const debounceTimer = useRef<number | undefined>(undefined);
  const intervalTimer = useRef<number | undefined>(undefined);
  const lastReloadAt = useRef(0);
  const reloadInFlight = useRef(false);
  const eventTypesRef = useLatestRef(eventTypes);
  const filterEventRef = useLatestRef(filterEvent);
  const onEventRef = useLatestRef(onEvent);
  const reloadRef = useLatestRef(reload);

  const clearDebounce = useCallback(() => {
    if (!debounceTimer.current) return;
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = undefined;
  }, []);

  const reloadNow = useCallback(() => {
    if (!enabled || reloadInFlight.current) return;
    const now = Date.now();
    if (now - lastReloadAt.current < minReloadIntervalMs) return;
    lastReloadAt.current = now;
    reloadInFlight.current = true;
    try {
      Promise.resolve(reloadRef.current())
        .catch(() => undefined)
        .finally(() => {
          reloadInFlight.current = false;
        });
    } catch {
      reloadInFlight.current = false;
    }
  }, [enabled, minReloadIntervalMs, reloadRef]);

  const scheduleReload = useCallback(() => {
    if (!enabled) return;
    clearDebounce();
    if (debounceMs <= 0) {
      reloadNow();
      return;
    }
    debounceTimer.current = window.setTimeout(reloadNow, debounceMs);
  }, [clearDebounce, debounceMs, enabled, reloadNow]);

  useEffect(() => {
    if (!enabled) {
      clearDebounce();
      return undefined;
    }

    function onMarketEvent(event: Event) {
      const payload = ((event as CustomEvent<MarketEventPayload>).detail ?? {}) as MarketEventPayload;
      onEventRef.current?.(payload);
      const type = payload.type;
      if (!type || !eventTypesRef.current.includes(type as MarketEventType)) return;
      if (filterEventRef.current && !filterEventRef.current(payload)) return;
      scheduleReload();
    }

    function onForeground() {
      if (document.visibilityState === "visible") reloadNow();
    }

    window.addEventListener("pea:market-event", onMarketEvent);
    if (reloadOnVisibility) document.addEventListener("visibilitychange", onForeground);
    if (reloadOnFocus) window.addEventListener("focus", onForeground);

    return () => {
      clearDebounce();
      window.removeEventListener("pea:market-event", onMarketEvent);
      if (reloadOnVisibility) document.removeEventListener("visibilitychange", onForeground);
      if (reloadOnFocus) window.removeEventListener("focus", onForeground);
    };
  }, [clearDebounce, enabled, eventTypesRef, filterEventRef, onEventRef, reloadNow, reloadOnFocus, reloadOnVisibility, scheduleReload]);

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;
    intervalTimer.current = window.setInterval(() => {
      if (document.visibilityState === "visible") reloadNow();
    }, intervalMs);
    return () => {
      if (intervalTimer.current) window.clearInterval(intervalTimer.current);
      intervalTimer.current = undefined;
    };
  }, [enabled, intervalMs, reloadNow]);

  return { reloadNow, scheduleReload };
}
