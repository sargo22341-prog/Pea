import { Wallet } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { usePullToRefreshSuspended } from "../../../hooks/usePullToRefreshSuspended";
import { cashMoney } from "../../../lib/cash/cash-format";
import { MOTION } from "../motion";
import { InitialStateForm } from "./InitialStateForm";
import { OpeningDividendsStep } from "./OpeningDividendsStep";

/**
 * Popup guidée affichée tant que le compte espèces d'un portefeuille existant n'a pas d'état
 * initial confirmé : elle explique la séparation versements / achats et recueille le solde et
 * les versements historiques. « Plus tard » la masque pour la session seulement. Une fois l'état
 * initial enregistré, une seconde étape propose les dividendes déjà perçus, déduits du solde.
 */
export function CashSetupDialog({ positionsCost, onLater, onSaved }: { positionsCost: number; onLater: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useTranslation("cash");
  const [step, setStep] = useState<"initial" | "dividends">("initial");
  usePullToRefreshSuspended();

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center ${MOTION.overlay}`} role="presentation">
      <div aria-labelledby="cash-setup-title" aria-modal="true" className={`max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg border border-line bg-ink/95 shadow-glow backdrop-blur ${MOTION.dialog}`} role="dialog">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky/40 bg-sky/10 text-sky">
            <Wallet size={20} />
          </div>
          <h2 className="text-base font-semibold" id="cash-setup-title">{t("setup.title")}</h2>
        </div>
        <div className="space-y-3 p-4 text-sm leading-6 text-slate-300">
          {step === "initial" ? (
            <>
              <p>{t("setup.intro")}</p>
              <p>{t("setup.reinvest")}</p>
              <p className="rounded-md border border-amber/40 bg-amber/10 p-2 text-amber">{t("setup.missing")}</p>
              <p className="muted">{t("setup.positionsCost", { amount: cashMoney(positionsCost) })}</p>
              <InitialStateForm
                onSaved={() => { setStep("dividends"); }}
                secondaryAction={<button className="btn-ghost" onClick={onLater} type="button">{t("setup.later")}</button>}
                submitLabel={t("setup.confirm")}
              />
            </>
          ) : (
            <OpeningDividendsStep onDone={onSaved} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
