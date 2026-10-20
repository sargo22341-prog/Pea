import type { DividendProposal } from "@pea/shared";
import { CheckCircle2, Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/privacy-context";
import { cashMoney } from "../../../lib/cash/cash-format";
import { formatMaybeDate } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";

function Item({ proposal, added, onSelect }: { proposal: DividendProposal; added: boolean; onSelect: (id: number) => void }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const amount = masquerValeur(cashMoney(added ? proposal.creditedAmount ?? proposal.netAmount : proposal.netAmount, proposal.currency), prive);
  const Icon = added ? CheckCircle2 : Coins;
  return (
    <li>
      <button className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-panel2" onClick={() => { onSelect(proposal.id); }} role="menuitem" type="button">
        <Icon aria-hidden className="mt-0.5 shrink-0 text-mint" size={14} />
        <span className="min-w-0">
          <span className="block font-semibold text-slate-100">
            {added
              ? t("proposals.bellAdded", { symbol: proposal.symbol, amount })
              : t("proposals.bellItem", { symbol: proposal.symbol, amount, date: formatMaybeDate(proposal.paymentAt) })}
          </span>
          <span className="block text-xs text-slate-400">{t(added ? "proposals.bellAddedActions" : "proposals.bellActions")}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * Dividendes en tête du menu de la cloche : ceux à confirmer, puis ceux ajoutés automatiquement et
 * pas encore lus. Un clic ouvre la fenêtre de validation ou de correction.
 */
export function DividendProposalItems({ pending, added, onSelect }: { pending: DividendProposal[]; added: DividendProposal[]; onSelect: (id: number) => void }) {
  const { t } = useTranslation("cash");
  if (!pending.length && !added.length) return null;

  return (
    <div className="border-b border-line">
      <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-mint">{t("proposals.bellTitle")}</p>
      <ul className="max-h-48 divide-y divide-line overflow-y-auto">
        {pending.map((proposal) => <Item added={false} key={proposal.id} onSelect={onSelect} proposal={proposal} />)}
        {added.map((proposal) => <Item added key={proposal.id} onSelect={onSelect} proposal={proposal} />)}
      </ul>
    </div>
  );
}
