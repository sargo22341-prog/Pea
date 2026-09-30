import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

const script = `
  const { logger } = await import("./services/shared/logger.service.ts");
  const warnings = [];
  logger.warn = (_category, message) => { warnings.push(message); };
  const { app } = await import("./app.ts");
  const server = app.listen(0, "127.0.0.1", async () => {
    const url = "http://127.0.0.1:" + server.address().port + "/api/health";
    try {
      await fetch(url);
      await fetch(url, { headers: { "X-Forwarded-For": "203.0.113.7" } });
      await fetch(url, { headers: { "X-Forwarded-For": "203.0.113.8" } });
      console.log("__RESULT__" + JSON.stringify({ proxyWarnings: warnings.filter((message) => message.includes("TRUST_PROXY")).length }));
    } finally {
      server.close();
    }
  });
`;

test("a proxy header without TRUST_PROXY is reported once", () => {
  const result = runBackendScript(script, { env: { TRUST_PROXY: "false" } }) as { proxyWarnings: number };
  assert.equal(result.proxyWarnings, 1);
});

test("no proxy warning when TRUST_PROXY is enabled", () => {
  const result = runBackendScript(script, { env: { TRUST_PROXY: "true" } }) as { proxyWarnings: number };
  assert.equal(result.proxyWarnings, 0);
});
