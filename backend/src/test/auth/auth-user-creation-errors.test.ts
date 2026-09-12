import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("user creation only maps username uniqueness violations to 409", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { authRepository } from "./repositories/auth/auth.repository.ts";

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
        const createUser = (username) => fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ username, password })
        });

        const duplicate = await createUser("alice");
        const originalInsert = authRepository.insertUser.bind(authRepository);
        authRepository.insertUser = () => {
          throw new Error("SQLITE_BUSY: database is locked");
        };
        const storageFailure = await createUser("bob");
        authRepository.insertUser = originalInsert;

        console.log("__RESULT__" + JSON.stringify({
          duplicateStatus: duplicate.status,
          storageFailureStatus: storageFailure.status,
          storageFailureBody: await storageFailure.json()
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.duplicateStatus, 409);
  assert.equal(result.storageFailureStatus, 500);
  assert.doesNotMatch(result.storageFailureBody.message, /deja utilise/);
});
