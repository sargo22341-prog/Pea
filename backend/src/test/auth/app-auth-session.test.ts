import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
test("production auth cookie is not Secure on HTTP public URL", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://192.168.0.44:4000" },
          body: JSON.stringify({ username: "alice", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        console.log("__RESULT__" + JSON.stringify({
          status: response.status,
          setCookie: response.headers.get("set-cookie")
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { PUBLIC_URL: "http://192.168.0.44:4000", TRUST_PROXY: "false" } });

  assert.equal(result.status, 201);
  assert.ok(!result.setCookie.includes("Secure"));
});

test("production auth cookie is Secure on HTTPS public URL", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://pea.example.com" },
          body: JSON.stringify({ username: "alice", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        console.log("__RESULT__" + JSON.stringify({
          status: response.status,
          setCookie: response.headers.get("set-cookie")
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { PUBLIC_URL: "https://pea.example.com", TRUST_PROXY: "true" } });

  assert.equal(result.status, 201);
  assert.ok(result.setCookie.includes("Secure"));
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
  `, { nodeEnv: "test", env: { PEA_AUTH_BACKOFF_BASE_MS: "1", PEA_AUTH_BACKOFF_MAX_MS: "1" } });

  assert.equal(result.statuses.at(-1), 429);
  assert.equal(result.statuses.filter((status: number) => status === 429).length, 1);
});

test("auth supports bearer sessions for native mobile clients", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-PEA-Auth-Mode": "bearer" },
          body: JSON.stringify({ username: "alice", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        const setupBody = await setup.json();
        const me = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Authorization: \`Bearer \${setupBody.token}\` } });
        const logout = await fetch(\`\${baseUrl}/api/auth/logout\`, { method: "POST", headers: { Authorization: \`Bearer \${setupBody.token}\` } });
        const meAfterLogout = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Authorization: \`Bearer \${setupBody.token}\` } });
        console.log("__RESULT__" + JSON.stringify({
          setupStatus: setup.status,
          tokenPresent: typeof setupBody.token === "string" && setupBody.token.length > 20,
          username: setupBody.user.username,
          meBody: await me.json(),
          logoutStatus: logout.status,
          meAfterLogoutBody: await meAfterLogout.json()
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.setupStatus, 201);
  assert.equal(result.tokenPresent, true);
  assert.equal(result.username, "alice");
  assert.equal(result.meBody.user.username, "alice");
  assert.equal(result.logoutStatus, 204);
  assert.equal(result.meAfterLogoutBody.user, null);
});

