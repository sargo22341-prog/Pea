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

function runBackendScript(script: string, nodeEnv = "development") {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pea-test-"));
  const sqlitePath = path.join(tempDir, "test.sqlite");
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
    .find((line) => line.trim().startsWith("__RESULT__"));

  assert.ok(jsonLine, result.stdout);
  return JSON.parse(jsonLine.slice("__RESULT__".length));
}

function requestHealthWithOrigin(nodeEnv: string, origin: string) {
  const script = `
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      try {
        const address = server.address();
        const response = await fetch(\`http://127.0.0.1:\${address.port}/health\`, {
          headers: { Origin: ${JSON.stringify(origin)} }
        });
        console.log("__RESULT__" + JSON.stringify({
          allowCredentials: response.headers.get("access-control-allow-credentials"),
          allowOrigin: response.headers.get("access-control-allow-origin"),
          status: response.status
        }));
      } finally {
        server.close();
      }
    });
  `;

  return runBackendScript(script, nodeEnv) as CorsHeaders;
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

test("auth setup, login and logout use secure local session flow", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        const setupCookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const me = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: setupCookie } });
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: "correct horse battery staple" })
        });
        const loginCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
        const logout = await fetch(\`\${baseUrl}/api/auth/logout\`, { method: "POST", headers: { Cookie: loginCookie } });
        const meAfterLogout = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: loginCookie } });
        console.log("__RESULT__" + JSON.stringify({
          setupStatus: setup.status,
          setupCookieHasHttpOnly: setup.headers.get("set-cookie")?.includes("HttpOnly") ?? false,
          meStatus: me.status,
          meBody: await me.json(),
          loginStatus: login.status,
          logoutStatus: logout.status,
          meAfterLogoutBody: await meAfterLogout.json()
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.setupStatus, 201);
  assert.equal(result.setupCookieHasHttpOnly, true);
  assert.equal(result.meStatus, 200);
  assert.equal(result.meBody.user.username, "alice");
  assert.equal(result.loginStatus, 200);
  assert.equal(result.logoutStatus, 204);
  assert.equal(result.meAfterLogoutBody.user, null);
});

test("auth setup rejects weak passwords", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: "short", confirmPassword: "short" })
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 400);
  assert.match(JSON.stringify(result.body), /10 caracteres/);
});

test("auth rate limit is stricter than the global API limit", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const statuses = [];
        for (let index = 0; index < 21; index += 1) {
          const response = await fetch(\`\${baseUrl}/api/auth/login\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "alice", password: "incorrect" })
          });
          statuses.push(response.status);
        }
        console.log("__RESULT__" + JSON.stringify({ statuses }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.statuses.at(-1), 429);
  assert.equal(result.statuses.filter((status: number) => status === 429).length, 1);
});

test("default chart range keeps all as a valid user preference", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const update = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ defaultChartRange: "all" })
        });
        const me = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: cookie } });
        console.log("__RESULT__" + JSON.stringify({ updateStatus: update.status, meBody: await me.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.updateStatus, 200);
  assert.equal(result.meBody.user.defaultChartRange, "all");
});

test("static JSON cache rejects non-whitelisted SQL targets", () => {
  const result = runBackendScript(`
    import { readStaticJsonCache } from "./services/shared/cache.service.ts";

    let message = "";
    try {
      readStaticJsonCache("users", "id", "1");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    console.log("__RESULT__" + JSON.stringify({ message }));
  `);

  assert.match(result.message, /non autorise/);
});
