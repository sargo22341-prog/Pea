import type {
  CashFundingInput,
  EditablePortfolioTransaction,
  PortfolioAnalysis,
  PortfolioDividends,
  PortfolioFullDto,
  PositionWithMarket,
  PositionRangePerformance,
  RangeKey,
  SplitDecision,
  UserAssetSplit
} from "@pea/shared";
import { dedupedRequest, request } from "../api-core";

interface PositionTransactionInput {
  tradedAt: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  totalFees?: number;
  currency: string;
  /** Versement confirmé par l'utilisateur quand le solde espèces ne couvre pas l'achat. */
  funding?: CashFundingInput | undefined;
  /** Enregistre une opération identique à une opération déjà saisie (sinon refus 409). */
  confirmDuplicate?: boolean | undefined;
}

export const portfolioApi = {
  portfolioFull: (range: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PortfolioFullDto>(`/api/portfolio/full?range=${range}`, signal),
  ensurePosition: (input: { symbol: string; name?: string; currency: string }) =>
    request<PositionWithMarket>("/api/portfolio/positions/ensure", { method: "POST", body: JSON.stringify(input) }),
  deletePosition: (id: number) => request<undefined>(`/api/portfolio/positions/${id}`, { method: "DELETE" }),
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
    request<undefined>(`/api/portfolio/positions/${positionId}/transactions/${transactionId}`, { method: "DELETE" }),
  positionsPerformance: (range: RangeKey, signal?: AbortSignal) =>
    dedupedRequest<PositionRangePerformance[]>(`/api/portfolio/positions/performance?range=${range}`, signal),
  positionPerformance: (id: number, range: RangeKey, signal?: AbortSignal) =>
    request<PositionRangePerformance>(`/api/portfolio/positions/${id}/performance?range=${range}`, { signal: signal ?? null }),
  portfolioDividends: () => request<PortfolioDividends>("/api/portfolio/dividends"),
  portfolioAnalysis: (signal?: AbortSignal) => dedupedRequest<PortfolioAnalysis>("/api/portfolio/analysis", signal),
  splits: (symbol?: string, signal?: AbortSignal) =>
    request<UserAssetSplit[]>(`/api/splits${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`, { signal: signal ?? null }),
  decideSplit: (id: number, decision: SplitDecision) =>
    request<UserAssetSplit>(`/api/splits/${id}/decision`, { method: "POST", body: JSON.stringify({ decision }) })
};
