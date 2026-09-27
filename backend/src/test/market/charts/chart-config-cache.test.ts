import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { ChartConfigService } from "../../../services/market/charts/chart-config.service.js";

function writeConfig(filePath: string, intradayInterval: string, mtime: Date) {
  fs.writeFileSync(filePath, JSON.stringify({ charts: { "1d": { interval: intradayInterval }, "1w": { interval: "2h" }, "1m": { interval: "4h" } } }));
  fs.utimesSync(filePath, mtime, mtime);
}

test("chart config is parsed once and re-read only when the file changes", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pea-chart-config-"));
  context.after(() => { fs.rmSync(directory, { recursive: true, force: true }); });
  const configPath = path.join(directory, "config.json");
  writeConfig(configPath, "5m", new Date("2026-01-01T00:00:00.000Z"));
  const service = new ChartConfigService(configPath);
  const readSpy = mock.method(fs, "readFileSync");
  context.after(() => { readSpy.mock.restore(); });

  for (let index = 0; index < 50; index += 1) assert.equal(service.getIntervalForRange("1d"), "5m");
  assert.equal(readSpy.mock.callCount(), 1);

  writeConfig(configPath, "15m", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(service.getIntervalForRange("1d"), "15m");
  assert.equal(readSpy.mock.callCount(), 2);
});

test("missing chart config is recreated with documented defaults", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pea-chart-config-"));
  context.after(() => { fs.rmSync(directory, { recursive: true, force: true }); });
  const configPath = path.join(directory, "nested", "config.json");
  const service = new ChartConfigService(configPath);

  assert.equal(service.getIntervalForRange("1d"), "5m");
  assert.ok(fs.existsSync(configPath));
  assert.equal(service.getIntervalForRange("1w"), "2h");
});

test("invalid chart config still fails explicitly", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pea-chart-config-"));
  context.after(() => { fs.rmSync(directory, { recursive: true, force: true }); });
  const configPath = path.join(directory, "config.json");
  writeConfig(configPath, "7m", new Date("2026-01-01T00:00:00.000Z"));

  assert.throws(() => new ChartConfigService(configPath).loadChartConfig());
});
