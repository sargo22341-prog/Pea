import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface FeatureFlagsResult {
  defaults: { key: string; enabled: boolean; defaultEnabled: boolean }[];
  userList: number;
  userUpdate: number;
  unknownKey: number;
  emptyChanges: number;
  notBoolean: number;
  updated: { key: string; enabled: boolean; updatedBy?: string }[];
  adminMe: string[];
  userMe: string[];
  anonymousMe: string[];
  storedRows: number;
}

test("feature flags are admin-only, validated and exposed to users as enabled keys", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    ${sessionUserHelpers}

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      try {
        const password = "correct horse battery staple";
        const setup = await fetch(baseUrl + "/api/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "admin", password, confirmPassword: password })
        });
        const adminCookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const user = createUserWithSession("bob");
        const call = (cookie, method, body) => fetch(baseUrl + "/api/admin/features", {
          method,
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        const me = async (cookie) => (await (await fetch(baseUrl + "/api/auth/me", { headers: cookie ? { Cookie: cookie } : {} })).json()).features;

        const defaults = await (await call(adminCookie, "GET")).json();
        const userList = (await call(user.cookie, "GET")).status;
        const userUpdate = (await call(user.cookie, "PUT", { features: { insights: true } })).status;
        const unknownKey = (await call(adminCookie, "PUT", { features: { alerts: true } })).status;
        const emptyChanges = (await call(adminCookie, "PUT", { features: {} })).status;
        const notBoolean = (await call(adminCookie, "PUT", { features: { insights: "yes" } })).status;
        const updated = await (await call(adminCookie, "PUT", { features: { insights: true, extended_fundamentals: false } })).json();
        console.log("__RESULT__" + JSON.stringify({
          defaults,
          userList,
          userUpdate,
          unknownKey,
          emptyChanges,
          notBoolean,
          updated,
          adminMe: await me(adminCookie),
          userMe: await me(user.cookie),
          anonymousMe: await me(undefined),
          storedRows: db.prepare("SELECT COUNT(*) AS count FROM app_feature_flags").get().count
        }));
      } finally {
        server.close();
      }
    });
  `) as FeatureFlagsResult;

  assert.deepEqual(result.defaults.map((flag) => [flag.key, flag.enabled, flag.defaultEnabled]), [
    ["extended_fundamentals", true, true],
    ["quarterly_statements", false, false],
    ["insights", false, false],
    ["similar_assets", false, false],
    ["markets_page", true, true]
  ]);
  assert.equal(result.userList, 403);
  assert.equal(result.userUpdate, 403);
  assert.equal(result.unknownKey, 400);
  assert.equal(result.emptyChanges, 400);
  assert.equal(result.notBoolean, 400);
  assert.deepEqual(result.updated.filter((flag) => flag.key === "insights" || flag.key === "extended_fundamentals").map((flag) => [flag.key, flag.enabled, flag.updatedBy]), [
    ["extended_fundamentals", false, "admin"],
    ["insights", true, "admin"]
  ]);
  assert.equal(result.storedRows, 2, "only changed flags are stored, others keep the code default");
  assert.deepEqual(result.adminMe, ["insights", "markets_page"]);
  assert.deepEqual(result.userMe, ["insights", "markets_page"]);
  assert.deepEqual(result.anonymousMe, []);
});
