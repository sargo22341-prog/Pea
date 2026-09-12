import type React from "react";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SwitchField({
  checked,
  description,
  label,
  onChange
}: {
  checked: boolean;
  description?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-line bg-ink p-3 text-sm text-slate-300">
      <button
        aria-checked={checked}
        aria-label={label}
        className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${checked ? "bg-mint" : "bg-panel2"}`}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span className={`h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-5" : ""}`} />
      </button>
      <span>
        <span className="block font-medium text-slate-100">{label}</span>
        {description ? <span className="muted mt-1 block">{description}</span> : null}
      </span>
    </label>
  );
}

export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-3 text-sm font-semibold uppercase text-slate-400">{title}</h3>
      {children}
    </section>
  );
}
