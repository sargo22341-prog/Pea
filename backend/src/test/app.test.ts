import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

type CorsHeaders = {
  allowCredentials: string | null;
  allowOrigin: string | null;
  status: number;
};

function requestHealthWithOrigin(nodeEnv: string, origin: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pea-cors-"));
  const sqlitePath = path.join(tempDir, "test.sqlite");
  const script = `
    import { app } from "./src/app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      try {
        const address = server.address();
        const response = await fetch(\`http://127.0.0.1:\${address.port}/health\`, {
          headers: { Origin: ${JSON.stringify(origin)} }
        });
        console.log(JSON.stringify({
          allowCredentials: response.headers.get("access-control-allow-credentials"),
          allowOrigin: response.headers.get("access-control-allow-origin"),
          status: response.status
        }));
      } finally {
        server.close();
      }
    });
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      SQLITE_PATH: sqlitePath
    }
  });

  fs.rmSync(tempDir, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr);
  const jsonLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("{") && line.includes("allowOrigin"));

  assert.ok(jsonLine, result.stdout);
  return JSON.parse(jsonLine) as CorsHeaders;
}

test("CORS is enabled for the Vite dev origin outside production", () => {
  const headers = requestHealthWithOrigin("development", "http://localhost:5173");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, "http://localhost:5173");
  assert.equal(headers.allowCredentials, "true");
});

test("CORS does not echo arbitrary origins outside production", () => {
  const headers = requestHealthWithOrigin("development", "http://example.com");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, null);
  assert.equal(headers.allowCredentials, null);
});

test("CORS is not installed in production", () => {
  const headers = requestHealthWithOrigin("production", "http://localhost:5173");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, null);
  assert.equal(headers.allowCredentials, null);
});
