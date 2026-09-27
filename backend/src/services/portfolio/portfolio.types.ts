import type { AssetChartDto } from "@pea/shared";

export interface PortfolioMarketDataOptions {
  forceIntradayOpen?: boolean;
  intradayNow?: Date;
  chartDataCache?: Map<string, Promise<AssetChartDto>>;
}

export interface TransactionMutationInput {
  tradedAt: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  totalFees?: number | undefined;
  currency: string;
}

export interface TransactionSequenceRow {
  id?: number | undefined;
  type: string;
  quantity: number;
  price: number;
  total_fees?: number | undefined;
  traded_at: string;
}
