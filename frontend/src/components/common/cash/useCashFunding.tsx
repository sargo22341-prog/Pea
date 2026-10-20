import type { CashFundingInput, InsufficientFundsDetails } from "@pea/shared";
import { useState } from "react";
import { insufficientFundsDetails } from "../../../lib/cash/insufficient-funds";
import { InsufficientFundsDialog } from "./InsufficientFundsDialog";

type FundedAction = (funding?: CashFundingInput) => Promise<void>;

/**
 * Exécute une écriture qui peut être refusée faute d'espèces : le refus (422) ouvre la popup de
 * versement, et la confirmation rejoue la même écriture avec le versement saisi. Toute autre
 * erreur est transmise à `onError`.
 */
export function useCashFunding(onError: (error: unknown) => void) {
  const [pending, setPending] = useState<{ details: InsufficientFundsDetails; action: FundedAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: FundedAction) {
    try {
      await action();
    } catch (failure) {
      const details = insufficientFundsDetails(failure);
      if (!details) {
        onError(failure);
        return;
      }
      setError(null);
      setPending({ details, action });
    }
  }

  async function confirm(amount: number) {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.action({ amount });
      setPending(null);
    } catch (failure) {
      const details = insufficientFundsDetails(failure);
      if (details) setPending({ ...pending, details });
      else setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  const dialog = pending ? (
    // Clé sur le manque : un nouveau refus (versement insuffisant) remet à jour le montant prérempli.
    <InsufficientFundsDialog busy={busy} details={pending.details} key={pending.details.shortfall} error={error} onCancel={() => { setPending(null); }} onConfirm={(amount) => void confirm(amount)} />
  ) : null;

  return { run, dialog };
}
