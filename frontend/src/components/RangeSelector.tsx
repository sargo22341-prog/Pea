import type { RangeKey } from "@pea/shared";
import { formatRangeLabel } from "../lib/format";

const ranges: RangeKey[] = ["1d", "1w", "1m", "1y", "ytd", "max"];

export function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (range: RangeKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
  );
}
