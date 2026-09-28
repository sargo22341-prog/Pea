import type { User } from "@pea/shared";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AssetDetailPage } from "../../pages/asset-detail/AssetDetailPage";
import { LocationProbe } from "./LocationProbe";

export const assetPageUser = {
  id: 1,
  username: "alice",
  role: "user",
  defaultChartRange: "1d",
  assetNewsEnabled: false,
  localPeaSearchEnabled: true,
  advancedModeEnabled: false
} as const;

/** Fiche actif minimale : cotation, courbe à deux points, aucune donnée annexe. */
export function baseAssetDto(symbol: string, name: string) {
  return {
    appTimezone: "Europe/Paris",
    quote: { symbol, name, price: 100, currency: "EUR", exchange: "Paris", marketState: "CLOSED" },
    marketInfo: { regularMarketPrice: 100, marketState: "CLOSED" },
    chart: { symbol, range: "1d", interval: "5m", timestamps: [1_000, 2_000], prices: [99, 100] },
    dividends: [] as unknown[],
    news: [] as unknown[],
    position: null,
    marketSession: null,
    isInWatchlist: false,
    stale: false,
    peaEligibility: { status: "eligible" },
    isEtf: false
  };
}

export function renderAssetPage(symbol: string, options: { search?: string; user?: Partial<User> } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/assets/${symbol}${options.search ?? ""}`]}>
      <Routes>
        <Route
          element={(
            <>
              <AssetDetailPage user={{ ...assetPageUser, ...options.user } as never} />
              <LocationProbe />
            </>
          )}
          path="/assets/:symbol"
        />
      </Routes>
    </MemoryRouter>
  );
}
