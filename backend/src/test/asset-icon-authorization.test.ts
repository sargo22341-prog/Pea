import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "./helpers/backend-script.js";

test("only administrators can mutate global asset icons", () => {
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
          body: JSON.stringify({ username: "admin", password, confirmPassword: password })
        });
        const adminCookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ username: "bob", password })
        });
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "bob", password })
        });
        const userCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
        const userDelete = await fetch(\`\${baseUrl}/api/assets/AIR.PA/icon\`, {
          method: "DELETE",
          headers: { Cookie: userCookie }
        });
        const userPost = await fetch(\`\${baseUrl}/api/assets/AIR.PA/icon\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: userCookie },
          body: "{}"
        });
        const adminDelete = await fetch(\`\${baseUrl}/api/assets/AIR.PA/icon\`, {
          method: "DELETE",
          headers: { Cookie: adminCookie }
        });
        console.log("__RESULT__" + JSON.stringify({
          userDelete: userDelete.status,
          userPost: userPost.status,
          adminDelete: adminDelete.status
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.userDelete, 403);
  assert.equal(result.userPost, 403);
  assert.equal(result.adminDelete, 204);
});
