import { Trash2, Upload } from "lucide-react";
import { AssetIcon } from "../AssetIcon";
import { useAssetIconsSettings } from "../../hooks/useAssetIconsSettings";
import { Collapsible, Toast } from "./SettingsSection";

export function AssetIconsSettingsSection() {
  const settings = useAssetIconsSettings();

  return (
    <Collapsible title="Icones des actifs">
      {settings.toast && <Toast tone={settings.toast.tone}>{settings.toast.text}</Toast>}
      {settings.icons.loading ? <p className="text-slate-400">Chargement...</p> : (
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {(settings.icons.data ?? []).map((item) => (
            <div className="grid gap-3 bg-ink/70 p-3 md:grid-cols-[1fr_1.2fr_auto_auto] md:items-center" key={item.symbol}>
              <div className="flex items-center gap-3">
                <AssetIcon cacheBust={settings.cacheBusts[item.symbol]} symbol={item.symbol} />
                <div>
                  <p className="font-semibold">{item.symbol}</p>
                  <p className="muted">{item.name}</p>
                  {item.icon?.fetchStatus === "failed" && <p className="text-xs text-amber">recuperation auto echouee</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {settings.previews[item.symbol] && <img alt="" className="h-10 w-10 rounded-md object-contain" src={settings.previews[item.symbol]} />}
                <input
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="input"
                  onChange={(event) => settings.selectFile(item.symbol, event.target.files?.[0])}
                  ref={(node) => {
                    settings.fileInputs.current[item.symbol] = node;
                  }}
                  type="file"
                />
              </div>
              <button className="btn-primary" disabled={!settings.files[item.symbol]} onClick={() => void settings.save(item.symbol)} type="button">
                <Upload size={17} />
                Upload
              </button>
              <button className="btn-ghost text-coral" onClick={() => void settings.reset(item.symbol)} type="button">
                <Trash2 size={17} />
                Supprimer
              </button>
            </div>
          ))}
          {(settings.icons.data ?? []).length === 0 && <p className="p-4 text-slate-400">Aucun actif en portefeuille ou watchlist.</p>}
        </div>
      )}
    </Collapsible>
  );
}
