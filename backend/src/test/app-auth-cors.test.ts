import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "./helpers/backend-script.js";

type CorsHeaders = {
  allowCredentials: string | null;
  allowOrigin: string | null;
  status: number;
};

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

  return runBackendScript(script, { nodeEnv }) as CorsHeaders;
}

test("CORS is enabled for the Vite dev origin outside production", () => {
  const headers = requestHealthWithOrigin("development", "http://localhost:5173");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, "http://localhost:5173");
  assert.equal(headers.allowCredentials, "true");
});

test("API health is available under /api for reverse proxies and mobile setup", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/health\`);
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
});

test("CORS is enabled for the loopback Vite dev origin outside production", () => {
  const headers = requestHealthWithOrigin("development", "http://127.0.0.1:5173");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, "http://127.0.0.1:5173");
  assert.equal(headers.allowCredentials, "true");
});

test("CORS is enabled for the Capacitor Android origin outside production", () => {
  const headers = requestHealthWithOrigin("development", "https://localhost");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, "https://localhost");
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

test("CORS allows configured production origins for the Android wrapper", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/health\`, {
          headers: { Origin: "https://localhost" }
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
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "https://localhost" } }) as CorsHeaders;

  assert.equal(result.status, 200);
  assert.equal(result.allowOrigin, "https://localhost");
  assert.equal(result.allowCredentials, "true");
});

test("production login accepts Android WebView origin when configured", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://localhost" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://localhost" },
          body: JSON.stringify({ username: "alice", password })
        });
        console.log("__RESULT__" + JSON.stringify({
          setupStatus: setup.status,
          loginStatus: login.status,
          allowOrigin: login.headers.get("access-control-allow-origin"),
          body: await login.json()
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "https://localhost" } });

  assert.equal(result.setupStatus, 201);
  assert.equal(result.loginStatus, 200);
  assert.equal(result.allowOrigin, "https://localhost");
  assert.equal(result.body.username, "alice");
});

test("production mutating requests accept configured Capacitor origin", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "capacitor://localhost" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        console.log("__RESULT__" + JSON.stringify({
          status: response.status,
          allowOrigin: response.headers.get("access-control-allow-origin"),
          body: await response.json()
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "capacitor://localhost" } });

  assert.equal(result.status, 201);
  assert.equal(result.allowOrigin, "capacitor://localhost");
  assert.equal(result.body.username, "alice");
});

test("production mutating requests reject unconfigured origins", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "https://localhost" } });

  assert.equal(result.status, 403);
});

test("production mutating requests reject missing Origin", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "https://localhost" } });

  assert.equal(result.status, 403);
});

test("production mutating requests accept native bearer mode without Origin", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-PEA-Auth-Mode": "bearer" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const setupBody = await setup.json();
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-PEA-Auth-Mode": "bearer" },
          body: JSON.stringify({ username: "alice", password })
        });
        const loginBody = await login.json();
        console.log("__RESULT__" + JSON.stringify({
          setupStatus: setup.status,
          loginStatus: login.status,
          setupHasToken: typeof setupBody.token === "string",
          loginHasToken: typeof loginBody.token === "string",
          username: loginBody.user?.username
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production" });

  assert.equal(result.setupStatus, 201);
  assert.equal(result.loginStatus, 200);
  assert.equal(result.setupHasToken, true);
  assert.equal(result.loginHasToken, true);
  assert.equal(result.username, "alice");
});

test("development mutating requests accept Vite localhost origin", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        console.log("__RESULT__" + JSON.stringify({
          status: response.status,
          allowOrigin: response.headers.get("access-control-allow-origin"),
          body: await response.json()
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "development" });

  assert.equal(result.status, 201);
  assert.equal(result.allowOrigin, "http://localhost:5173");
  assert.equal(result.body.username, "alice");
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

