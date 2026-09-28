import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MOTION } from "../motion";
import { useDisclosureState } from "./advanced-mode";

/**
 * Détail de niveau 2 à l'intérieur d'un bloc : replié par défaut, déplié d'office en mode
 * avancé, et mémorisé par navigateur sous `storageKey`.
 */
export function DetailsToggle({
  storageKey,
  label,
  children
}: {
  storageKey: string;
  /** Libellé du bouton quand le détail est replié (« Voir les ratios »...). */
  label?: string | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  const { open, toggle } = useDisclosureState(storageKey);
  const contentId = useId();

  return (
    <div className="mt-3">
      <button
        aria-controls={contentId}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-sky transition hover:text-sky/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky"
        onClick={toggle}
        type="button"
      >
        {open ? t("disclosure.hide") : label ?? t("disclosure.showDetails")}
        <ChevronDown aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} size={14} />
      </button>
      {open ? (
        <div className={`mt-3 ${MOTION.rise}`} id={contentId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
