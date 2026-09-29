import assert from "node:assert/strict";
import test from "node:test";
import type { AlertEventsPage, UserAlert } from "@pea/shared";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface AlertsHttpResult {
  created: { status: number; body: UserAlert };
  invalidStatuses: number[];
  otherList: UserAlert[];
  otherStatuses: number[];
  paused: UserAlert;
  firstRun: { evaluated: number; triggered: number };
  secondRun: { evaluated: number; triggered: number };
  events: AlertEventsPage;
  otherEvents: AlertEventsPage;
  afterRead: AlertEventsPage;
  disabled: { status: number; run: { evaluated: number; triggered: number } };
  anonymousStatus: number;
}

test("alerts are private to their owner, validated per type, evaluated on stored data and switchable", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { alertsService } = await import("./services/alerts/alerts.service.ts");
    const { featureFlagsService } = await import("./services/admin/feature-flags.service.ts");
    const { upsertCalendarEvents } = await import("./repositories/calendar-events/calendar-events.repository.ts");
    ${sessionUserHelpers}

    db.prepare("INSERT INTO assets (symbol, name, currency) VALUES ('TTE.PA', 'TotalEnergies', 'EUR')").run();
    const owner = createUserWithSession("owner");
    const other = createUserWithSession("other");
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const call = (path, init = {}, cookie = owner.cookie) => fetch(baseUrl + path, {
        ...init,
        headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json", Origin: baseUrl }
      });
      const post = (path, body, cookie) => call(path, { method: "POST", body: JSON.stringify(body) }, cookie);
      const json = async (path, cookie) => (await call(path, {}, cookie)).json();
      try {
        const createdResponse = await post("/api/alerts", { symbol: "tte.pa", type: "price_above", params: { threshold: 60 } });
        const created = await createdResponse.json();
        await post("/api/alerts", { symbol: "TTE.PA", type: "ex_dividend_announced" });
        const pausedAlert = await (await post("/api/alerts", { symbol: "TTE.PA", type: "daily_change", params: { threshold: 3 } })).json();
        const invalid = [
          ["POST", { symbol: "TTE.PA", type: "price_above" }],
          ["POST", { symbol: "TTE.PA", type: "new_52w_high", params: { threshold: 3 } }],
          ["POST", { symbol: "TTE.PA", type: "daily_change", params: { threshold: 500 } }],
          ["POST", { symbol: "TTE.PA", type: "price_below", params: { threshold: 10, direction: "up" } }],
          ["POST", { symbol: "TTE.PA", type: "unknown" }],
          ["POST", { symbol: "DROP TABLE", type: "new_52w_low" }],
          ["POST", { symbol: "TTE.PA", type: "new_52w_low", params: { cooldownHours: 0 } }],
          ["PATCH", { params: { threshold: 999 } }, pausedAlert.id],
          ["PATCH", {}, created.id]
        ];
        const invalidStatuses = [];
        for (const [method, body, id] of invalid) {
          invalidStatuses.push((await call("/api/alerts" + (id ? "/" + id : ""), { method, body: JSON.stringify(body) })).status);
        }
        const otherStatuses = [
          (await call("/api/alerts/" + created.id, { method: "PATCH", body: JSON.stringify({ active: false }) }, other.cookie)).status,
          (await call("/api/alerts/" + created.id, { method: "DELETE" }, other.cookie)).status
        ];
        const otherList = await json("/api/alerts", other.cookie);
        const paused = await (await call("/api/alerts/" + pausedAlert.id, { method: "PATCH", body: JSON.stringify({ active: false }) })).json();

        const firstRun = alertsService.evaluateQuotes([{ symbol: "TTE.PA", price: 58, changePercent: 4, currency: "EUR" }], new Date("2026-09-29T09:00:00.000Z"));
        upsertCalendarEvents([{ symbol: "TTE.PA", eventType: "ex_dividend", eventDate: "2026-12-01T00:00:00.000Z", isEstimate: false }]);
        const secondRun = alertsService.evaluateQuotes([{ symbol: "TTE.PA", price: 61.2, changePercent: 5.5, currency: "EUR" }], new Date("2026-09-29T10:00:00.000Z"));
        const events = await json("/api/alerts/events");
        const otherEvents = await json("/api/alerts/events", other.cookie);
        await post("/api/alerts/events/read", {});
        const afterRead = await json("/api/alerts/events?limit=5");

        featureFlagsService.update({ alerts: false }, owner.id);
        const disabled = {
          status: (await call("/api/alerts")).status,
          run: alertsService.evaluateQuotes([{ symbol: "TTE.PA", price: 40 }], new Date("2026-10-05T10:00:00.000Z"))
        };
        console.log("__RESULT__" + JSON.stringify({
          created: { status: createdResponse.status, body: created },
          invalidStatuses,
          otherList,
          otherStatuses,
          paused,
          firstRun,
          secondRun,
          events,
          otherEvents,
          afterRead,
          disabled,
          anonymousStatus: (await call("/api/alerts", {}, null)).status
        }));
      } finally {
        server.close();
      }
    });
  `, { tempPrefix: "pea-alerts-" }) as AlertsHttpResult;

  assert.equal(result.created.status, 201);
  assert.equal(result.created.body.symbol, "TTE.PA", "the symbol is normalized");
  assert.equal(result.created.body.assetName, "TotalEnergies");
  assert.deepEqual(result.created.body.params, { threshold: 60 });
  assert.deepEqual(result.invalidStatuses, [400, 400, 400, 400, 400, 400, 400, 400, 400]);
  assert.deepEqual(result.otherList, [], "another user never sees the alerts");
  assert.deepEqual(result.otherStatuses, [404, 404]);
  assert.equal(result.paused.active, false);

  assert.deepEqual(result.firstRun, { evaluated: 2, triggered: 0 }, "the paused alert is skipped; first observations only record the state");
  assert.deepEqual(result.secondRun, { evaluated: 2, triggered: 2 }, "price crossing and newly announced ex-dividend date");
  assert.equal(result.events.unread, 2);
  assert.deepEqual(result.events.events.map((event) => event.type).sort(), ["ex_dividend_announced", "price_above"]);
  const priceEvent = result.events.events.find((event) => event.type === "price_above");
  assert.deepEqual(priceEvent?.payload, { price: 61.2, threshold: 60, currency: "EUR" });
  assert.deepEqual(result.otherEvents, { events: [], unread: 0 });
  assert.equal(result.afterRead.unread, 0);
  assert.ok(result.afterRead.events.every((event) => event.read));

  assert.equal(result.disabled.status, 403);
  assert.deepEqual(result.disabled.run, { evaluated: 0, triggered: 0 }, "no evaluation while the switch is off");
  assert.equal(result.anonymousStatus, 401);
});
