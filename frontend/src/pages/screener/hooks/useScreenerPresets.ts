import type { ScreenerFilters } from "@pea/shared";
import { useState } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";

/** Filtres enregistrés de l'utilisateur courant. */
export function useScreenerPresets() {
  const presets = useAsync((signal) => api.screenerPresets(signal));
  const [error, setError] = useState<string | null>(null);

  /** Exécute l'action puis recharge la liste ; renvoie `false` si l'API l'a refusée (message affiché). */
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      void presets.reload();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }

  return {
    presets: presets.data ?? [],
    error: error ?? presets.error,
    save: (name: string, filters: ScreenerFilters) => run(() => api.saveScreenerPreset(name, filters)),
    remove: (id: number) => run(() => api.deleteScreenerPreset(id))
  };
}
