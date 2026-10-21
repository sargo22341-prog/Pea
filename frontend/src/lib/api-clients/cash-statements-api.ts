import type { CashStatementsConfirmInput, CashStatementsImportResult, CashStatementsPreviewDto } from "@pea/shared";
import { request } from "../api-core";

/** Plusieurs années de relevés sont lues par le serveur, quelques-unes à la fois : délai d'un import. */
const statementRequestTimeoutMs = 10 * 60_000;

function statementsForm(files: readonly File[], fields: Record<string, string> = {}) {
  const form = new FormData();
  files.forEach((file) => { form.append("files", file); });
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

/**
 * Relevés espèces du courtier : les PDF sont renvoyés à la confirmation, le serveur les relit
 * (rien n'est cru du navigateur) et ne les conserve jamais.
 */
export const cashStatementsApi = {
  previewCashStatements: (files: readonly File[]) =>
    request<CashStatementsPreviewDto>("/api/cash/cash-statements/preview", { method: "POST", body: statementsForm(files), timeoutMs: statementRequestTimeoutMs }),
  confirmCashStatements: (files: readonly File[], decisions: CashStatementsConfirmInput) =>
    request<CashStatementsImportResult>("/api/cash/cash-statements/confirm", { method: "POST", body: statementsForm(files, { decisions: JSON.stringify(decisions) }), timeoutMs: statementRequestTimeoutMs })
};
