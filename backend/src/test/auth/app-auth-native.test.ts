import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
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

test("production authenticated bearer mutations accept missing Origin", () => {
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
        const response = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: \`Bearer \${setupBody.token}\` },
          body: JSON.stringify({ dashboardDefaultSortKey: "name" })
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production" });

  assert.equal(result.status, 200);
  assert.equal(result.body.dashboardDefaultSortKey, "name");
});

test("production non-auth native marker without Origin is still rejected", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/logout\`, {
          method: "POST",
          headers: { "X-PEA-Auth-Mode": "bearer" }
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.text() }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production" });

  assert.equal(result.status, 403);
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

