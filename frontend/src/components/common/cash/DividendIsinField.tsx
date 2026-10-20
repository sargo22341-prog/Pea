import { useState } from "react";
import { useTranslation } from "react-i18next";

/** ISIN : deux lettres de pays, neuf caractères alphanumériques et un chiffre de contrôle. */
const isinPattern = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/**
 * Saisie de l'ISIN d'une position quand le pays de la société n'est pas certain : la retenue est
 * recalculée et les prochains dividendes de cette position deviennent sûrs. Le backend vérifie la
 * clé de contrôle.
 */
export function DividendIsinField({ onSave }: { onSave: (isin: string) => Promise<unknown> }) {
  const { t } = useTranslation(["cash", "errors"]);
  const [isin, setIsin] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const normalized = isin.replace(/\s+/g, "").toUpperCase();

  async function save() {
    if (!isinPattern.test(normalized)) {
      setMessage({ tone: "error", text: t("cash:proposals.isinInvalid") });
      return;
    }
    setMessage(null);
    try {
      await onSave(normalized);
      setMessage({ tone: "success", text: t("cash:proposals.isinSaved") });
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : t("errors:unknown") });
    }
  }

  return (
    <div className="space-y-1 rounded-md border border-line p-2">
      <label className="block">
        <span className="muted mb-1 block text-xs">{t("cash:proposals.isinLabel")}</span>
        <span className="flex gap-2">
          <input className="input min-w-0 flex-1" maxLength={20} onChange={(event) => { setIsin(event.target.value); }} placeholder="FR0000120271" value={isin} />
          <button className="btn-ghost shrink-0" onClick={() => void save()} type="button">{t("cash:proposals.isinSave")}</button>
        </span>
      </label>
      {message ? <p className={`text-xs ${message.tone === "error" ? "text-coral" : "text-mint"}`} role="status">{message.text}</p> : null}
    </div>
  );
}
