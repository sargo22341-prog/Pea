import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("admin checks only apply under /admin, unknown API routes stay 404", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const json = { "Content-Type": "application/json" };
      const status = async (path, cookie, method = "GET") => (await fetch(baseUrl + path, { method, headers: { Cookie: cookie } })).status;
      try {
        const setup = await fetch(baseUrl + "/api/auth/setup", {
          method: "POST",
          headers: json,
          body: JSON.stringify({ username: "admin", password, confirmPassword: password, setupCode: "test-setup-code" })
        });
        const adminCookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        await fetch(baseUrl + "/api/admin/users", { method: "POST", headers: { ...json, Cookie: adminCookie }, body: JSON.stringify({ username: "user", password }) });
        const login = await fetch(baseUrl + "/api/auth/login", { method: "POST", headers: json, body: JSON.stringify({ username: "user", password }) });
        const userCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
        console.log("__RESULT__" + JSON.stringify({
          userUnknownRoute: await status("/api/does-not-exist", userCookie),
          userAdminRoute: await status("/api/admin/users", userCookie),
          userUnknownAdminRoute: await status("/api/admin/does-not-exist", userCookie),
          adminAdminRoute: await status("/api/admin/users", adminCookie),
          adminFeatures: await status("/api/admin/features", adminCookie),
          adminUnknownAdminRoute: await status("/api/admin/does-not-exist", adminCookie),
          removedCompatRoute: await status("/api/admin/market-data/rebuild-all", adminCookie, "POST")
        }));
      } finally {
        server.close();
      }
    });
  `) as Record<string, number>;

  assert.deepEqual(result, {
    userUnknownRoute: 404,
    userAdminRoute: 403,
    userUnknownAdminRoute: 403,
    adminAdminRoute: 200,
    adminFeatures: 200,
    adminUnknownAdminRoute: 404,
    removedCompatRoute: 404
  });
});
