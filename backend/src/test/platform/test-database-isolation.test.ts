import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const backendRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const realDatabasePath = path.resolve(backendRoot, "..", "data", "pea.sqlite");

test("a test process without a dedicated database never opens data/pea.sqlite and cleans its temporary database", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_TEST_CONTEXT: "child-v8", NODE_ENV: "development" };
  delete env["PEA_TEST_SQLITE_PATH"];
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    const { config } = await import("./src/config.ts");
    const { db } = await import("./src/db.ts");
    db.prepare("SELECT 1").get();
    console.log("__PATH__" + config.sqlitePath);
  `], { cwd: backendRoot, encoding: "utf8", env });

  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split(/\r?\n/).find((item) => item.startsWith("__PATH__"));
  assert.ok(line, result.stdout);
  const usedPath = path.resolve(line.slice("__PATH__".length));
  assert.notEqual(usedPath, realDatabasePath);
  assert.ok(!usedPath.startsWith(path.dirname(realDatabasePath) + path.sep), usedPath);
  assert.equal(fs.existsSync(path.dirname(usedPath)), false, "temporary test database must be removed on exit");
});
