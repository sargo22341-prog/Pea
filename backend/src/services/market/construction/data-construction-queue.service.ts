import type { DataConstructionJobDto } from "@pea/shared";
import { marketDataConstructionRepository } from "../../../repositories/market/construction.repository.js";
import { dataConstructionRepository, type DataConstructionJobSummary, type DataConstructionTaskRow } from "../../../repositories/market/data-construction.repository.js";
import type { StoredChartRange } from "../charts/chart-config.service.js";
import { logger } from "../../shared/logger.service.js";
import { runWithYahooUsageSource } from "../../yahoo/yahoo-usage-context.js";

type TaskType = "candles" | "finalize" | "rebuild-stored" | "snapshot" | "financials" | "dividends" | "calendar-events";

/**
 * Priorité par type de tâche (plus petit = plus prioritaire).
 * Les `finalize` post-close passent avant les `candles` pour ne pas bloquer la fraîcheur des
 * dashboards le matin suivant. `calendar-events` et `dividends` finissent en queue car peu
 * critiques pour la consultation immédiate.
 */
const PRIORITY_BY_TYPE: Record<TaskType, number> = {
  finalize: 10,
  snapshot: 20,
  candles: 30,
  "rebuild-stored": 40,
  financials: 50,
  dividends: 60,
  "calendar-events": 70
};

interface ConstructionTask {
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
const MAX_CONCURRENT_TASKS = 4;

function nowIso() {
  return new Date().toISOString();
}

function taskKey(task: Omit<ConstructionTask, "key">) {
  if (task.marketKey && task.tradingDate && task.phase) {
    return `${task.marketKey}:${task.tradingDate}:${task.phase}:${task.type}:${task.symbol ?? "all"}:${task.range ?? "all"}`.toUpperCase();
  }
  return task.type === "candles" || task.type === "finalize" || task.type === "rebuild-stored"
    ? `${task.type}:${task.symbol ?? "all"}:${task.range ?? "all"}`.toUpperCase()
    : `${task.symbol ?? "all"}:${task.type}`.toUpperCase();
}

export class DataConstructionQueueService {
  private running = 0;
  private sequence = 0;
  private started = false;
  // Symboles actuellement traités par un worker — utilisé pour empêcher deux workers de
  // claimer simultanément des tâches sur le même symbole (anti-race candles).
  private busySymbols = new Set<string>();

  start() {
    if (this.started) return;
    this.started = true;
    dataConstructionRepository.resetInterruptedTasks();
    this.pump();
  }

  enqueue(tasks: Array<Omit<ConstructionTask, "key">>, message = "Construction des donnees en attente", options: { force?: boolean } = {}): DataConstructionJobDto {
    const preparedTasks = tasks.map((task) => ({ ...task, key: taskKey(task) }));
    const activeTaskKeys = options.force ? new Set<string>() : dataConstructionRepository.activeTaskKeys(preparedTasks.map((task) => task.key));
    const uniqueTasks = preparedTasks.filter((task) => {
      const active = activeTaskKeys.has(task.key);
      logger.debug("market-data", active ? "construction task skipped" : "construction task created", {
        task: task.key,
        type: task.type,
        symbol: task.symbol,
        range: task.range,
        market: task.marketKey,
        tradingDate: task.tradingDate,
        phase: task.phase,
        priority: PRIORITY_BY_TYPE[task.type],
        reason: active ? "already-active" : options.force ? "forced" : "queued"
      });
      return !active;
    });

    if (!uniqueTasks.length) return this.latest();

    const jobId = `job-${Date.now()}-${++this.sequence}`;
    const insertedTasks = dataConstructionRepository.createJob(
      jobId,
      message,
      uniqueTasks.map((task) => ({
        taskKey: task.key,
        type: task.type,
        symbol: task.symbol,
        range: task.range,
        marketKey: task.marketKey,
        tradingDate: task.tradingDate,
        phase: task.phase,
        message: task.message,
        priority: PRIORITY_BY_TYPE[task.type] ?? 100
      })),
      options
    );
    if (!insertedTasks.length) return this.latest();

    this.pump();
    const job = dataConstructionRepository.getJob(jobId);
    return job ? this.toDto(job) : this.latest();
  }

  enqueueAssetConstruction(symbol: string) {
    return this.enqueueFullConstruction([symbol]);
  }

  enqueueFullConstruction(symbols: string[]) {
    const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    const tasks = uniqueSymbols.flatMap((symbol) => [
      ...(["1d", "1w", "1m", "all"] as StoredChartRange[]).map((range) => ({
        type: "candles" as const,
        symbol,
        range,
        message: `${symbol} - ${range}`
      })),
      { type: "snapshot" as const, symbol, message: `${symbol} - snapshot` },
      { type: "financials" as const, symbol, message: `${symbol} - financials` },
      { type: "dividends" as const, symbol, message: `${symbol} - dividends` }
    ]);
    return this.enqueue(tasks, `Construction de ${uniqueSymbols.length} asset(s) planifiee`);
  }

  enqueueMarketDataRebuild(symbols: string[], ranges: StoredChartRange[], options: { force?: boolean } = {}) {
    const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    const uniqueRanges = [...new Set(ranges)];
    const tasks = uniqueSymbols.flatMap((symbol) =>
      uniqueRanges.map((range) => ({
        type: "candles" as const,
        symbol,
        range,
        message: `${symbol} - rebuild ${range}`
      }))
    );
    const rangeLabel = uniqueRanges.length === 1 ? uniqueRanges[0] : "toutes ranges";
    return this.enqueue(tasks, `Reconstruction marche ${rangeLabel} de ${uniqueSymbols.length} asset(s) planifiee`, options);
  }

  enqueuePostCloseFinalization(symbols: string[], context?: { marketKey: string; tradingDate: string; phase: "close" }) {
    const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    const tasks = uniqueSymbols.flatMap((symbol) => [
      { ...context, type: "finalize" as const, symbol, range: "1d", message: `${symbol} - finalisation 1d` },
      { ...context, type: "rebuild-stored" as const, symbol, range: "1w", message: `${symbol} - mise a jour 1w` },
      { ...context, type: "rebuild-stored" as const, symbol, range: "1m", message: `${symbol} - mise a jour 1m` },
      { ...context, type: "rebuild-stored" as const, symbol, range: "all", message: `${symbol} - mise a jour all` }
    ]);
    return this.enqueue(tasks, `Finalisation post-cloture de ${uniqueSymbols.length} asset(s) planifiee`);
  }

  enqueueCandles(symbol: string, range: string) {
    return this.enqueue(
      [{ type: "candles", symbol: symbol.toUpperCase(), range, message: `Reconstruction candles ${symbol.toUpperCase()} ${range}` }],
      `Candles ${symbol.toUpperCase()} ${range} en preparation`
    );
  }

  enqueueForSymbols(type: Exclude<TaskType, "candles">, symbols: string[]) {
    return this.enqueue(
      symbols.map((symbol) => ({ type, symbol: symbol.toUpperCase(), message: `${type} ${symbol.toUpperCase()}` })),
      `${symbols.length} taches ${type} planifiees`
    );
  }

  enqueueAnnexRefresh(symbols: string[]) {
    const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    const tasks = uniqueSymbols.flatMap((symbol) => [
      { type: "snapshot" as const, symbol, message: `${symbol} - snapshot` },
      { type: "financials" as const, symbol, message: `${symbol} - financials` },
      { type: "dividends" as const, symbol, message: `${symbol} - dividends` },
      { type: "calendar-events" as const, symbol, message: `${symbol} - calendar events` }
    ]);
    return this.enqueue(tasks, `Rafraichissement annexe de ${uniqueSymbols.length} asset(s) planifie`);
  }

  latest(): DataConstructionJobDto {
    const latest = dataConstructionRepository.latestJob();
    if (latest) return this.toDto(latest);
    return {
      id: "idle",
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      pendingTasks: 0,
      status: "idle",
      progressPercent: 100,
      currentMessage: "Aucune construction en cours",
      errors: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  runtimeStats() {
    const stats = dataConstructionRepository.runtimeStats();
    return {
      ...stats,
      activeWorkers: this.running,
      maxConcurrentTasks: MAX_CONCURRENT_TASKS,
      busySymbols: this.busySymbols.size
    };
  }

  private pump() {
    while (this.running < MAX_CONCURRENT_TASKS) {
      const next = dataConstructionRepository.claimNextQueuedTask([...this.busySymbols]);
      if (!next) break;
      this.running += 1;
      const symbol = next.symbol ? String(next.symbol).toUpperCase() : undefined;
      if (symbol) this.busySymbols.add(symbol);
      void this.run(next).finally(() => {
        this.running -= 1;
        if (symbol) this.busySymbols.delete(symbol);
        this.pump();
      });
    }
  }

  private async run(taskRow: DataConstructionTaskRow) {
    const task = rowToTask(taskRow);
    const startedAt = performance.now();

    try {
      logger.debug("market-data", "construction task started", {
        task: task.key,
        type: task.type,
        symbol: task.symbol,
        range: task.range
      });
      await runWithYahooUsageSource(`tache construction: ${task.key}`, () => this.execute(task));
      dataConstructionRepository.markTaskSuccess(taskRow.id);
      logger.debug("market-data", "construction task success", {
        task: task.key,
        type: task.type,
        symbol: task.symbol,
        range: task.range,
        durationMs: Math.round(performance.now() - startedAt)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dataConstructionRepository.markTaskError(taskRow.id, message);
      logger.warn("market-data", "construction task failed", {
        task: task.key,
        type: task.type,
        symbol: task.symbol,
        range: task.range,
        reason: message,
        durationMs: Math.round(performance.now() - startedAt)
      });
    } finally {
      const job = dataConstructionRepository.getJob(taskRow.job_id);
      if (job && Number(job.completed_tasks ?? 0) + Number(job.failed_tasks ?? 0) >= Number(job.total_tasks ?? 0)) {
        const failedTasks = Number(job.failed_tasks ?? 0);
        logger.info("market-data", "construction job finished", {
          jobId: job.id,
          status: failedTasks > 0 ? "error" : "success",
          totalTasks: Number(job.total_tasks ?? 0),
          completedTasks: Number(job.completed_tasks ?? 0),
          failedTasks,
          durationMs: Date.now() - new Date(job.created_at).getTime()
        });
      }
    }
  }

  private async execute(task: ConstructionTask) {
    const [{ marketDataService }, { marketSnapshotService }, { financialsService }, { dividendsService }, { assetRepository }, { marketDataGateway }] = await Promise.all([
      import("../data/market-data.service.js"),
      import("../snapshots/market-snapshot.service.js"),
      import("../financials/financials.service.js"),
      import("../dividends/dividends.service.js"),
      import("../../../repositories/market/asset.repository.js"),
      import("../data/market-data-gateway.service.js")
    ]);

    if (!task.symbol) return;
    let asset = assetRepository.findBySymbol(task.symbol);
    if (!asset) asset = await marketDataService.ensureAssetInitialized(task.symbol);

    if (task.type === "candles") await marketDataService.refreshCandlesForAsset(asset, task.range ? [task.range as StoredChartRange] : undefined);
    if (task.type === "finalize") await marketDataService.finalizePostCloseForAsset(asset);
    if (task.type === "rebuild-stored") await marketDataService.rebuildStoredRangesFromFinalData(asset, task.range ? [task.range as StoredChartRange] : undefined);
    if (task.type === "snapshot") await marketSnapshotService.refreshMarketSnapshot(asset);
    if (task.type === "financials") await financialsService.refreshFinancials(asset);
    if (task.type === "dividends") await dividendsService.refreshDividends(asset);
    if (task.type === "calendar-events") {
      marketDataConstructionRepository.clearCachedFundamentals(asset.symbol);
      const marketInfo = await marketDataGateway.readMarketInfoWithCache(asset.symbol);
      marketSnapshotService.upsertMarketInfo(asset.id, marketInfo.data);
      await marketDataGateway.readExtraDataWithCache(asset.symbol); // quoteSummary (9 modules) -> upsert calendar events
      await financialsService.refreshFinancials(asset);  // fundamentalsTimeSeries → upsert asset_financials
    }
  }

  private toDto(job: DataConstructionJobSummary): DataConstructionJobDto {
    const totalTasks = Number(job.total_tasks ?? 0);
    const completedTasks = Number(job.completed_tasks ?? 0);
    const failedTasks = Number(job.failed_tasks ?? 0);
    const runningTasks = Number(job.running_tasks ?? 0);
    const done = completedTasks + failedTasks;
    const status = jobStatus(totalTasks, completedTasks, failedTasks, runningTasks);
    return {
      id: job.id,
      totalTasks,
      completedTasks,
      failedTasks,
      pendingTasks: Math.max(0, totalTasks - done - runningTasks),
      status,
      progressPercent: totalTasks ? Math.round((done / totalTasks) * 100) : 100,
      currentMessage: currentMessage(status, job.message, job.current_task_label ?? undefined),
      currentTaskLabel: job.current_task_label ?? undefined,
      errors: parseErrors(job.errors_json),
      createdAt: job.created_at,
      updatedAt: job.updated_at
    };
  }
}

function rowToTask(row: DataConstructionTaskRow): ConstructionTask {
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

function jobStatus(totalTasks: number, completedTasks: number, failedTasks: number, runningTasks: number): DataConstructionJobDto["status"] {
  if (totalTasks === 0) return "idle";
  if (completedTasks + failedTasks >= totalTasks) return failedTasks > 0 ? "error" : "success";
  if (runningTasks > 0) return "running";
  return "queued";
}

function currentMessage(status: DataConstructionJobDto["status"], message: string, currentTaskLabel?: string) {
  if (status === "success") return "Construction terminee";
  if (status === "error") return "Construction terminee avec erreurs";
  return currentTaskLabel ?? message;
}

function parseErrors(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export const dataConstructionQueue = new DataConstructionQueueService();
