import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../../services/auth/password-hash.js";
import { runBackendScript } from "../helpers/backend-script.js";

/** Borne basse très prudente d'une comparaison bcrypt à 12 tours (plusieurs centaines de ms en JS). */
const minimumBcryptDurationMs = 30;

test("an unknown username still pays a full bcrypt comparison", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);

  await verifyPassword("warm-up", undefined);
  const startedAt = performance.now();
  assert.equal(await verifyPassword("anything", undefined), false);
  assert.ok(performance.now() - startedAt >= minimumBcryptDurationMs, "no fast path reveals that the account does not exist");
});

test("usernames are unique and matched without regard to case", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const post = (path, body, cookie = "") => fetch(baseUrl + path, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
      try {
        const setup = await post("/api/auth/setup", { username: "Admin", password, confirmPassword: password, setupCode: "test-setup-code" });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const duplicate = (await post("/api/admin/users", { username: "admin", password }, cookie)).status;
        const created = (await post("/api/admin/users", { username: "Bob", password }, cookie)).status;
        const renameToTaken = (await fetch(baseUrl + "/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ username: "BOB", currentPassword: password })
        })).status;
        const upperLogin = await post("/api/auth/login", { username: "ADMIN", password });
        const unknownLogin = (await post("/api/auth/login", { username: "nobody", password })).status;
        console.log("__RESULT__" + JSON.stringify({ duplicate, created, renameToTaken, upperLogin: upperLogin.status, loggedAs: (await upperLogin.json()).username, unknownLogin }));
      } finally {
        server.close();
      }
    });
  `) as { duplicate: number; created: number; renameToTaken: number; upperLogin: number; loggedAs: string; unknownLogin: number };

  assert.deepEqual(result, { duplicate: 409, created: 201, renameToTaken: 409, upperLogin: 200, loggedAs: "Admin", unknownLogin: 401 });
});
