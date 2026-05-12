import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export function Collapsible({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 border-b border-line p-4 text-left"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="font-semibold">{title}</span>
        <ChevronDown className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} size={18} />
      </button>
      {open && <div className="space-y-4 p-4">{children}</div>}
    </section>
  );
}
