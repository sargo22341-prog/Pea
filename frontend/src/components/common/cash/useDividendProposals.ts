import type { DividendProposal, DividendProposalAcceptInput, MarketEventType } from "@pea/shared";
import { useEffect } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { useMarketEventReload } from "../../../hooks/useMarketEventReload";
import { api } from "../../../lib/api";

/** Émis après une décision (valider, corriger, ignorer, réactiver, lire) : la cloche, « Mon PEA » et le journal se resynchronisent. */
export const DIVIDEND_PROPOSALS_CHANGED_EVENT = "pea:dividend-proposals-changed";
/** Émis par la tâche horaire du serveur quand un dividende est ajouté ou devient à confirmer. */
const DIVIDEND_EVENT_TYPES: readonly MarketEventType[] = ["cash-dividends-updated"];

export function notifyDividendsChanged() {
  window.dispatchEvent(new Event(DIVIDEND_PROPOSALS_CHANGED_EVENT));
}

/**
 * Propositions de dividendes encaissés. Le backend les génère sans appel Yahoo ; elles sont relues
 * au retour sur l'application, à l'évènement serveur `cash-dividends-updated` et après chaque
 * décision, où qu'elle ait été prise. Seuls les dividendes sûrs peuvent être ajoutés sans clic,
 * si l'utilisateur l'a activé dans ses réglages.
 */
export function useDividendProposals() {
  const proposals = useAsync((signal) => api.dividendProposals(signal), "dividend-proposals");
  const { reload } = proposals;
  useMarketEventReload({ eventTypes: DIVIDEND_EVENT_TYPES, reload });

  useEffect(() => {
    const onChanged = () => { void reload(); };
    window.addEventListener(DIVIDEND_PROPOSALS_CHANGED_EVENT, onChanged);
    return () => { window.removeEventListener(DIVIDEND_PROPOSALS_CHANGED_EVENT, onChanged); };
  }, [reload]);

  async function after<T>(action: Promise<T>) {
    const value = await action;
    notifyDividendsChanged();
    return value;
  }

  const pending = proposals.data?.pending ?? [];
  const recent = proposals.data?.recent ?? [];
  return {
    pending,
    ignored: proposals.data?.ignored ?? [],
    recent,
    unreadAutoAccepted: proposals.data?.unreadAutoAccepted ?? 0,
    cash: proposals.data?.cash ?? 0,
    error: proposals.error,
    /** Proposition affichée par la fenêtre : relue après chaque changement (ISIN saisi, ajout automatique). */
    find: (id: number): DividendProposal | undefined => [...pending, ...recent].find((proposal) => proposal.id === id),
    accept: (id: number, input: DividendProposalAcceptInput) => after(api.acceptDividendProposal(id, input)),
    correct: (id: number, input: DividendProposalAcceptInput) => after(api.correctDividendProposal(id, input)),
    ignore: (id: number) => after(api.ignoreDividendProposal(id)),
    restore: (id: number) => after(api.restoreDividendProposal(id)),
    markNotificationsRead: () => after(api.markDividendNotificationsRead()),
    setIsin: (positionId: number, isin: string) => after(api.setPositionIsin(positionId, isin))
  };
}

export type DividendProposalsState = ReturnType<typeof useDividendProposals>;
