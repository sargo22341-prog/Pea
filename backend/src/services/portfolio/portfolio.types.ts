import type { AssetChartDto } from "@pea/shared";

export interface PortfolioMarketDataOptions {
  forceIntradayOpen?: boolean;
  intradayNow?: Date;
  chartDataCache?: Map<string, Promise<AssetChartDto>>;
}

export type TransactionMutationInput = {
  tradedAt: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  totalFees?: number;
  currency: string;
};

export type TransactionSequenceRow = {
  id?: number;
  type: string;
  quantity: number;
  price: number;
  total_fees?: number;
  traded_at: string;
};
