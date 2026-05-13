export function StaleBadge({ show, label = "Données différées" }: { show?: boolean; label?: string }) {
  if (!show) return null;

  return <span className="rounded bg-amber/15 px-2 py-1 text-xs font-semibold text-amber">{label}</span>;
}
