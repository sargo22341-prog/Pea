import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createGracefulShutdown } from "../../graceful-shutdown.js";

async function listeningServer() {
  const server = http.createServer((_req, res) => { res.end("ok"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function exitRecorder() {
  let resolveExit: (code: number) => void = () => undefined;
  const exited = new Promise<number>((resolve) => { resolveExit = resolve; });
  return { exited, exit: (code: number) => { resolveExit(code); } };
}

test("shutdown stops background work, waits for the HTTP server, then releases resources", async () => {
  const server = await listeningServer();
  const events: string[] = [];
  server.on("close", () => events.push("server closed"));
  const { exited, exit } = exitRecorder();
  const shutdown = createGracefulShutdown({
    server,
    stopBackgroundWork: [
      { name: "scheduler", run: () => Promise.resolve().then(() => { events.push("scheduler stopped"); }) },
      { name: "broken", run: () => { throw new Error("boom"); } },
      { name: "streams", run: () => { events.push("streams closed"); } }
    ],
    releaseResources: [{ name: "database", run: () => { events.push("database closed"); } }],
    timeoutMs: 5_000,
    exit
  });

  await shutdown("SIGTERM");
  await shutdown("SIGTERM");

  assert.equal(await exited, 1, "a failed step is reported through the exit code");
  assert.deepEqual(events, ["scheduler stopped", "streams closed", "server closed", "database closed"]);
  assert.equal(server.listening, false);
});

test("shutdown forces the exit when a step never finishes", async () => {
  const server = await listeningServer();
  const { port } = server.address() as AddressInfo;
  const { exited, exit } = exitRecorder();
  const shutdown = createGracefulShutdown({
    server,
    stopBackgroundWork: [{ name: "stuck", run: () => new Promise<void>(() => undefined) }],
    releaseResources: [],
    timeoutMs: 50,
    exit
  });

  void shutdown("SIGINT");
  assert.equal(await exited, 1);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`), "the server stopped accepting connections");
});
