import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("bootstrap admin cannot delete the current admin account", () => {
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
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const admin = await setup.json();
        const deleted = await fetch(\`\${baseUrl}/api/admin/users/\${admin.id}\`, { method: "DELETE", headers: { Cookie: cookie } });
        console.log("__RESULT__" + JSON.stringify({ status: deleted.status, body: await deleted.json() }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.status, 409);
  assert.match(result.body.message, /propre compte/);
});

test("runtime user update cannot promote a standard user to admin", () => {
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
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
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
        const update = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: userCookie },
          body: JSON.stringify({ role: "admin", bootstrapAdmin: true })
        });
        const me = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: userCookie } });
        const adminRoute = await fetch(\`\${baseUrl}/api/admin/users\`, { headers: { Cookie: userCookie } });
        console.log("__RESULT__" + JSON.stringify({
          updateStatus: update.status,
          meBody: await me.json(),
          adminRouteStatus: adminRoute.status
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.updateStatus, 200);
  assert.equal(result.meBody.user.role, "user");
  assert.equal(result.adminRouteStatus, 403);
});

test("database guard rejects non-bootstrap admin creation and bootstrap marker changes", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { db } from "./db.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('bob', 'hash', 'user')").run();
        const messages = [];
        for (const run of [
          () => db.prepare("INSERT INTO users (username, password_hash, role, bootstrap_admin) VALUES ('eve', 'hash', 'admin', 0)").run(),
          () => db.prepare("UPDATE users SET role = 'admin' WHERE username = 'bob'").run(),
          () => db.prepare("UPDATE users SET bootstrap_admin = 0 WHERE username = 'alice'").run(),
          () => db.prepare("UPDATE users SET bootstrap_admin = 1 WHERE username = 'bob'").run()
        ]) {
          try {
            run();
            messages.push("accepted");
          } catch (error) {
            messages.push(error instanceof Error ? error.message : String(error));
          }
        }
        console.log("__RESULT__" + JSON.stringify({ messages }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.messages.length, 4);
  assert.ok(result.messages.every((message: string) => message !== "accepted"));
});

test("non-admin cannot access admin user routes", () => {
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
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
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
        const list = await fetch(\`\${baseUrl}/api/admin/users\`, { headers: { Cookie: userCookie } });
        const deleteAdmin = await fetch(\`\${baseUrl}/api/admin/users/1\`, { method: "DELETE", headers: { Cookie: userCookie } });
        const create = await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: userCookie },
          body: JSON.stringify({ username: "eve", password })
        });
        console.log("__RESULT__" + JSON.stringify({ listStatus: list.status, createStatus: create.status, deleteStatus: deleteAdmin.status }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.listStatus, 403);
  assert.equal(result.createStatus, 403);
  assert.equal(result.deleteStatus, 403);
});
