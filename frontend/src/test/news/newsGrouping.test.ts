import type { NewsArticle } from "@pea/shared";
import { describe, expect, it } from "vitest";
import { groupNewsByAsset } from "../../pages/news/lib/newsGrouping";

function article(url: string, publishedAt: string, symbols: string[], earningsSymbols?: string[]): NewsArticle {
  return {
    title: url,
    description: "",
    url,
    publishedAt,
    relatedAssets: symbols.map((symbol) => ({ symbol, name: `${symbol} name` })),
    ...(earningsSymbols ? { earningsSymbols } : {})
  };
}

describe("groupNewsByAsset", () => {
  it("puts an article linked to several assets in each group and orders groups by their latest article", () => {
    const groups = groupNewsByAsset([
      article("shared", "2026-07-20T10:00:00.000Z", ["AI.PA", "TTE.PA"]),
      article("tte-only", "2026-07-22T10:00:00.000Z", ["TTE.PA"]),
      article("ai-old", "2026-07-01T10:00:00.000Z", ["AI.PA"])
    ]);

    expect(groups.map((group) => group.symbol)).toEqual(["TTE.PA", "AI.PA"]);
    expect(groups[0]?.articles.map((item) => item.url)).toEqual(["tte-only", "shared"]);
    expect(groups[1]?.articles.map((item) => item.url)).toEqual(["shared", "ai-old"]);
  });

  it("moves the earnings-day articles of the group's asset to the top", () => {
    const [ai, tte] = groupNewsByAsset([
      article("recent", "2026-07-25T10:00:00.000Z", ["AI.PA", "TTE.PA"]),
      article("results", "2026-07-20T10:00:00.000Z", ["AI.PA", "TTE.PA"], ["AI.PA"])
    ]);

    expect(ai?.articles.map((item) => item.url)).toEqual(["results", "recent"]);
    expect(ai?.earningsCount).toBe(1);
    expect(tte?.articles.map((item) => item.url)).toEqual(["recent", "results"]);
    expect(tte?.earningsCount).toBe(0);
  });

  it("ignores articles without linked asset and duplicates within a group", () => {
    const duplicate = article("dup", "2026-07-20T10:00:00.000Z", ["AI.PA", "ai.pa"]);
    const groups = groupNewsByAsset([duplicate, article("orphan", "2026-07-21T10:00:00.000Z", [])]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.articles).toHaveLength(1);
  });
});
