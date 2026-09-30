import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { readLimitedBody } from "../../services/assets/icon.helpers.js";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

async function withImageServer(run: (baseUrl: string) => Promise<void>) {
  const server = http.createServer((req, res) => {
    if (req.url === "/declared") {
      res.writeHead(200, { "content-length": String(2_000_000) });
      res.end(Buffer.alloc(10));
      return;
    }
    const size = req.url === "/small" ? 512 : 2_000_000;
    res.writeHead(200, { "content-type": "image/png" });
    res.write(Buffer.alloc(size / 2));
    res.end(Buffer.alloc(size / 2));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("downloaded icons are read as a stream and dropped above the size limit", async () => {
  await withImageServer(async (baseUrl) => {
    assert.equal((await readLimitedBody(await fetch(`${baseUrl}/small`), 1_000))?.length, 512);
    assert.equal(await readLimitedBody(await fetch(`${baseUrl}/large`), 1_000_000), undefined);
    assert.equal(await readLimitedBody(await fetch(`${baseUrl}/declared`), 1_000_000), undefined);
  });
});

test("remote icon lookups are rate limited per user while cached icons stay available", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { iconService } = await import("./services/assets/icon.service.ts");
    ${sessionUserHelpers}
    let remoteFetches = 0;
    iconService.fetchAndStoreIcon = async () => { remoteFetches += 1; return undefined; };
    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const icon = (index, cookie) => fetch(baseUrl + "/api/assets/SYM" + index + ".PA/icon", { headers: { Cookie: cookie } });
      try {
        const aliceResponses = [];
        for (let index = 0; index < 31; index += 1) aliceResponses.push(await icon(index, alice.cookie));
        const bobResponse = await icon(99, bob.cookie);
        const invalidSymbol = (await fetch(baseUrl + "/api/assets/" + encodeURIComponent("<script>") + "/icon", { headers: { Cookie: alice.cookie } })).status;
        console.log("__RESULT__" + JSON.stringify({
          remoteFetches,
          statuses: [...new Set(aliceResponses.map((response) => response.status))],
          throttledCache: aliceResponses[30].headers.get("cache-control"),
          allowedCache: aliceResponses[0].headers.get("cache-control"),
          bobCache: bobResponse.headers.get("cache-control"),
          invalidSymbol
        }));
      } finally {
        server.close();
      }
    });
  `) as { remoteFetches: number; statuses: number[]; throttledCache: string; allowedCache: string; bobCache: string; invalidSymbol: number };

  assert.equal(result.remoteFetches, 31, "30 lookups for alice, then one for bob");
  assert.deepEqual(result.statuses, [200]);
  assert.equal(result.throttledCache, "no-store");
  assert.equal(result.allowedCache, "private, max-age=3600");
  assert.equal(result.bobCache, "private, max-age=3600");
  assert.equal(result.invalidSymbol, 400);
});
