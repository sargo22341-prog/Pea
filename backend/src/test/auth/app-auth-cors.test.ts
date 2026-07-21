import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

type CorsHeaders = {
  allowCredentials: string | null;
  allowOrigin: string | null;
  status: number;
};

function requestHealthWithOrigin(nodeEnv: string, origin: string) {
  const script = `
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      try {
        const address = server.address();
        const response = await fetch(\`http://127.0.0.1:\${address.port}/health\`, {
          headers: { Origin: ${JSON.stringify(origin)} }
        });
        console.log("__RESULT__" + JSON.stringify({
          allowCredentials: response.headers.get("access-control-allow-credentials"),
          allowOrigin: response.headers.get("access-control-allow-origin"),
          status: response.status
        }));
      } finally {
        server.close();
      }
    });
  `;

  return runBackendScript(script, { nodeEnv }) as CorsHeaders;
}

test("CORS is enabled for the Vite dev origin outside production", () => {
  const headers = requestHealthWithOrigin("development", "http://localhost:5173");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, "http://localhost:5173");
  assert.equal(headers.allowCredentials, "true");
});

test("API health is available under /api for reverse proxies and mobile setup", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/health\`);
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
});

test("CORS is enabled for the loopback Vite dev origin outside production", () => {
  const headers = requestHealthWithOrigin("development", "http://127.0.0.1:5173");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, "http://127.0.0.1:5173");
  assert.equal(headers.allowCredentials, "true");
});

test("CORS is enabled for the Capacitor Android origin outside production", () => {
  const headers = requestHealthWithOrigin("development", "https://localhost");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, "https://localhost");
  assert.equal(headers.allowCredentials, "true");
});

test("CORS does not echo arbitrary origins outside production", () => {
  const headers = requestHealthWithOrigin("development", "http://example.com");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, null);
  assert.equal(headers.allowCredentials, null);
});

test("CORS is not installed in production", () => {
  const headers = requestHealthWithOrigin("production", "http://localhost:5173");

  assert.equal(headers.status, 200);
  assert.equal(headers.allowOrigin, null);
  assert.equal(headers.allowCredentials, null);
});

test("CORS allows configured production origins for the Android wrapper", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/health\`, {
          headers: { Origin: "https://localhost" }
        });
        console.log("__RESULT__" + JSON.stringify({
          allowCredentials: response.headers.get("access-control-allow-credentials"),
          allowOrigin: response.headers.get("access-control-allow-origin"),
          status: response.status
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "https://localhost" } }) as CorsHeaders;

  assert.equal(result.status, 200);
  assert.equal(result.allowOrigin, "https://localhost");
  assert.equal(result.allowCredentials, "true");
});

test("production login accepts Android WebView origin when configured", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://localhost" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://localhost" },
          body: JSON.stringify({ username: "alice", password })
        });
        console.log("__RESULT__" + JSON.stringify({
          setupStatus: setup.status,
          loginStatus: login.status,
          allowOrigin: login.headers.get("access-control-allow-origin"),
          body: await login.json()
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "https://localhost" } });

  assert.equal(result.setupStatus, 201);
  assert.equal(result.loginStatus, 200);
  assert.equal(result.allowOrigin, "https://localhost");
  assert.equal(result.body.username, "alice");
});

test("production mutating requests accept configured Capacitor origin", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "capacitor://localhost" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        console.log("__RESULT__" + JSON.stringify({
          status: response.status,
          allowOrigin: response.headers.get("access-control-allow-origin"),
          body: await response.json()
        }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "capacitor://localhost" } });

  assert.equal(result.status, 201);
  assert.equal(result.allowOrigin, "capacitor://localhost");
  assert.equal(result.body.username, "alice");
});

test("production mutating requests reject unconfigured origins", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "https://localhost" } });

  assert.equal(result.status, 403);
});

test("production mutating requests reject missing Origin", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        const response = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        console.log("__RESULT__" + JSON.stringify({ status: response.status, body: await response.json() }));
      } finally {
        server.close();
      }
    });
  `, { nodeEnv: "production", env: { CORS_ORIGINS: "https://localhost" } });

  assert.equal(result.status, 403);
});

