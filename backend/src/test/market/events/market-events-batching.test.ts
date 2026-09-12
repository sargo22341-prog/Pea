import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript, seedUser } from "../../helpers/backend-script.js";

type StreamedEvent = { event: string; data: { type: string; markets: string[]; range?: string; updatedAt: string } };

test("market refresh sends all impacted events in a single write and only to concerned users", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { MarketEventsService } = await import("./services/market/events/market-events.service.ts");
    ${seedUser}
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, 'AAA.PA', 'AAA', 1, 10, 'EUR')").run();

    function fakeResponse() {
      const res = {
        writes: [],
        closeHandlers: [],
        status() { return res; },
        setHeader() {},
        flushHeaders() {},
        write(chunk) { res.writes.push(String(chunk)); return true; },
        on(event, handler) { if (event === "close") res.closeHandlers.push(handler); return res; },
        end() {}
      };
      return res;
    }

    const service = new MarketEventsService();
    const owner = fakeResponse();
    const stranger = fakeResponse();
    service.connect(1, owner);
    service.connect(2, stranger);
    owner.writes.length = 0;
    stranger.writes.length = 0;

    service.emitMarketRefresh({ markets: ["euronextParis", "euronextParis"], symbols: ["aaa.pa"], updatedAt: "2026-05-06T12:00:00.000Z" });
    for (const res of [owner, stranger]) for (const close of res.closeHandlers) close();

    const events = owner.writes.join("").split("\\n\\n").filter(Boolean).map((block) => {
      const [eventLine, dataLine] = block.split("\\n");
      return { event: eventLine.slice("event: ".length), data: JSON.parse(dataLine.slice("data: ".length)) };
    });
    console.log("__RESULT__" + JSON.stringify({ ownerWrites: owner.writes.length, strangerWrites: stranger.writes.length, events }));
  `);

  assert.equal(result.ownerWrites, 1);
  assert.equal(result.strangerWrites, 0);
  const events = result.events as StreamedEvent[];
  assert.deepEqual(events.map((item) => item.event), [
    "market-snapshot-updated",
    "portfolio-market-updated",
    "portfolio-assets-updated",
    "portfolio-chart-updated",
    "portfolio-performance-updated",
    "dashboard-chart-updated",
    "analysis-updated",
    "dividends-updated"
  ]);
  for (const item of events) {
    assert.equal(item.data.type, item.event);
    assert.deepEqual(item.data.markets, ["euronextParis"]);
    assert.equal(item.data.updatedAt, "2026-05-06T12:00:00.000Z");
  }
  assert.equal(events.find((item) => item.event === "portfolio-performance-updated")?.data.range, "1d");
});
