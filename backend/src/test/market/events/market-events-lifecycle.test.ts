import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface LifecycleResult {
  perUserLimit: { firstClosed: boolean; lastOpen: boolean; otherUserOpen: boolean; clients: number };
  afterSessionDisconnect: { closedSession: boolean; otherSessionOpen: boolean };
  afterUserDisconnect: { userClosed: boolean; otherUserOpen: boolean };
  afterCloseAll: number;
}

test("market streams are limited per user and closed with their session or account", () => {
  const result = runBackendScript(`
    const { MarketEventsService } = await import("./services/market/events/market-events.service.ts");

    function fakeResponse() {
      const res = {
        ended: false,
        closeHandlers: [],
        status() { return res; },
        setHeader() {},
        flushHeaders() {},
        write() { return true; },
        on(event, handler) { if (event === "close") res.closeHandlers.push(handler); return res; },
        end() { res.ended = true; for (const close of res.closeHandlers) close(); }
      };
      return res;
    }

    const service = new MarketEventsService();
    const alice = Array.from({ length: 11 }, () => fakeResponse());
    alice.forEach((res, index) => service.connect(1, index < 5 ? "alice-phone" : "alice-laptop", res));
    const bob = fakeResponse();
    service.connect(2, "bob", bob);
    const perUserLimit = { firstClosed: alice[0].ended, lastOpen: !alice[10].ended, otherUserOpen: !bob.ended, clients: service.stats().clients };

    service.disconnectSession("alice-phone");
    const afterSessionDisconnect = { closedSession: alice.slice(1, 5).every((res) => res.ended), otherSessionOpen: alice.slice(5).every((res) => !res.ended) };

    service.disconnectUser(1);
    const afterUserDisconnect = { userClosed: alice.every((res) => res.ended), otherUserOpen: !bob.ended };

    service.closeAll();
    console.log("__RESULT__" + JSON.stringify({ perUserLimit, afterSessionDisconnect, afterUserDisconnect, afterCloseAll: service.stats().clients }));
  `) as LifecycleResult;

  assert.deepEqual(result.perUserLimit, { firstClosed: true, lastOpen: true, otherUserOpen: true, clients: 11 });
  assert.deepEqual(result.afterSessionDisconnect, { closedSession: true, otherSessionOpen: true });
  assert.deepEqual(result.afterUserDisconnect, { userClosed: true, otherUserOpen: true });
  assert.equal(result.afterCloseAll, 0);
});

test("logging out closes the market stream opened by that session", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { marketEventsService } = await import("./services/market/events/market-events.service.ts");
    ${sessionUserHelpers}
    const alice = createUserWithSession("alice");
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      try {
        const stream = await fetch(baseUrl + "/api/market/events", { headers: { Cookie: alice.cookie } });
        const reader = stream.body.getReader();
        await reader.read();
        const openBefore = marketEventsService.stats().clients;
        await fetch(baseUrl + "/api/auth/logout", { method: "POST", headers: { Cookie: alice.cookie, Origin: baseUrl } });
        let done = false;
        while (!done) ({ done } = await reader.read());
        console.log("__RESULT__" + JSON.stringify({ openBefore, openAfter: marketEventsService.stats().clients, streamEnded: done }));
      } finally {
        server.close();
      }
    });
  `) as { openBefore: number; openAfter: number; streamEnded: boolean };

  assert.equal(result.openBefore, 1);
  assert.equal(result.openAfter, 0);
  assert.equal(result.streamEnded, true);
});
