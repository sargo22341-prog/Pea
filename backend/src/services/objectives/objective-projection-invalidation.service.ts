import { logger } from "../shared/logger.service.js";
import { objectivesService } from "./objectives.service.js";

const defaultDebounceMs = 250;

export class ObjectiveProjectionInvalidationService {
  private readonly pending = new Map<number, NodeJS.Timeout>();

  invalidateUser(userId: number | string, reason: string, debounceMs = defaultDebounceMs) {
    const resolvedUserId = Number(userId);
    if (!Number.isFinite(resolvedUserId)) return;

    const existing = this.pending.get(resolvedUserId);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(() => {
      this.pending.delete(resolvedUserId);
      void this.recalculateNow(resolvedUserId, reason);
    }, debounceMs);
    timeout.unref?.();
    this.pending.set(resolvedUserId, timeout);
    logger.debug("portfolio", "objective projection recalculation scheduled", { reason, userId: resolvedUserId });
  }

  async flushUser(userId: number | string, reason = "manual flush") {
    const resolvedUserId = Number(userId);
    if (!Number.isFinite(resolvedUserId)) return { recalculated: 0, failed: 0 };
    const existing = this.pending.get(resolvedUserId);
    if (existing) {
      clearTimeout(existing);
      this.pending.delete(resolvedUserId);
    }
    return this.recalculateNow(resolvedUserId, reason);
  }

  private async recalculateNow(userId: number, reason: string) {
    try {
      const result = await objectivesService.recalculateActiveForUser(userId);
      logger.info("portfolio", "objective projections recalculated after portfolio change", { ...result, reason, userId });
      return result;
    } catch (error) {
      logger.error("portfolio", "objective projection recalculation failed", { error: error instanceof Error ? error.message : String(error), reason, userId });
      return { recalculated: 0, failed: 1 };
    }
  }
}

export const objectiveProjectionInvalidationService = new ObjectiveProjectionInvalidationService();
