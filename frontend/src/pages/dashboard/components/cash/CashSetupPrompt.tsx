import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CashSetupDialog } from "../../../../components/common/cash/CashSetupDialog";

const setupPostponedKey = "pea.cashSetupPostponed";

function readPostponed() {
  try {
    return window.sessionStorage.getItem(setupPostponedKey) === "1";
  } catch {
    return false;
  }
}

function writePostponed() {
  try {
    window.sessionStorage.setItem(setupPostponedKey, "1");
  } catch {
    // Stockage indisponible (navigation privée) : la popup réapparaîtra au prochain affichage.
  }
}

/**
 * Bandeau et popup guidée tant que l'état initial du compte espèces d'un portefeuille existant
 * n'est pas confirmé. « Plus tard » ne masque la popup que pour la session ; le bandeau reste.
 */
export function CashSetupPrompt({ positionsCost, onConfigured }: { positionsCost: number; onConfigured: () => void | Promise<void> }) {
  const { t } = useTranslation("cash");
  const [setupOpen, setSetupOpen] = useState(() => !readPostponed());

  return (
    <section className="card flex flex-col gap-3 border-amber/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-semibold">{t("pending.title")}</h2>
        <p className="muted">{t("pending.description")}</p>
      </div>
      <button className="btn-primary" onClick={() => { setSetupOpen(true); }} type="button">{t("pending.action")}</button>
      {setupOpen ? (
        <CashSetupDialog
          onLater={() => { writePostponed(); setSetupOpen(false); }}
          onSaved={async () => { setSetupOpen(false); await onConfigured(); }}
          positionsCost={positionsCost}
        />
      ) : null}
    </section>
  );
}
