import assert from "node:assert/strict";
import test from "node:test";
import { AuthFailureTracker } from "../services/auth/auth-failure-tracker.js";
import { logger } from "../services/shared/logger.service.js";

test("auth failure tracker computes exponential backoff without sleeping", () => {
  withMutedAuthLogs(() => {
    let now = 1_000;
    const tracker = new AuthFailureTracker({
      now: () => now,
      backoffBaseMs: 1000,
      backoffMaxMs: 30_000
    });

    const keys = ["ip:127.0.0.1", "user:alice"];
    assert.equal(tracker.delayForKeys(keys), 0);

    tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    assert.equal(tracker.delayForKeys(keys), 0);

    tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    assert.equal(tracker.delayForKeys(keys), 1000);

    tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    assert.equal(tracker.delayForKeys(keys), 2000);

    for (let index = 0; index < 10; index += 1) {
      tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    }
    assert.equal(tracker.delayForKeys(keys), 30_000);

    now += 31 * 60 * 1000;
    assert.equal(tracker.delayForKeys(keys), 0);
  });
});

test("auth failure tracker resets IP and username after successful login", () => {
  withMutedAuthLogs(() => {
    const tracker = new AuthFailureTracker({ backoffBaseMs: 1000, backoffMaxMs: 30_000 });
    const keys = ["ip:127.0.0.1", "user:alice"];

    tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    assert.equal(tracker.delayForKeys(keys), 1000);

    tracker.recordSuccess({ ip: "127.0.0.1", username: "alice" });
    assert.equal(tracker.delayForKeys(keys), 0);
    assert.deepEqual(tracker.snapshot(), []);
  });
});

test("auth failure tracker applies the stricter delay across IP and username keys", () => {
  withMutedAuthLogs(() => {
    const tracker = new AuthFailureTracker({ backoffBaseMs: 1000, backoffMaxMs: 30_000 });

    tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    tracker.recordFailure({ ip: "127.0.0.2", username: "alice" });
    tracker.recordFailure({ ip: "127.0.0.3", username: "alice" });

    assert.equal(tracker.delayForKeys(["ip:127.0.0.4", "user:alice"]), 1000);
    assert.equal(tracker.delayForKeys(["ip:127.0.0.1", "user:bob"]), 0);

    tracker.recordFailure({ ip: "127.0.0.1", username: "bob" });
    tracker.recordFailure({ ip: "127.0.0.1", username: "charlie" });
    assert.equal(tracker.delayForKeys(["ip:127.0.0.1", "user:diane"]), 1000);
  });
});

test("auth failure tracker logs WARN at five failures and ERROR at ten failures", () => {
  const tracker = new AuthFailureTracker({ backoffBaseMs: 1, backoffMaxMs: 1 });
  const calls: Array<{ level: "warn" | "error"; message: string; failureCount?: unknown }> = [];
  const originalWarn = logger.warn;
  const originalError = logger.error;

  logger.warn = (_category, message, meta) => calls.push({ level: "warn", message, failureCount: failureCountOf(meta) });
  logger.error = (_category, message, meta) => calls.push({ level: "error", message, failureCount: failureCountOf(meta) });

  try {
    for (let index = 0; index < 10; index += 1) {
      tracker.recordFailure({ ip: "127.0.0.1", username: "alice" });
    }
  } finally {
    logger.warn = originalWarn;
    logger.error = originalError;
  }

  assert.ok(calls.some((call) => call.level === "warn" && call.message === "auth brute-force suspected" && call.failureCount === 5));
  assert.ok(calls.some((call) => call.level === "error" && call.message === "auth brute-force suspected (ERROR threshold)" && call.failureCount === 10));
});

function failureCountOf(meta: unknown) {
  return meta && typeof meta === "object" && "failureCount" in meta
    ? (meta as { failureCount?: unknown }).failureCount
    : undefined;
}

function withMutedAuthLogs(fn: () => void) {
  const originalWarn = logger.warn;
  const originalError = logger.error;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  try {
    fn();
  } finally {
    logger.warn = originalWarn;
    logger.error = originalError;
  }
}
