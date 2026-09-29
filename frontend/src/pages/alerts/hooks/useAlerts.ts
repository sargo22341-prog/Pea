import { useState } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";

/** Alertes de l'utilisateur ; chaque modification recharge la liste. */
export function useAlerts() {
  const alerts = useAsync((signal) => api.alerts(signal));
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      void alerts.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return {
    alerts: alerts.data ?? [],
    loading: alerts.loading,
    error: error ?? alerts.error,
    setActive: (id: number, active: boolean) => run(() => api.updateAlert(id, { active })),
    remove: (id: number) => run(() => api.deleteAlert(id))
  };
}
