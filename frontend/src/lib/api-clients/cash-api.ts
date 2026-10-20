import type { CashFundingInput, CashLedgerDto, CashMovementType, DividendProposalAcceptInput, DividendProposalsDto, DividendSettings, OpeningDividendsEstimate } from "@pea/shared";
import { request } from "../api-core";

export interface CashMovementPayload {
  type: CashMovementType;
  amount: number;
  effectiveAt: string;
  positionId?: number | undefined;
  note?: string | undefined;
  funding?: CashFundingInput | undefined;
}

export interface CashAccountPayload {
  referenceAt: string;
  openedAt?: string | null | undefined;
  cash: number;
  deposits: number;
  withdrawals: number;
}

export interface DividendProposalDecision {
  ledger: CashLedgerDto;
  proposals: DividendProposalsDto;
}

const proposalAction = (id: number, action: "ignore" | "restore") =>
  request<DividendProposalsDto>(`/api/cash/dividend-proposals/${id}/${action}`, { method: "POST", body: "{}" });

export const cashApi = {
  cashLedger: (signal?: AbortSignal) => request<CashLedgerDto>("/api/cash", { signal: signal ?? null }),
  configureCashAccount: (input: CashAccountPayload) =>
    request<CashLedgerDto>("/api/cash/account", { method: "PUT", body: JSON.stringify(input) }),
  createCashMovement: (input: CashMovementPayload) =>
    request<CashLedgerDto>("/api/cash/movements", { method: "POST", body: JSON.stringify(input) }),
  deleteCashMovement: (id: number) => request<CashLedgerDto>(`/api/cash/movements/${id}`, { method: "DELETE" }),
  dividendProposals: (signal?: AbortSignal) => request<DividendProposalsDto>("/api/cash/dividend-proposals", { signal: signal ?? null }),
  acceptDividendProposal: (id: number, input: DividendProposalAcceptInput) =>
    request<DividendProposalDecision>(`/api/cash/dividend-proposals/${id}/accept`, { method: "POST", body: JSON.stringify(input) }),
  correctDividendProposal: (id: number, input: DividendProposalAcceptInput) =>
    request<DividendProposalDecision>(`/api/cash/dividend-proposals/${id}/correct`, { method: "POST", body: JSON.stringify(input) }),
  ignoreDividendProposal: (id: number) => proposalAction(id, "ignore"),
  restoreDividendProposal: (id: number) => proposalAction(id, "restore"),
  markDividendNotificationsRead: () => request<DividendProposalsDto>("/api/cash/dividend-proposals/notifications/read", { method: "POST", body: "{}" }),
  dividendSettings: (signal?: AbortSignal) => request<DividendSettings>("/api/cash/dividend-settings", { signal: signal ?? null }),
  updateDividendSettings: (settings: DividendSettings) => request<DividendSettings>("/api/cash/dividend-settings", { method: "PUT", body: JSON.stringify(settings) }),
  openingDividendsEstimate: (signal?: AbortSignal) => request<OpeningDividendsEstimate>("/api/cash/account/opening-dividends", { signal: signal ?? null }),
  confirmOpeningDividends: (amount: number | null) =>
    request<CashLedgerDto>("/api/cash/account/opening-dividends", { method: "PUT", body: JSON.stringify({ amount }) }),
  setPositionIsin: (positionId: number, isin: string | null) =>
    request<{ positionId: number; isin: string | null }>(`/api/portfolio/positions/${positionId}/isin`, { method: "PUT", body: JSON.stringify({ isin }) })
};
