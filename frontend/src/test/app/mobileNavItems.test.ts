import { describe, expect, it } from "vitest";
import { getMobileNavItems } from "../../components/common/mobileNavItems";

describe("navigation items", () => {
  it("keeps search and calendar out of the menu: search opens from Markets, the calendar from the dashboard", () => {
    const paths = (marketsEnabled: boolean) => getMobileNavItems({ assetNewsEnabled: true }, { marketsEnabled }).map((item) => item.path);
    expect(paths(true)).toEqual(["/", "/news", "/markets", "/analysis", "/dividends"]);
  });

  it("puts search back in the menu when the administrator switches the markets page off", () => {
    const paths = getMobileNavItems({ assetNewsEnabled: false }, { marketsEnabled: false }).map((item) => item.path);
    expect(paths).toEqual(["/", "/search", "/analysis", "/dividends"]);
  });
});
