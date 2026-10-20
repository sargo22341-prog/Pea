import type { DividendProposalAcceptInput } from "@pea/shared";
import { useEffect } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { useMarketEventReload } from "../../../hooks/useMarketEventReload";
import { api } from "../../../lib/api";

/** Émis après une décision (valider, ignorer, réactiver) : la cloche, « Mon PEA » et le journal se resynchronisent. */
export const DIVIDEND_PROPOSALS_CHANGED_EVENT = "pea:dividend-proposals-changed";

function notifyChanged() {
  window.dispatchEvent(new Event(DIVIDEND_PROPOSALS_CHANGED_EVENT));
}

/**
 * Propositions de dividendes encaissés à valider. Le backend les génère à la lecture, sans appel
 * Yahoo : elles sont relues au retour sur l'application et après chaque décision, où qu'elle ait
 * été prise. Rien n'est crédité sans un appel explicite à `accept`.
 */
export function useDividendProposals() {
  const proposals = useAsync((signal) => api.dividendProposals(signal), "dividend-proposals");
  const { reload } = proposals;
  useMarketEventReload({ reload });

  useEffect(() => {
    const onChanged = () => { void reload(); };
    window.addEventListener(DIVIDEND_PROPOSALS_CHANGED_EVENT, onChanged);
    return () => { window.removeEventListener(DIVIDEND_PROPOSALS_CHANGED_EVENT, onChanged); };
  }, [reload]);

  return {
    pending: proposals.data?.pending ?? [],
    ignored: proposals.data?.ignored ?? [],
    cash: proposals.data?.cash ?? 0,
    error: proposals.error,
    accept: async (id: number, input: DividendProposalAcceptInput) => {
      const decision = await api.acceptDividendProposal(id, input);
      notifyChanged();
      return decision;
    },
    ignore: async (id: number) => {
      await api.ignoreDividendProposal(id);
      notifyChanged();
    },
    restore: async (id: number) => {
      await api.restoreDividendProposal(id);
      notifyChanged();
    }
  };
}

export type DividendProposalsState = ReturnType<typeof useDividendProposals>;
