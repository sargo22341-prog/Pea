import type { StatementsPeriod } from "@pea/shared";
import { useAsync } from "../../../../../hooks/useAsync";
import { api } from "../../../../../lib/api";

/**
 * Bilan et flux de trésorerie d'une période, demandés seulement quand `enabled` : le trimestriel
 * n'est chargé qu'au premier passage de l'utilisateur sur « Trimestriel ».
 */
export function useFinancialStatements(symbol: string, period: StatementsPeriod, enabled: boolean) {
  return useAsync((signal) => (enabled ? api.statements(symbol, period, signal) : Promise.resolve(null)), `${symbol}:${period}:${String(enabled)}`);
}
