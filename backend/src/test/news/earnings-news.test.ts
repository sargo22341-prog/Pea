import assert from "node:assert/strict";
import test from "node:test";
import type { NewsArticle } from "@pea/shared";
import { markEarningsArticles } from "../../services/news/earnings-window.js";
import { runBackendScript } from "../helpers/backend-script.js";

function article(url: string, publishedAt: string | undefined, symbols: string[]): NewsArticle {
  return {
    title: url,
    description: "",
    url,
    publishedAt,
    relatedAssets: symbols.map((symbol) => ({ symbol, name: symbol }))
  };
}

const earningsDays = new Map([["AAA.PA", ["2026-07-24"]], ["BBB.PA", ["2026-07-10"]]]);

test("articles published within one civil day of an earnings release are marked for that asset only", () => {
  const [before, sameDay, after, tooLate, noDate, otherAsset] = markEarningsArticles([
    article("before", "2026-07-23T08:00:00.000Z", ["AAA.PA"]),
    article("same-day", "2026-07-24T06:00:00.000Z", ["AAA.PA", "BBB.PA"]),
    article("after", "2026-07-25T20:00:00.000Z", ["aaa.pa"]),
    article("too-late", "2026-07-26T09:00:00.000Z", ["AAA.PA"]),
    article("no-date", undefined, ["AAA.PA"]),
    article("other", "2026-07-24T09:00:00.000Z", ["CCC.PA"])
  ], earningsDays, "Europe/Paris");

  assert.deepEqual(before?.earningsSymbols, ["AAA.PA"]);
  assert.deepEqual(sameDay?.earningsSymbols, ["AAA.PA"], "an article linked to two assets is only marked for the one publishing");
  assert.deepEqual(after?.earningsSymbols, ["aaa.pa"], "symbols are compared case-insensitively and kept as received");
  assert.equal(tooLate?.earningsSymbols, undefined, "two days after the release is outside the window");
  assert.equal(noDate?.earningsSymbols, undefined);
  assert.equal(otherAsset?.earningsSymbols, undefined);
});

test("the article day is read in the application time zone", () => {
  // 22:30 UTC le 25 juillet = 26 juillet 00:30 à Paris : hors fenêtre à Paris, dans la fenêtre en UTC.
  const late = article("late", "2026-07-25T22:30:00.000Z", ["AAA.PA"]);
  assert.equal(markEarningsArticles([late], earningsDays, "Europe/Paris")[0]?.earningsSymbols, undefined);
  assert.deepEqual(markEarningsArticles([late], earningsDays, "UTC")[0]?.earningsSymbols, ["AAA.PA"]);
});

test("earnings dates are read from the calendar events of the linked assets", () => {
  const result = runBackendScript(`
    const { upsertCalendarEvents } = await import("./repositories/calendar-events/calendar-events.repository.ts");
    const { annotateEarningsArticles } = await import("./services/news/earnings-news.ts");
    upsertCalendarEvents([
      { symbol: "AAA.PA", eventType: "earnings", eventDate: "2026-07-24T00:00:00.000Z", isEstimate: false },
      { symbol: "AAA.PA", eventType: "ex_dividend", eventDate: "2026-05-02T00:00:00.000Z", isEstimate: false },
      { symbol: "BBB.PA", eventType: "earnings", eventDate: "2026-03-01T00:00:00.000Z", isEstimate: false }
    ]);
    const make = (url, publishedAt, symbol) => ({ title: url, description: "", url, publishedAt, relatedAssets: [{ symbol, name: symbol }] });
    const annotated = annotateEarningsArticles([
      make("earnings", "2026-07-24T10:00:00.000Z", "AAA.PA"),
      make("dividend", "2026-05-02T10:00:00.000Z", "AAA.PA"),
      make("old-release", "2026-07-24T10:00:00.000Z", "BBB.PA")
    ], "Europe/Paris");
    console.log("__RESULT__" + JSON.stringify(annotated.map((item) => item.earningsSymbols ?? [])));
  `, { tempPrefix: "pea-earnings-news-" }) as string[][];

  assert.deepEqual(result, [["AAA.PA"], [], []]);
});
