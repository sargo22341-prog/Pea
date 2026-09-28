import { Info } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { MOTION } from "../motion";

/**
 * Explication de niveau 3 (définition, seuil, source) derrière une icône ⓘ : au survol, au
 * focus clavier ou au tap. Échap referme la bulle.
 */
export function InfoHint({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => { setOpen(true); }} onMouseLeave={() => { setOpen(false); }}>
      <button
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 transition hover:text-slate-200 focus-visible:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky"
        onBlur={() => { setOpen(false); }}
        onClick={() => { setOpen((current) => !current); }}
        onFocus={() => { setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        type="button"
      >
        <Info aria-hidden size={14} />
      </button>
      {open ? (
        <span
          className={`absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-ink/95 p-2.5 text-left text-xs font-normal normal-case leading-snug tracking-normal text-slate-200 shadow-lg backdrop-blur ${MOTION.fadeIn}`}
          id={tooltipId}
          role="tooltip"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
