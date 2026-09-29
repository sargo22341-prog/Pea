import { describe, expect, it } from "vitest";
import { getMobileNavItems } from "../../components/common/mobileNavItems";

describe("navigation items", () => {
  it("adds the calendar and shows the markets page only when the administrator enables it", () => {
    const paths = (marketsEnabled: boolean) => getMobileNavItems({ assetNewsEnabled: false }, { marketsEnabled }).map((item) => item.path);
    expect(paths(true)).toEqual(["/", "/markets", "/search", "/analysis", "/calendar", "/dividends"]);
    expect(paths(false)).not.toContain("/markets");
  });
});
