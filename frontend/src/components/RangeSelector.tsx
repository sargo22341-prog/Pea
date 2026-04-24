import type { RangeKey } from "@pea/shared";
import { formatRangeLabel } from "../lib/format";

const ranges: RangeKey[] = ["1d", "1w", "1m", "1y", "ytd", "max"];

export function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (range: RangeKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ranges.map((range) => (
        <button
          className={range === value ? "btn bg-sky text-ink" : "btn-ghost"}
          key={range}
          onClick={() => onChange(range)}
          type="button"
        >
          {formatRangeLabel(range)}
        </button>
      ))}
    </div>
  );
}
