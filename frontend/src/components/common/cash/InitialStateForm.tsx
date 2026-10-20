import type { CashAccountSettings } from "@pea/shared";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../lib/api";
import { insufficientFundsDetails } from "../../../lib/cash/insufficient-funds";
import { cashMoney, localInputToIso } from "../../../lib/cash/cash-format";
import { currentDateTimeLocalValue } from "../../../lib/dateTimeInput";

function localValue(iso: string | undefined) {
  return iso ? currentDateTimeLocalValue(new Date(iso)) : currentDateTimeLocalValue();
}

/**
 * Saisie de l'état initial du compte espèces (première configuration ou correction). Seules des
 * valeurs déclarées par l'utilisateur sont envoyées : rien n'est déduit des achats passés.
 */
export function InitialStateForm({
  settings,
  submitLabel,
  onSaved,
  secondaryAction
}: {
  settings?: CashAccountSettings | undefined;
  submitLabel: string;
  onSaved: () => void | Promise<void>;
  secondaryAction?: ReactNode;
}) {
  const { t } = useTranslation(["cash", "errors"]);
  const configured = settings?.status === "ready" && settings.referenceAt !== undefined;
  const [referenceAt, setReferenceAt] = useState(localValue(configured ? settings.referenceAt : undefined));
  const [cash, setCash] = useState(configured ? String(settings.openingCash) : "");
  const [deposits, setDeposits] = useState(configured ? String(settings.openingDeposits) : "");
  const [withdrawals, setWithdrawals] = useState(configured ? String(settings.openingWithdrawals) : "0");
  const [openedAt, setOpenedAt] = useState(settings?.openedAt?.slice(0, 10) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = [cash, deposits, withdrawals].map(Number);
    const reference = localInputToIso(referenceAt);
    if (!reference || values.some((value, index) => !Number.isFinite(value) || value < 0 || [cash, deposits, withdrawals][index]?.trim() === "")) {
      setError(t("errors:numericInvalid"));
      return;
    }
    const [cashValue = 0, depositsValue = 0, withdrawalsValue = 0] = values;
    setSaving(true);
    setError(null);
    try {
      await api.configureCashAccount({ referenceAt: reference, openedAt: openedAt ? localInputToIso(`${openedAt}T00:00`) ?? null : null, cash: cashValue, deposits: depositsValue, withdrawals: withdrawalsValue });
      await onSaved();
    } catch (failure) {
      const details = insufficientFundsDetails(failure);
      const message = failure instanceof Error ? failure.message : t("errors:unknown");
      setError(details ? `${message} (${cashMoney(details.shortfall)})` : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="muted mb-1 block">{t("cash:setup.referenceAt")}</span>
          <input className="input" onChange={(event) => { setReferenceAt(event.target.value); }} required type="datetime-local" value={referenceAt} />
          <span className="muted mt-1 block text-xs">{t("cash:setup.referenceHint")}</span>
        </label>
        <label>
          <span className="muted mb-1 block">{t("cash:setup.cash")}</span>
          <input className="input" min="0" onChange={(event) => { setCash(event.target.value); }} required step="0.01" type="number" value={cash} />
        </label>
        <label>
          <span className="muted mb-1 block">{t("cash:setup.deposits")}</span>
          <input className="input" min="0" onChange={(event) => { setDeposits(event.target.value); }} required step="0.01" type="number" value={deposits} />
        </label>
        <label>
          <span className="muted mb-1 block">{t("cash:setup.withdrawals")}</span>
          <input className="input" min="0" onChange={(event) => { setWithdrawals(event.target.value); }} required step="0.01" type="number" value={withdrawals} />
        </label>
        <label>
          <span className="muted mb-1 block">{t("cash:setup.openedAt")}</span>
          <input className="input" onChange={(event) => { setOpenedAt(event.target.value); }} type="date" value={openedAt} />
        </label>
      </div>
      {error ? <p className="rounded-md border border-coral/40 bg-coral/10 p-2 text-sm text-coral" role="alert">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {secondaryAction}
        <button className="btn-primary" disabled={saving} type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
