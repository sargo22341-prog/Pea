import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onToggle
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  function toggle() {
    if (onToggle) {
      onToggle();
      return;
    }
    setUncontrolledOpen((current) => !current);
  }

  return (
    <section className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 border-b border-line p-4 text-left"
        onClick={toggle}
        type="button"
      >
        <span className="font-semibold">{title}</span>
        <ChevronDown className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} size={18} />
      </button>
      {open && <div className="space-y-4 p-4">{children}</div>}
    </section>
  );
}
