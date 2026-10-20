import type { DividendStatementCheck } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../../contexts/privacy-context";
import { cashMoney } from "../../../../lib/cash/cash-format";
import { formatStatementPeriod } from "../../../../lib/cash/ledger-entry";
import { formatMaybeDate } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";

/**
 * Résultat de la lecture d'un relevé pour un dividende : conforme (certifiable), écart de montant
 * ou de date (correction proposée), ou avertissement précis avec les lignes trouvées pour l'actif.
 */
export function StatementCheckResult({ check, busy, onCertify }: { check: DividendStatementCheck; busy: boolean; onCertify: (correct: boolean) => void }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const money = (value: number) => masquerValeur(cashMoney(value), prive);
  const conforming = check.outcome === "match" || check.outcome === "already_certified";
  const correctable = check.outcome === "amount_mismatch" || check.outcome === "date_mismatch";
  const message = t(`verification.outcomes.${check.outcome}`, {
    expected: check.outcome === "date_mismatch" ? formatMaybeDate(check.expected.effectiveAt) : money(check.expected.amount),
    found: check.outcome === "date_mismatch" ? formatMaybeDate(check.match?.paymentDate) : money(check.match?.net ?? 0),
    period: formatStatementPeriod(check.period)
  });

  return (
    <div className={`space-y-2 rounded-md border p-2 text-xs ${conforming ? "border-mint/40 bg-mint/10 text-mint" : "border-amber/40 bg-amber/10 text-amber"}`} role={conforming ? "status" : "alert"}>
      <p>{message}</p>
      {conforming ? null : (
        <div className="text-slate-300">
          <p>{t("verification.linesFound")}</p>
          {check.found.length ? (
            <ul className="list-inside list-disc">
              {check.found.map((line) => (
                <li key={line.lineNo}>{t("verification.line", { date: formatMaybeDate(line.paymentDate), name: line.name, net: money(line.net) })}</li>
              ))}
            </ul>
          ) : <p>{t("verification.noLines")}</p>}
        </div>
      )}
      {check.outcome === "match" ? <button className="btn-primary" disabled={busy} onClick={() => { onCertify(false); }} type="button">{t("verification.certify")}</button> : null}
      {correctable ? <button className="btn-primary" disabled={busy} onClick={() => { onCertify(true); }} type="button">{t("verification.correctAndCertify")}</button> : null}
    </div>
  );
}
