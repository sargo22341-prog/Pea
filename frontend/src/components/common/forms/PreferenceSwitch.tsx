import type { ReactNode } from "react";

/** Interrupteur de préférence avec titre, aide courte et explication détaillée. */
export function PreferenceSwitch({
  checked,
  onToggle,
  title,
  help,
  details
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  help: string;
  details?: ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-line bg-ink p-3">
      <button
        aria-checked={checked}
        aria-label={title}
        className={`mt-1 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${checked ? "bg-mint" : "bg-panel2"}`}
        onClick={onToggle}
        role="switch"
        type="button"
      >
        <span className={`h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-5" : ""}`} />
      </button>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="muted block">{help}</span>
        {details ? <span className="mt-2 block text-sm text-slate-300">{details}</span> : null}
      </span>
    </label>
  );
}
