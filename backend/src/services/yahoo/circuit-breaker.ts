import { logger } from "../shared/logger.service.js";
import { HttpError } from "../../utils/http-error.js";
import { isTemporaryYahooError } from "./yahoo.errors.js";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  /** Nombre d'échecs consécutifs avant ouverture du circuit. */
  failureThreshold: number;
  /** Durée pendant laquelle le circuit reste ouvert (rejets immédiats) avant de passer en half-open. */
  cooldownMs: number;
  /** Nombre de succès en half-open requis pour refermer le circuit. */
  successThreshold: number;
}

/**
 * Circuit breaker partagé pour les appels Yahoo Finance.
 *
 * - Closed : tout passe normalement.
 * - Open : tous les appels sont rejetés immédiatement avec une erreur 503 pendant `cooldownMs`.
 * - Half-open : on autorise un essai ; si succès → Closed, si échec → Open.
 *
 * Seules les erreurs Yahoo réellement temporaires (429/401/timeout/etc) incrémentent le compteur.
 * Les erreurs métier (données mal formées, ticker introuvable) ne déclenchent pas l'ouverture.
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private nextAttemptAt = 0;
  private openedAt = 0;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (this.state === "open") {
      if (now < this.nextAttemptAt) {
        throw new HttpError(503, "Yahoo Finance est temporairement indisponible (circuit breaker ouvert).", {
          provider: "Yahoo Finance",
          breaker: this.name,
          retryAfterMs: this.nextAttemptAt - now
        });
      }
      this.transitionTo("half-open");
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /** État courant exposé pour tests / debugging. */
  snapshot() {
    return {
      name: this.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      nextAttemptAt: this.nextAttemptAt,
      openedAt: this.openedAt
    };
  }

  /** Réinitialisation manuelle utilisée par les tests. */
  reset() {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.nextAttemptAt = 0;
    this.openedAt = 0;
  }

  private onSuccess() {
    if (this.state === "half-open") {
      this.consecutiveSuccesses += 1;
      if (this.consecutiveSuccesses >= this.options.successThreshold) {
        this.transitionTo("closed");
      }
      return;
    }
    if (this.consecutiveFailures > 0) this.consecutiveFailures = 0;
  }

  private onFailure(error: unknown) {
    // Les erreurs non-temporaires (mauvaise input, ticker invalide) ne doivent pas ouvrir le circuit.
    if (!isTemporaryYahooError(error)) return;

    this.consecutiveFailures += 1;
    this.consecutiveSuccesses = 0;
    if (this.state === "half-open" || this.consecutiveFailures >= this.options.failureThreshold) {
      this.transitionTo("open");
    }
  }

  private transitionTo(state: CircuitState) {
    if (this.state === state) return;
    const previous = this.state;
    this.state = state;
    if (state === "open") {
      this.openedAt = Date.now();
      this.nextAttemptAt = this.openedAt + this.options.cooldownMs;
      logger.warn("market-data", "Yahoo circuit breaker opened", {
        breaker: this.name,
        previous,
        consecutiveFailures: this.consecutiveFailures,
        cooldownMs: this.options.cooldownMs
      });
    } else if (state === "half-open") {
      this.consecutiveSuccesses = 0;
      logger.warn("market-data", "Yahoo circuit breaker half-open", { breaker: this.name, previous });
    } else if (state === "closed") {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
      this.openedAt = 0;
      this.nextAttemptAt = 0;
      logger.info("market-data", "Yahoo circuit breaker closed", { breaker: this.name, previous });
    }
  }
}

/** Instance globale partagée par tous les appels Yahoo. */
export const yahooCircuitBreaker = new CircuitBreaker("yahoo", {
  failureThreshold: 5,
  cooldownMs: 30 * 1000,
  successThreshold: 2
});
