import { useEffect, useState } from "react";
import { useAuthenticatedImageUrl } from "../../hooks/useAuthenticatedImageUrl";

export function AssetIcon({ symbol, className = "h-10 w-10", cacheBust }: { symbol: string; className?: string; cacheBust?: number | undefined }) {
  // L'echec d'affichage est rattache au couple symbole/version fournie : il s'efface quand l'un change.
  const iconKey = `${symbol}:${cacheBust ?? "global"}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const failed = failedKey === iconKey;
  const [globalCacheBust, setGlobalCacheBust] = useState(0);
  const version = cacheBust ?? globalCacheBust;
  const iconUrl = useAuthenticatedImageUrl(`/api/assets/${encodeURIComponent(symbol)}/icon?v=${version}`, version, !failed);

  useEffect(() => {
    const onAssetIconUpdated = (event: WindowEventMap["asset-icon-updated"]) => {
      if (event.detail.symbol !== symbol) return;
      setFailedKey(null);
      setGlobalCacheBust(event.detail.version);
    };
    window.addEventListener("asset-icon-updated", onAssetIconUpdated);
    return () => { window.removeEventListener("asset-icon-updated", onAssetIconUpdated); };
  }, [symbol]);

  if (failed || !iconUrl) {
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
      onError={() => { setFailedKey(iconKey); }}
      src={iconUrl}
    />
  );
}
