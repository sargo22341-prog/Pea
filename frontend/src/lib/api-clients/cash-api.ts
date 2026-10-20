import type { CashFundingInput, CashLedgerDto, CashMovementType } from "@pea/shared";
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

export const cashApi = {
  cashLedger: (signal?: AbortSignal) => request<CashLedgerDto>("/api/cash", { signal: signal ?? null }),
  configureCashAccount: (input: CashAccountPayload) =>
    request<CashLedgerDto>("/api/cash/account", { method: "PUT", body: JSON.stringify(input) }),
  createCashMovement: (input: CashMovementPayload) =>
    request<CashLedgerDto>("/api/cash/movements", { method: "POST", body: JSON.stringify(input) }),
  deleteCashMovement: (id: number) => request<CashLedgerDto>(`/api/cash/movements/${id}`, { method: "DELETE" })
};
