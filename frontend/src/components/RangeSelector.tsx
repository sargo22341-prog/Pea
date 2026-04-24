import type { RangeKey } from "@pea/shared";

const ranges: Array<{ key: RangeKey; label: string }> = [
  { key: "1d", label: "1J" },
  { key: "1w", label: "1S" },
  { key: "1m", label: "1M" },
  { key: "1y", label: "1A" },
  { key: "ytd", label: "YTD" },
  { key: "max", label: "Max" }
];

export function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (range: RangeKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ranges.map((range) => (
        <button
          className={range.key === value ? "btn bg-sky text-ink" : "btn-ghost"}
          key={range.key}
          onClick={() => onChange(range.key)}
          type="button"
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
