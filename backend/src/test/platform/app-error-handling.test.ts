import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("malformed or oversized JSON bodies are rejected as client errors instead of 500", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const malformed = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept-Language": "fr" },
          body: "{not-json"
        });
        const oversized = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: "x".repeat(200 * 1024) })
        });
        console.log("__RESULT__" + JSON.stringify({
          malformedStatus: malformed.status,
          malformedBody: await malformed.json(),
          oversizedStatus: oversized.status
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.malformedStatus, 400);
  assert.equal(result.malformedBody.message, "Requete invalide.");
  assert.equal(result.oversizedStatus, 413);
});
