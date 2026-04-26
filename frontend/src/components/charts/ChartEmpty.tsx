export function ChartEmpty({ label = "Aucune donnée disponible." }: { label?: string }) {
  return <div className="flex h-72 items-center justify-center rounded-lg border border-line/60 text-sm text-slate-400">{label}</div>;
}

