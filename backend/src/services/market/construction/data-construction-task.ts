import type { DataConstructionJobDto } from "@pea/shared";
import type { DataConstructionTaskRow } from "../../../repositories/market/data-construction.repository.js";

export type TaskType = "candles" | "finalize" | "rebuild-stored" | "snapshot" | "financials" | "dividends" | "calendar-events";

/**
 * Priorité par type de tâche (plus petit = plus prioritaire).
 * Les `finalize` post-close passent avant les `candles` pour ne pas bloquer la fraîcheur des
 * dashboards le matin suivant. `calendar-events` et `dividends` finissent en queue car peu
 * critiques pour la consultation immédiate.
 */
export const PRIORITY_BY_TYPE: Record<TaskType, number> = {
  finalize: 10,
  snapshot: 20,
  candles: 30,
  "rebuild-stored": 40,
  financials: 50,
  dividends: 60,
  "calendar-events": 70
};

export interface ConstructionTask {
  key: string;
  type: TaskType;
  symbol?: string;
  range?: string;
  marketKey?: string;
  tradingDate?: string;
  phase?: string;
  message: string;
}

/**
 * Concurrence maximale : 4 workers simultanés. Couplé au lock par symbole côté
 * `marketDataService`, deux tâches sur le même symbole restent sérialisées tandis que
 * différents symboles avancent en parallèle.
 */
export const MAX_CONCURRENT_TASKS = 4;

export function nowIso() {
  return new Date().toISOString();
}

export function taskKey(task: Omit<ConstructionTask, "key">) {
  if (task.marketKey && task.tradingDate && task.phase) {
    return `${task.marketKey}:${task.tradingDate}:${task.phase}:${task.type}:${task.symbol ?? "all"}:${task.range ?? "all"}`.toUpperCase();
  }
  return task.type === "candles" || task.type === "finalize" || task.type === "rebuild-stored"
    ? `${task.type}:${task.symbol ?? "all"}:${task.range ?? "all"}`.toUpperCase()
    : `${task.symbol ?? "all"}:${task.type}`.toUpperCase();
}

export function rowToTask(row: DataConstructionTaskRow): ConstructionTask {
  return {
    key: row.task_key,
    type: row.type as TaskType,
    symbol: row.symbol ?? undefined,
    range: row.range ?? undefined,
    marketKey: row.market_key ?? undefined,
    tradingDate: row.trading_date ?? undefined,
    phase: row.phase ?? undefined,
    message: row.message
  };
}

export function jobStatus(totalTasks: number, completedTasks: number, failedTasks: number, runningTasks: number): DataConstructionJobDto["status"] {
  if (totalTasks === 0) return "idle";
  if (completedTasks + failedTasks >= totalTasks) return failedTasks > 0 ? "error" : "success";
  if (runningTasks > 0) return "running";
  return "queued";
}

export function currentMessage(status: DataConstructionJobDto["status"], message: string, currentTaskLabel?: string) {
  if (status === "success") return "Construction terminee";
  if (status === "error") return "Construction terminee avec erreurs";
  return currentTaskLabel ?? message;
}

export function parseErrors(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}
