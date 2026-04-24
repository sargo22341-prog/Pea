import { useEffect, useState } from "react";

export function AssetIcon({ symbol, className = "h-10 w-10", cacheBust }: { symbol: string; className?: string; cacheBust?: number }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [symbol, cacheBust]);

  if (failed) {
    return (
      <div className={`${className} flex shrink-0 items-center justify-center rounded-md bg-ink font-bold text-sky`}>
        {symbol.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      alt=""
      className={`${className} shrink-0 rounded-md object-contain p-1`}
      loading="lazy"
      onError={() => setFailed(true)}
      src={`/api/assets/${encodeURIComponent(symbol)}/icon${cacheBust ? `?v=${cacheBust}` : ""}`}
    />
  );
}
