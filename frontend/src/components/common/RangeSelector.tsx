/**
 * Role du fichier : proposer le choix de range de graphique sous forme de
 * select compact partage par mobile et desktop.
 */

import type { RangeKey } from "@pea/shared";
import { ChevronDown } from "lucide-react";
import { formatRangeLabel } from "../../lib/format";

const ranges: RangeKey[] = ["1d", "1w", "1m", "ytd", "1y", "5y", "10y", "all"];

export function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (range: RangeKey) => void }) {
  return (
    <label className="relative block w-28">
      <span className="sr-only">Range du graphique</span>
      <select
        className="h-9 w-full appearance-none rounded-md border border-line bg-panel2 py-1 pl-3 pr-8 text-sm font-semibold text-slate-100 outline-none transition focus:border-sky"
        onChange={(event) => onChange(event.target.value as RangeKey)}
        value={value}
      >
        {ranges.map((range) => (
          <option key={range} value={range}>
            {formatRangeLabel(range, { compact: true })}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
    </label>
  );
}
