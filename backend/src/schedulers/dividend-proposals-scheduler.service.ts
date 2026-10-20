import { cashRepository } from "../repositories/cash/cash.repository.js";
import { dividendProposalsService } from "../services/cash/dividends/dividend-proposals.service.js";
import { marketEventsService } from "../services/market/events/market-events.service.js";
import { logger } from "../services/shared/logger.service.js";

/**
 * Les détachements sont rafraîchis une fois par jour : une génération horaire suffit pour que les
 * dividendes payés apparaissent, et que les dividendes sûrs soient ajoutés, sans connexion.
 */
const tickIntervalMs = 60 * 60 * 1000;

/**
 * Génère les propositions de dividendes de chaque compte espèces prêt et applique l'ajout
 * automatique, à partir des seules données stockées (aucun appel Yahoo). L'utilisateur reçoit un
 * évènement SSE `cash-dividends-updated` quand un dividende est ajouté ou devient à confirmer.
 */
export class DividendProposalsSchedulerService {
  private timer?: NodeJS.Timeout | undefined;
  private inFlightTick?: Promise<void> | undefined;
  /** Propositions à confirmer déjà signalées, par utilisateur, pour ne notifier que les nouvelles. */
  private readonly notifiedPending = new Map<number, string>();

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runTick(), tickIntervalMs);
    void this.runTick();
    logger.info("portfolio", "dividend proposals scheduler started", { intervalMs: tickIntervalMs });
  }

  /** Arrête le planificateur et attend la fin du tick en cours. */
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlightTick;
  }

  private runTick() {
    this.inFlightTick ??= Promise.resolve().then(() => { this.tick(); }).finally(() => { this.inFlightTick = undefined; });
    return this.inFlightTick;
  }

  /** Un compte en échec n'empêche pas le traitement des suivants. */
  tick(now = new Date()) {
    for (const userId of cashRepository.listReadyUserIds()) {
      try {
        const added = dividendProposalsService.refresh(userId, now);
        const pending = dividendProposalsService.read(userId, now).pending.map((proposal) => proposal.id).join(",");
        const previous = this.notifiedPending.get(userId);
        this.notifiedPending.set(userId, pending);
        if (added > 0 || (previous !== undefined && previous !== pending) || (previous === undefined && pending !== "")) {
          marketEventsService.emitToUser(userId, "cash-dividends-updated", { updatedAt: now.toISOString() });
        }
      } catch (error) {
        logger.error("portfolio", "dividend proposals refresh failed", { userId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

export const dividendProposalsScheduler = new DividendProposalsSchedulerService();
