import type { AlertEventsPage, AlertParams, AlertType, UserAlert } from "@pea/shared";
import { dedupedRequest, request } from "../api-core";

export const alertsApi = {
  alerts: (signal?: AbortSignal) => request<UserAlert[]>("/api/alerts", signal ? { signal } : undefined),
  createAlert: (input: { symbol: string; type: AlertType; params: AlertParams }) =>
    request<UserAlert>("/api/alerts", { method: "POST", body: JSON.stringify(input) }),
  updateAlert: (id: number, changes: { active?: boolean; params?: AlertParams }) =>
    request<UserAlert>(`/api/alerts/${encodeURIComponent(String(id))}`, { method: "PATCH", body: JSON.stringify(changes) }),
  deleteAlert: (id: number) => request<undefined>(`/api/alerts/${encodeURIComponent(String(id))}`, { method: "DELETE" }),
  /** Lecture partagée : la cloche est montée à la fois dans l'en-tête mobile et bureau. */
  alertEvents: (limit: number, signal?: AbortSignal) => dedupedRequest<AlertEventsPage>(`/api/alerts/events?limit=${limit}`, signal),
  markAlertEventsRead: () => request<undefined>("/api/alerts/events/read", { method: "POST" })
};
