import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { HttpError } from "../../utils/http-error.js";
import { createTimeoutFetch, createYahooCallScheduler } from "../../services/yahoo/yahoo.client.js";
import { isMarketDataUnavailable, isTemporaryYahooError, toYahooHttpError } from "../../services/yahoo/yahoo.errors.js";

function never<T>() {
  return new Promise<T>(() => undefined);
}

test("a Yahoo request that never answers is aborted and treated as temporary", async () => {
  const server = http.createServer(() => undefined);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const error: unknown = await createTimeoutFetch(50)(`http://127.0.0.1:${port}/hang`).then(() => undefined, (reason: unknown) => reason);
    assert.ok(error instanceof Error);
    assert.equal(isTemporaryYahooError(error), true);
    assert.equal(isMarketDataUnavailable(error), true);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("an expired Yahoo call frees the queue for the next one", async () => {
  const schedule = createYahooCallScheduler({ jobExpirationMs: 50, queueHighWater: 10 });
  const stuck = schedule("test:stuck", never);
  const next = schedule("test:next", () => Promise.resolve("ok"));
  await assert.rejects(stuck, (error: unknown) => error instanceof HttpError && error.status === 503);
  assert.equal(await next, "ok");
});

test("a full Yahoo queue rejects new calls as unavailable market data", async () => {
  const schedule = createYahooCallScheduler({ jobExpirationMs: 100, queueHighWater: 1 });
  const running = schedule("test:running", never);
  const queued = schedule("test:queued", never);
  const dropped = await schedule("test:dropped", () => Promise.resolve("never")).then(() => undefined, (reason: unknown) => reason);
  assert.ok(dropped instanceof HttpError && dropped.status === 503);
  assert.equal(isMarketDataUnavailable(dropped), true);
  await Promise.allSettled([running, queued]);
});

test("unavailable Yahoo errors keep their status through the API conversion", () => {
  const breakerOpen = new HttpError(503, "Yahoo Finance est temporairement indisponible (circuit breaker ouvert).");
  assert.equal(toYahooHttpError(breakerOpen), breakerOpen);
  assert.equal(isMarketDataUnavailable(breakerOpen), true);
  assert.equal(isMarketDataUnavailable(new HttpError(404, "introuvable")), false);
  assert.equal(toYahooHttpError(new Error("No data found")).status, 502);
});
