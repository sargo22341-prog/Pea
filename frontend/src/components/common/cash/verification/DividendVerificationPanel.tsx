import type { CashLedgerDto, DividendVerificationInfo } from "@pea/shared";
import { FileCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InfoHint } from "../../disclosure/InfoHint";
import { DividendVerificationBadge } from "./DividendVerificationBadge";
import { StatementCheckResult } from "./StatementCheckResult";
import { useDividendVerification } from "./useDividendVerification";

/**
 * Vérification d'un dividende enregistré : badge, « Marquer comme vérifié » (sans effet sur un
 * dividende certifié) et « Vérifier avec un relevé » : le relevé du mois suffit, aucun reçu par
 * dividende n'est demandé. Rien n'est écrit sans confirmation.
 */
export function DividendVerificationPanel({ movementId, verification, onChanged }: { movementId: number; verification?: DividendVerificationInfo | undefined; onChanged?: ((ledger: CashLedgerDto) => void) | undefined }) {
  const { t } = useTranslation("cash");
  const state = useDividendVerification(movementId, onChanged);

  return (
    <div className="space-y-2 border-t border-line pt-2">
      <div className="flex flex-wrap items-center gap-2">
        {verification ? <DividendVerificationBadge verification={verification} /> : <span className="muted text-xs">{t("verification.none")}</span>}
        <InfoHint label={t("verification.info")}>{t("verification.hint")}</InfoHint>
      </div>
      <div className="flex flex-wrap gap-2">
        {verification ? null : <button className="btn-ghost" disabled={state.busy} onClick={() => void state.markManual()} type="button">{t("verification.markManual")}</button>}
        <label className={`btn-ghost cursor-pointer ${state.busy ? "pointer-events-none opacity-60" : ""}`}>
          <FileCheck aria-hidden size={16} />
          {t("verification.withStatement")}
          <input accept="application/pdf,.pdf" className="hidden" onChange={(event) => { void state.checkStatement(event.target.files?.[0]); event.target.value = ""; }} type="file" />
        </label>
      </div>
      <p className="muted text-xs">{state.busy ? t("verification.checking") : t("verification.statementHelp")}</p>
      {state.check ? <StatementCheckResult busy={state.busy} check={state.check} onCertify={(correct) => void state.certify(correct)} /> : null}
      {state.error ? <p className="text-xs text-coral" role="alert">{state.error}</p> : null}
    </div>
  );
}
