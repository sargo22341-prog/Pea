import type { Server } from "node:http";
import { logger } from "./services/shared/logger.service.js";

export interface ShutdownStep {
  name: string;
  run: () => Promise<void> | void;
}

export interface GracefulShutdownInput {
  server: Server;
  /** Travaux de fond et flux ouverts, arrêtés pendant que le serveur HTTP se ferme. */
  stopBackgroundWork: ShutdownStep[];
  /** Ressources partagées (logs, base), libérées une fois les requêtes en cours terminées. */
  releaseResources: ShutdownStep[];
  timeoutMs: number;
  exit: (code: number) => void;
}

async function runSteps(steps: ShutdownStep[]) {
  let failed = false;
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      failed = true;
      logger.error("api", "shutdown step failed", { step: step.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return failed;
}

/**
 * Arrêt ordonné du processus : le serveur HTTP cesse d'accepter des connexions, les travaux de
 * fond s'arrêtent, puis les ressources sont libérées une fois les requêtes terminées. Une étape
 * en échec n'empêche pas les suivantes ; au-delà de `timeoutMs`, le processus sort en erreur
 * plutôt que d'attendre d'être tué.
 */
export function createGracefulShutdown(input: GracefulShutdownInput) {
  let shuttingDown = false;
  return async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("api", "shutdown requested", { signal });
    const forceExit = setTimeout(() => {
      logger.error("api", "shutdown timed out, forcing exit", { timeoutMs: input.timeoutMs });
      input.exit(1);
    }, input.timeoutMs);
    forceExit.unref();

    const serverClosed = new Promise<void>((resolve) => { input.server.close(() => { resolve(); }); });
    const backgroundFailed = await runSteps(input.stopBackgroundWork);
    await serverClosed;
    const releaseFailed = await runSteps(input.releaseResources);
    clearTimeout(forceExit);
    input.exit(backgroundFailed || releaseFailed ? 1 : 0);
  };
}
