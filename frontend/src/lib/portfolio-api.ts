import type {
  CreatePositionInput,
  EditablePortfolioTransaction,
  PortfolioAnalysis,
  PortfolioChartDto,
  PortfolioDividends,
  PortfolioFullDto,
  PortfolioPerformancePoint,
  PortfolioSummary,
  PositionWithMarket,
  PositionRangePerformance,
  RangeKey,
  UpdatePositionInput
} from "@pea/shared";
import { dedupedRequest, request } from "./api-core";

type PositionTransactionInput = {
  tradedAt: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  totalFees?: number;
  currency: string;
};

export const portfolioApi = {
  portfolio: (range?: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PortfolioSummary>(`/api/portfolio${range ? `?range=${range}` : ""}`, signal),
  portfolioFull: (range: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PortfolioFullDto>(`/api/portfolio/full?range=${range}`, signal),
  ensurePosition: (input: { symbol: string; name?: string; currency: string }) =>
    request<PositionWithMarket>("/api/portfolio/positions/ensure", { method: "POST", body: JSON.stringify(input) }),
  addPosition: (input: CreatePositionInput) =>
    request("/api/portfolio/positions", { method: "POST", body: JSON.stringify(input) }),
  updatePosition: (id: number, input: UpdatePositionInput) =>
    request(`/api/portfolio/positions/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deletePosition: (id: number) => request<void>(`/api/portfolio/positions/${id}`, { method: "DELETE" }),
  positionTransactions: (id: number) => request<EditablePortfolioTransaction[]>(`/api/portfolio/positions/${id}/transactions`),
  createPositionTransaction: (positionId: number, input: PositionTransactionInput) =>
    request<EditablePortfolioTransaction[]>(`/api/portfolio/positions/${positionId}/transactions`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updatePositionTransaction: (positionId: number, transactionId: string, input: PositionTransactionInput) =>
    request<EditablePortfolioTransaction[]>(`/api/portfolio/positions/${positionId}/transactions/${transactionId}`, {
      method: "PUT",
      body: JSON.stringify(input)
    }),
  deletePositionTransaction: (positionId: number, transactionId: string) =>
    request<void>(`/api/portfolio/positions/${positionId}/transactions/${transactionId}`, { method: "DELETE" }),
  performance: (range: RangeKey) => request<PortfolioPerformancePoint[]>(`/api/portfolio/performance?range=${range}`),
  portfolioChart: (range: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PortfolioChartDto>(`/api/portfolio/chart?range=${range}`, signal),
  positionsPerformance: (range: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PositionRangePerformance[]>(`/api/portfolio/positions/performance?range=${range}`, signal),
  positionPerformance: (id: number, range: RangeKey, signal?: AbortSignal) =>
    request<PositionRangePerformance>(`/api/portfolio/positions/${id}/performance?range=${range}`, { signal }),
  portfolioDividends: () => request<PortfolioDividends>("/api/portfolio/dividends"),
  portfolioAnalysis: (signal?: AbortSignal) => dedupedRequest<PortfolioAnalysis>("/api/portfolio/analysis", signal)
};
