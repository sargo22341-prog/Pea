import { useEffect, useState } from "react";
import { useApiUrl } from "../../hooks/useApiUrl";

export function AssetIcon({ symbol, className = "h-10 w-10", cacheBust }: { symbol: string; className?: string; cacheBust?: number }) {
  const [failed, setFailed] = useState(false);
  const [globalCacheBust, setGlobalCacheBust] = useState(0);
  const version = cacheBust ?? globalCacheBust;
  const iconUrl = useApiUrl(`/api/assets/${encodeURIComponent(symbol)}/icon?v=${version}`, version);

  useEffect(() => {
    setFailed(false);
  }, [symbol, cacheBust]);

  useEffect(() => {
    const onAssetIconUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (!detail || detail.symbol === symbol) {
        setFailed(false);
        setGlobalCacheBust(typeof detail?.version === "number" ? detail.version : Date.now());
      }
    };
    window.addEventListener("asset-icon-updated", onAssetIconUpdated);
    return () => window.removeEventListener("asset-icon-updated", onAssetIconUpdated);
  }, [symbol]);

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
      src={iconUrl}
    />
  );
}
