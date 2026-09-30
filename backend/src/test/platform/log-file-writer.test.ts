import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LogFileWriter } from "../../services/shared/log-file-writer.js";

function withTempDirectory(run: (directory: string) => Promise<void>) {
  return async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pea-log-writer-"));
    try {
      await run(directory);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

test("log files rotate by size and keep a bounded number of archives", withTempDirectory(async (directory) => {
  const writer = new LogFileWriter({ directory: () => directory, maxFileBytes: 100, rotatedFiles: 2, maxPendingBytes: 10_000 });
  for (let index = 0; index < 12; index += 1) {
    writer.append("auth.log", `${JSON.stringify({ index, padding: "x".repeat(30) })}\n`);
    await writer.flush();
  }

  const files = fs.readdirSync(directory).sort();
  assert.deepEqual(files, ["auth.log", "auth.log.1", "auth.log.2"]);
  for (const file of files) assert.ok(fs.statSync(path.join(directory, file)).size <= 100);
  const lastLines = fs.readFileSync(path.join(directory, "auth.log"), "utf8").trim().split("\n");
  assert.equal((JSON.parse(lastLines.at(-1) ?? "{}") as { index: number }).index, 11, "the newest line is in the active file");
}));

test("pending log lines are bounded and dropped lines are reported", withTempDirectory(async (directory) => {
  const writer = new LogFileWriter({ directory: () => directory, maxFileBytes: 1_000_000, rotatedFiles: 1, maxPendingBytes: 50 });
  for (let index = 0; index < 10; index += 1) writer.append("api.log", `line-${index}-${"y".repeat(10)}\n`);
  await writer.flush();

  const content = fs.readFileSync(path.join(directory, "api.log"), "utf8");
  const dropped = content.split("\n").filter(Boolean).map((line) => line.startsWith("{") ? (JSON.parse(line) as { dropped?: number }).dropped : undefined).find(Boolean);
  assert.ok(content.startsWith("line-0-"));
  assert.ok(content.length < 400, "memory and output stay bounded");
  assert.ok((dropped ?? 0) > 0, "dropped lines are reported instead of silently lost");
}));
