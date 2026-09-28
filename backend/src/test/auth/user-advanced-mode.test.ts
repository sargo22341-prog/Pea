import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

test("advanced mode preference defaults to off, is validated and only changes the current user", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    ${sessionUserHelpers}
    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const me = async (cookie) => (await (await fetch(baseUrl + "/api/auth/me", { headers: { Cookie: cookie } })).json()).user;
      const patch = (cookie, body) => fetch(baseUrl + "/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
      try {
        const initial = (await me(alice.cookie)).advancedModeEnabled;
        const invalid = (await patch(alice.cookie, { advancedModeEnabled: "yes" })).status;
        const updated = await patch(alice.cookie, { advancedModeEnabled: true });
        const updatedBody = await updated.json();
        console.log("__RESULT__" + JSON.stringify({
          initial,
          invalid,
          updatedStatus: updated.status,
          updatedValue: updatedBody.advancedModeEnabled,
          reloaded: (await me(alice.cookie)).advancedModeEnabled,
          otherUser: (await me(bob.cookie)).advancedModeEnabled
        }));
      } finally {
        server.close();
      }
    });
  `) as { initial: boolean; invalid: number; updatedStatus: number; updatedValue: boolean; reloaded: boolean; otherUser: boolean };

  assert.equal(result.initial, false);
  assert.equal(result.invalid, 400);
  assert.equal(result.updatedStatus, 200);
  assert.equal(result.updatedValue, true);
  assert.equal(result.reloaded, true);
  assert.equal(result.otherUser, false);
});
