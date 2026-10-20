import type { DividendProposal } from "@pea/shared";
import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/privacy-context";
import { cashMoney } from "../../../lib/cash/cash-format";
import { formatMaybeDate } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";

/** Dividendes à valider, en tête du menu de la cloche : un clic ouvre la fenêtre de validation. */
export function DividendProposalItems({ proposals, onSelect }: { proposals: DividendProposal[]; onSelect: (proposal: DividendProposal) => void }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  if (!proposals.length) return null;

  return (
    <div className="border-b border-line">
      <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-mint">{t("proposals.bellTitle")}</p>
      <ul className="max-h-48 divide-y divide-line overflow-y-auto">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            <button className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-panel2" onClick={() => { onSelect(proposal); }} role="menuitem" type="button">
              <Coins aria-hidden className="mt-0.5 shrink-0 text-mint" size={14} />
              <span className="min-w-0">
                <span className="block font-semibold text-slate-100">
                  {t("proposals.bellItem", { symbol: proposal.symbol, amount: masquerValeur(cashMoney(proposal.netAmount, proposal.currency), prive), date: formatMaybeDate(proposal.paymentAt) })}
                </span>
                <span className="block text-xs text-slate-400">{t("proposals.bellActions")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
