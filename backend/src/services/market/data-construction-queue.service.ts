/**
 * Role du fichier : executer les reconstructions marche en arriere-plan avec
 * concurrence limitee, deduplication par asset/range et suivi de progression.
 */

import type { DataConstructionJobDto } from "@pea/shared";
import type { StoredChartRange } from "./chart-config.service.js";
import { logger } from "../shared/logger.service.js";

type TaskType = "candles" | "finalize" | "rebuild-stored" | "snapshot" | "financials" | "dividends";

interface ConstructionTask {
  key: string;
  type: TaskType;
  symbol?: string;
  range?: string;
  message: string;
}

interface ConstructionJobState {
  id: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  status: DataConstructionJobDto["status"];
  currentMessage: string;
  currentTaskLabel?: string;
  errors: string[];
  createdAt: string;
  updatedAt: string;
  tasks: ConstructionTask[];
}

const maxConcurrentTasks = 1;

function nowIso() {
  return new Date().toISOString();
}

function taskKey(task: Omit<ConstructionTask, "key">) {
  return task.type === "candles" || task.type === "finalize" || task.type === "rebuild-stored"
    ? `${task.type}:${task.symbol ?? "all"}:${task.range ?? "all"}`.toUpperCase()
    : `${task.symbol ?? "all"}:${task.type}`.toUpperCase();
}

export class DataConstructionQueueService {
  private jobs = new Map<string, ConstructionJobState>();
  private pending: Array<{ jobId: string; task: ConstructionTask }> = [];
  private activeTaskKeys = new Set<string>();
  private running = 0;
  private sequence = 0;

  enqueue(tasks: Array<Omit<ConstructionTask, "key">>, message = "Construction des donnees en attente", options: { force?: boolean } = {}): DataConstructionJobDto {
    const preparedTasks = tasks.map((task) => ({ ...task, key: taskKey(task) }));
    const uniqueTasks = preparedTasks.filter((task) => {
      const active = !options.force && this.activeTaskKeys.has(task.key);
      logger.debug("market-data", active ? "construction task skipped" : "construction task created", {
        task: task.key,
        type: task.type,
        symbol: task.symbol,
        range: task.range,
        reason: active ? "already-active" : options.force ? "forced" : "queued"
      });
      return !active;
    });

    if (!uniqueTasks.length) return this.latest();

    const job: ConstructionJobState = {
      id: `job-${Date.now()}-${++this.sequence}`,
      totalTasks: uniqueTasks.length,
      completedTasks: 0,
      failedTasks: 0,
      status: "queued",
      currentMessage: message,
      errors: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      tasks: uniqueTasks
    };
    this.jobs.set(job.id, job);

    for (const task of uniqueTasks) {
      this.activeTaskKeys.add(task.key);
      this.pending.push({ jobId: job.id, task });
    }
    this.pump();
    return this.toDto(job);
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

  enqueuePostCloseFinalization(symbols: string[]) {
    const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    const tasks = uniqueSymbols.flatMap((symbol) => [
      { type: "finalize" as const, symbol, range: "1d", message: `${symbol} - finalisation 1d` },
      { type: "rebuild-stored" as const, symbol, range: "1w", message: `${symbol} - mise a jour 1w` },
      { type: "rebuild-stored" as const, symbol, range: "1m", message: `${symbol} - mise a jour 1m` },
      { type: "rebuild-stored" as const, symbol, range: "all", message: `${symbol} - mise a jour all` }
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

  latest(): DataConstructionJobDto {
    const latest = [...this.jobs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
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

  private pump() {
    while (this.running < maxConcurrentTasks && this.pending.length) {
      const next = this.pending.shift()!;
      this.running += 1;
      void this.run(next.jobId, next.task).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  private async run(jobId: string, task: ConstructionTask) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "running";
    job.currentMessage = task.message;
    job.currentTaskLabel = task.message;
    job.updatedAt = nowIso();

    try {
      logger.debug("market-data", "construction task started", {
        task: task.key,
        type: task.type,
        symbol: task.symbol,
        range: task.range
      });
      await this.execute(task);
      job.completedTasks += 1;
      logger.debug("market-data", "construction task success", {
        task: task.key,
        type: task.type,
        symbol: task.symbol,
        range: task.range
      });
    } catch (error) {
      job.failedTasks += 1;
      const message = error instanceof Error ? error.message : String(error);
      job.errors.push(`${task.key}: ${message}`);
      logger.warn("market-data", "construction task failed", {
        task: task.key,
        type: task.type,
        symbol: task.symbol,
        range: task.range,
        reason: message
      });
    } finally {
      job.updatedAt = nowIso();
      if (job.completedTasks + job.failedTasks >= job.totalTasks) {
        job.status = job.failedTasks > 0 ? "error" : "success";
        job.currentMessage = job.status === "success" ? "Construction terminee" : "Construction terminee avec erreurs";
        job.currentTaskLabel = undefined;
        for (const completedTask of job.tasks) this.activeTaskKeys.delete(completedTask.key);
      }
    }
  }

  private async execute(task: ConstructionTask) {
    const [{ marketDataService }, { marketSnapshotService }, { financialsService }, { dividendsService }, { assetRepository }] = await Promise.all([
      import("./market-data.service.js"),
      import("./market-snapshot.service.js"),
      import("./financials.service.js"),
      import("./dividends.service.js"),
      import("./asset.repository.js")
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
  }

  private toDto(job: ConstructionJobState): DataConstructionJobDto {
    const done = job.completedTasks + job.failedTasks;
    return {
      id: job.id,
      totalTasks: job.totalTasks,
      completedTasks: job.completedTasks,
      failedTasks: job.failedTasks,
      pendingTasks: Math.max(0, job.totalTasks - job.completedTasks - job.failedTasks),
      status: job.status,
      progressPercent: job.totalTasks ? Math.round((done / job.totalTasks) * 100) : 100,
      currentMessage: job.currentMessage,
      currentTaskLabel: job.currentTaskLabel,
      errors: job.errors,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }
}

export const dataConstructionQueue = new DataConstructionQueueService();
