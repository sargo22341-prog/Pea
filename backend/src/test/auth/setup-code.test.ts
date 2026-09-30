import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

interface SetupCodeResult {
  missingStatus: number;
  wrongStatus: number;
  usersAfterRejections: number;
  validStatus: number;
  secondSetupStatus: number;
}

const setupScript = (body: string) => `
  const { app } = await import("./app.ts");
  const { db } = await import("./db.ts");
  const password = "correct horse battery staple";
  const server = app.listen(0, "127.0.0.1", async () => {
    const setup = (extra) => fetch("http://127.0.0.1:" + server.address().port + "/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password, confirmPassword: password, ...extra })
    });
    try {
      ${body}
    } finally {
      server.close();
    }
  });
`;

test("the first account can only be created with the setup code", () => {
  const result = runBackendScript(setupScript(`
    const missingStatus = (await setup({})).status;
    const wrongStatus = (await setup({ setupCode: "not-the-code" })).status;
    const usersAfterRejections = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    const validStatus = (await setup({ setupCode: "test-setup-code" })).status;
    const secondSetupStatus = (await setup({ setupCode: "test-setup-code" })).status;
    console.log("__RESULT__" + JSON.stringify({ missingStatus, wrongStatus, usersAfterRejections, validStatus, secondSetupStatus }));
  `)) as SetupCodeResult;

  assert.equal(result.missingStatus, 400);
  assert.equal(result.wrongStatus, 403);
  assert.equal(result.usersAfterRejections, 0);
  assert.equal(result.validStatus, 201);
  assert.equal(result.secondSetupStatus, 409);
});

test("without SETUP_CODE a random code is generated and only it is accepted", () => {
  const result = runBackendScript(`
    const { setupCodeLogDetails, isValidSetupCode } = await import("./services/auth/setup-code.ts");
    const details = setupCodeLogDetails();
    console.log("__RESULT__" + JSON.stringify({ details, accepted: isValidSetupCode(details.setupCode), rejected: isValidSetupCode(details.setupCode + "x") }));
  `, { env: { SETUP_CODE: "" } }) as { details: { setupCodeSource: string; setupCode: string }; accepted: boolean; rejected: boolean };

  assert.equal(result.details.setupCodeSource, "generated");
  assert.match(result.details.setupCode, /^[A-Za-z0-9_-]{12}$/);
  assert.equal(result.accepted, true);
  assert.equal(result.rejected, false);
});

test("a code provided through SETUP_CODE is never written to the logs", () => {
  const result = runBackendScript(`
    const { setupCodeLogDetails } = await import("./services/auth/setup-code.ts");
    console.log("__RESULT__" + JSON.stringify(setupCodeLogDetails()));
  `) as Record<string, string>;

  assert.deepEqual(result, { setupCodeSource: "SETUP_CODE" });
});
