import type { SimilarAsset } from "@pea/shared";
import { GitCompare, Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AssetIcon } from "../../../../components/common/AssetIcon";
import { staggerDelay, MOTION } from "../../../../components/common/motion";
import { useFeatureEnabled } from "../../../../contexts/feature-flags-context";
import { useAsync } from "../../../../hooks/useAsync";
import { api } from "../../../../lib/api";
import { money, percent } from "../../../../lib/format";
import { readBooleanPreference, writeLocalPreference } from "../../../../lib/local-preference";
import { PeaBadge } from "../PeaBadge";

const PEA_ONLY_KEY = "similar.peaOnly";

function SimilarCard({ asset, index, onCompare, onWatch, watched }: { asset: SimilarAsset; index: number; onCompare: () => void; onWatch: () => void; watched: boolean }) {
  const { t } = useTranslation("asset");
  const change = asset.changePercent;
  return (
    <li className={`w-48 shrink-0 rounded-[14px] border border-white/[0.05] bg-slate-950/40 p-3 transition hover:-translate-y-0.5 hover:border-white/[0.12] ${MOTION.rise}`} style={{ animationDelay: staggerDelay(index) }}>
      <Link className="flex items-center gap-2" to={`/assets/${encodeURIComponent(asset.symbol)}`}>
        <AssetIcon className="h-8 w-8" symbol={asset.symbol} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-100">{asset.name}</span>
          <span className="block text-xs text-slate-400">{asset.symbol}</span>
        </span>
      </Link>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span>{asset.price === undefined ? "n/a" : money(asset.price, asset.currency ?? "EUR")}</span>
        {change === undefined ? null : <span className={change >= 0 ? "text-mint" : "text-coral"}>{percent(change)}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <PeaBadge status={asset.peaEligible ? "eligible" : "not_eligible"} />
        <span className="flex gap-1">
          <button aria-label={t("similar.watch", { name: asset.name })} aria-pressed={watched} className={`rounded-md p-1.5 transition hover:bg-panel2 ${watched ? "text-amber" : "text-slate-400"}`} disabled={watched} onClick={onWatch} type="button">
            <Star fill={watched ? "currentColor" : "none"} size={15} />
          </button>
          <button aria-label={t("similar.compare", { name: asset.name })} className="rounded-md p-1.5 text-slate-400 transition hover:bg-panel2 hover:text-sky" onClick={onCompare} type="button">
            <GitCompare size={15} />
          </button>
        </span>
      </div>
    </li>
  );
}

/** Rangée défilante d'actifs proches, avec filtre « PEA uniquement » mémorisé. */
export function SimilarAssetsRow({ symbol, onCompare }: { symbol: string; onCompare: (target: { symbol: string; name: string }) => void }) {
  const { t } = useTranslation("asset");
  const enabled = useFeatureEnabled("similar_assets");
  const similar = useAsync((signal) => (enabled ? api.similarAssets(symbol, signal) : Promise.resolve([])), `${symbol}:${String(enabled)}`);
  const [peaOnly, setPeaOnly] = useState(() => readBooleanPreference(PEA_ONLY_KEY) ?? false);
  const [watched, setWatched] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const assets = (similar.data ?? []).filter((asset) => !peaOnly || asset.peaEligible);
  if (!enabled || !similar.data?.length) return null;

  async function watch(asset: SimilarAsset) {
    setError(null);
    try {
      await api.addWatchlist({ symbol: asset.symbol, name: asset.name, currency: asset.currency });
      setWatched((current) => new Set([...current, asset.symbol]));
    } catch (watchError) {
      setError(watchError instanceof Error ? watchError.message : String(watchError));
    }
  }

  return (
    <section className="w-full">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t("similar.title")}</h2>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input checked={peaOnly} onChange={() => { setPeaOnly((current) => { writeLocalPreference(PEA_ONLY_KEY, String(!current)); return !current; }); }} type="checkbox" />
          {t("similar.peaOnly")}
        </label>
      </div>
      {error ? <p className="mb-2 text-xs text-coral">{error}</p> : null}
      {assets.length ? (
        <ul className="flex gap-3 overflow-x-auto pb-2">
          {assets.map((asset, index) => (
            <SimilarCard asset={asset} index={index} key={asset.symbol} onCompare={() => { onCompare({ symbol: asset.symbol, name: asset.name }); }} onWatch={() => void watch(asset)} watched={watched.has(asset.symbol)} />
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">{t("similar.noPeaAsset")}</p>
      )}
    </section>
  );
}
