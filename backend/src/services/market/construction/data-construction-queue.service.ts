import type { DataConstructionJobDto } from "@pea/shared";
import { dataConstructionRepository, type DataConstructionTaskRow } from "../../../repositories/market/data-construction.repository.js";
import type { StoredChartRange } from "../charts/chart-config.service.js";
import { logger } from "../../shared/logger.service.js";
import { runWithYahooUsageSource } from "../../yahoo/yahoo-usage-context.js";
import { marketEventsService } from "../events/market-events.service.js";

import { executeConstructionTask } from "./data-construction-task-runner.js";
import { MAX_CONCURRENT_TASKS, PRIORITY_BY_TYPE, jobSummaryToDto, nowIso, rowToTask, taskKey, type ConstructionTask, type TaskType } from "./data-construction-task.js";
export class DataConstructionQueueService {
  private running = 0;
  private sequence = 0;
  private started = false;
  // Symboles actuellement traités par un worker — utilisé pour empêcher deux workers de
  // claimer simultanément des tâches sur le même symbole (anti-race candles).
  private busySymbols = new Set<string>();
  private stopping = false;
  private idleWaiters: (() => void)[] = [];

  start() {
    if (this.started) return;
    this.started = true;
    dataConstructionRepository.resetInterruptedTasks();
    this.pump();
  }

  /**
   * Cesse de réclamer des tâches et attend la fin de celles en cours. Les tâches encore en file
   * restent en base et reprennent au prochain démarrage.
   */
  stop(): Promise<void> {
    this.stopping = true;
    if (this.running === 0) return Promise.resolve();
    return new Promise((resolve) => { this.idleWaiters.push(resolve); });
  }

  enqueue(tasks: Omit<ConstructionTask, "key">[], message = "Construction des donnees en attente", options: { force?: boolean } = {}): DataConstructionJobDto {
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
        priority: PRIORITY_BY_TYPE[task.type]
      })),
      options
    );
    if (!insertedTasks.length) return this.latest();

    this.pump();
    const job = dataConstructionRepository.getJob(jobId);
    return job ? jobSummaryToDto(job) : this.latest();
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

  enqueueAnnexRefreshIfNotRecentlyQueued(symbol: string, retryAfterMs = 6 * 60 * 60 * 1000) {
    const key = symbol.trim().toUpperCase();
    if (!key) return this.latest();
    const sinceIso = new Date(Date.now() - retryAfterMs).toISOString();
    if (dataConstructionRepository.hasRecentSymbolTask(key, ["calendar-events"], sinceIso)) return this.latest();
    return this.enqueueAnnexRefresh([key]);
  }

  latest(): DataConstructionJobDto {
    const latest = dataConstructionRepository.latestJob();
    if (latest) return jobSummaryToDto(latest);
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
    if (this.stopping) {
      if (this.running === 0) for (const resolve of this.idleWaiters.splice(0)) resolve();
      return;
    }
    while (this.running < MAX_CONCURRENT_TASKS) {
      const next = dataConstructionRepository.claimNextQueuedTask([...this.busySymbols]);
      if (!next) break;
      this.running += 1;
      const symbol = next.symbol ? next.symbol.toUpperCase() : undefined;
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
      await runWithYahooUsageSource(`tache construction: ${task.key}`, () => executeConstructionTask(task));
      dataConstructionRepository.markTaskSuccess(taskRow.id);
      this.emitTaskSuccessEvent(task);
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
      if (job && job.completed_tasks + job.failed_tasks >= job.total_tasks) {
        const failedTasks = job.failed_tasks;
        logger.info("market-data", "construction job finished", {
          jobId: job.id,
          status: failedTasks > 0 ? "error" : "success",
          totalTasks: job.total_tasks,
          completedTasks: job.completed_tasks,
          failedTasks,
          durationMs: Date.now() - new Date(job.created_at).getTime()
        });
      }
    }
  }

  private emitTaskSuccessEvent(task: ConstructionTask) {
    if (!task.symbol) return;
    if (!["financials", "dividends", "calendar-events"].includes(task.type)) return;
    marketEventsService.emitToAll("asset-annex-updated", {
      symbol: task.symbol.toUpperCase(),
      updatedAt: new Date().toISOString()
    });
  }
}

export const dataConstructionQueue = new DataConstructionQueueService();
