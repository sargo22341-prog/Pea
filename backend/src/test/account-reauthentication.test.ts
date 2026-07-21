import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "./helpers/backend-script.js";

test("credential changes require the current password", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const nextPassword = "another correct horse battery staple";
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
        const withoutCurrent = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ password: nextPassword, confirmPassword: nextPassword })
        });
        const withWrongCurrent = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ username: "mallory", currentPassword: "wrong password" })
        });
        const preferenceOnly = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ defaultChartRange: "1w" })
        });
        const withCurrent = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ password: nextPassword, confirmPassword: nextPassword, currentPassword: password })
        });
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: nextPassword })
        });
        console.log("__RESULT__" + JSON.stringify({
          withoutCurrent: withoutCurrent.status,
          withWrongCurrent: withWrongCurrent.status,
          preferenceOnly: preferenceOnly.status,
          withCurrent: withCurrent.status,
          login: login.status
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.withoutCurrent, 401);
  assert.equal(result.withWrongCurrent, 401);
  assert.equal(result.preferenceOnly, 200);
  assert.equal(result.withCurrent, 200);
  assert.equal(result.login, 200);
});
