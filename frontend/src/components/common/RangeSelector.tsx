/**
 * Role du fichier : proposer le choix de range de graphique sous forme de
 * select mobile et de boutons desktop.
 */

import type { RangeKey } from "@pea/shared";
import { ChevronDown } from "lucide-react";
import { formatRangeLabel } from "../../lib/format";

const ranges: RangeKey[] = ["1d", "1w", "1m", "ytd", "1y", "5y", "10y", "all"];

export function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (range: RangeKey) => void }) {
  return (
    <>
      <label className="relative ml-auto block w-28 sm:hidden">
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
      <div className="hidden flex-wrap gap-1.5 sm:flex sm:gap-2">
      {ranges.map((range) => (
        <button
          className={`${range === value ? "btn bg-sky text-ink" : "btn-ghost"} whitespace-nowrap px-2 py-1.5 text-xs leading-none sm:px-3 sm:py-2 sm:text-sm`}
          key={range}
          onClick={() => onChange(range)}
          type="button"
        >
          <span className="sm:hidden">{formatRangeLabel(range, { compact: true })}</span>
          <span className="hidden sm:inline">{formatRangeLabel(range)}</span>
        </button>
      ))}
      </div>
    </>
  );
}
