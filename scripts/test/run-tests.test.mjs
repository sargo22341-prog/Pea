import assert from "node:assert/strict";
import test from "node:test";
import { runAll } from "../run-tests.mjs";

test("toutes les suites tournent meme si l'une echoue, et les echecs sont rapportes", () => {
  const ran = [];
  const failures = runAll((suite) => {
    ran.push(suite.name);
    return suite.name !== "backend";
  });

  assert.deepEqual(ran, ["build shared", "backend", "frontend", "scripts"]);
  assert.deepEqual(failures, ["backend"]);
});

test("aucune suite ne tourne si le prerequis echoue", () => {
  const ran = [];
  const failures = runAll((suite) => {
    ran.push(suite.name);
    return false;
  });

  assert.deepEqual(ran, ["build shared"]);
  assert.deepEqual(failures, ["build shared"]);
});
