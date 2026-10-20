import type { CashLedgerDto, DividendProposalAcceptInput, DividendStatementCheck, DividendStatementsConfirmInput, DividendStatementsImportResult, DividendStatementsPreviewDto } from "@pea/shared";
import { request } from "../api-core";

/** Plusieurs années de relevés sont lues une à une par le serveur : délai d'un import. */
const statementRequestTimeoutMs = 5 * 60_000;

function statementsForm(files: readonly File[], fields: Record<string, string> = {}) {
  const form = new FormData();
  files.forEach((file) => { form.append("files", file); });
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

function singleForm(file: File, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file);
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

/**
 * Relevés de coupons du courtier : les PDF sont renvoyés à la confirmation, le serveur les relit
 * (rien n'est cru du navigateur) et ne les conserve jamais.
 */
export const dividendStatementsApi = {
  previewDividendStatements: (files: readonly File[]) =>
    request<DividendStatementsPreviewDto>("/api/cash/dividend-statements/preview", { method: "POST", body: statementsForm(files), timeoutMs: statementRequestTimeoutMs }),
  confirmDividendStatements: (files: readonly File[], decisions: DividendStatementsConfirmInput) =>
    request<DividendStatementsImportResult>("/api/cash/dividend-statements/confirm", { method: "POST", body: statementsForm(files, { decisions: JSON.stringify(decisions) }), timeoutMs: statementRequestTimeoutMs }),
  verifyDividend: (movementId: number) => request<CashLedgerDto>(`/api/cash/movements/${movementId}/verify`, { method: "POST", body: "{}" }),
  correctDividend: (movementId: number, input: DividendProposalAcceptInput) =>
    request<CashLedgerDto>(`/api/cash/movements/${movementId}`, { method: "PUT", body: JSON.stringify(input) }),
  checkDividendStatement: (movementId: number, file: File) =>
    request<DividendStatementCheck>(`/api/cash/movements/${movementId}/statement-check`, { method: "POST", body: singleForm(file) }),
  certifyDividendStatement: (movementId: number, file: File, correct: boolean) =>
    request<CashLedgerDto>(`/api/cash/movements/${movementId}/statement-certify`, { method: "POST", body: singleForm(file, { correct: String(correct) }) })
};
