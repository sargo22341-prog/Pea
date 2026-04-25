import type { BoursoramaImportRow, BoursoramaUpdateRow, DashboardSortKey, RangeKey, SortDirection } from "@pea/shared";
import { ChevronDown, Database, Save, Trash2, Upload } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssetIcon } from "../components/AssetIcon";
import { PeaBadge } from "../components/PeaBadge";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { formatRangeLabel } from "../lib/format";

const sortOptions: Array<{ label: string; key: DashboardSortKey; direction: SortDirection }> = [
  { label: "Nom A -> Z", key: "name", direction: "asc" },
  { label: "Nom Z -> A", key: "name", direction: "desc" },
  { label: "Valeur marche croissante", key: "currentMarketValue", direction: "asc" },
  { label: "Valeur marche decroissante", key: "currentMarketValue", direction: "desc" },
  { label: "Variation % croissante", key: "intervalPerformancePercent", direction: "asc" },
  { label: "Variation % decroissante", key: "intervalPerformancePercent", direction: "desc" }
];

const chartRanges: RangeKey[] = ["1d", "1w", "1m", "1y", "ytd", "max"];

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Parametres</h1>
        <p className="muted">Compte, preferences, icones et import Boursorama.</p>
      </div>
      <AccountSection />
      <PreferencesSection />
      <IconSection />
      <ImportSection />
      <LogoutSection />
    </div>
  );
}

function AccountSection() {
  const me = useAsync(() => api.me(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileFile, setProfileFile] = useState<File | undefined>();
  const [profilePreview, setProfilePreview] = useState("");
  const [profileCacheBust, setProfileCacheBust] = useState(() => Date.now());
  const [profileFailed, setProfileFailed] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    return () => {
      if (profilePreview) URL.revokeObjectURL(profilePreview);
    };
  }, [profilePreview]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setToast(null);
    try {
      await api.updateMe({
        username: username || me.data?.user?.username,
        password: password || undefined,
        confirmPassword: password ? confirmPassword : undefined
      });
      setPassword("");
      setConfirmPassword("");
      setToast({ tone: "success", text: "Compte mis a jour." });
      await me.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Mise a jour impossible." });
    }
  }

  async function uploadProfileIcon() {
    if (!profileFile) return;
    setToast(null);
    try {
      await api.uploadProfileIcon(profileFile);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setProfileFile(undefined);
      setProfilePreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      const nextBust = Date.now();
      setProfileFailed(false);
      setProfileCacheBust(nextBust);
      window.dispatchEvent(new CustomEvent("profile-icon-updated", { detail: nextBust }));
      setToast({ tone: "success", text: "Icone de profil mise a jour." });
      await me.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Upload impossible." });
    }
  }

  async function deleteProfileIcon() {
    setToast(null);
    try {
      await api.deleteProfileIcon();
      if (fileInputRef.current) fileInputRef.current.value = "";
      setProfileFile(undefined);
      setProfilePreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      const nextBust = Date.now();
      setProfileFailed(true);
      setProfileCacheBust(nextBust);
      window.dispatchEvent(new CustomEvent("profile-icon-updated", { detail: nextBust }));
      setToast({ tone: "success", text: "Icone de profil supprimee." });
      await me.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Suppression impossible." });
    }
  }

  function selectProfileFile(file?: File) {
    setProfileFile(file);
    setProfilePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : "";
    });
  }

  if (me.loading) return <div className="card p-4">Chargement du compte...</div>;
  const user = me.data?.user;
  const initial = user?.username.slice(0, 1).toUpperCase() || "?";

  return (
    <section className="card space-y-4 p-4">
      <form className="space-y-4" onSubmit={submit}>
        <h2 className="font-semibold">Compte</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="muted mb-1 block">Username</span>
            <input className="input" onChange={(event) => setUsername(event.target.value)} placeholder={user?.username} />
          </label>
          <label>
            <span className="muted mb-1 block">Nouveau mot de passe</span>
            <input className="input" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
          <label>
            <span className="muted mb-1 block">Confirmation</span>
            <input className="input" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
          </label>
        </div>
        {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" type="submit"><Save size={17} />Enregistrer</button>
        </div>
      </form>

      <div className="rounded-md border border-line bg-ink p-3">
        <p className="mb-3 font-semibold">Icone utilisateur</p>
        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_auto] md:items-center">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-panel2 font-bold text-sky">
            {profilePreview ? (
              <img alt="" className="h-full w-full object-cover" src={profilePreview} />
            ) : profileFailed ? (
              initial
            ) : (
              <img
                alt=""
                className="h-full w-full object-cover"
                onError={() => setProfileFailed(true)}
                src={`/api/auth/me/profile-icon?v=${profileCacheBust}`}
              />
            )}
          </div>
          <input
            accept="image/png,image/jpeg,image/svg+xml"
            className="input"
            onChange={(event) => selectProfileFile(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
          <button className="btn-primary" disabled={!profileFile} onClick={() => void uploadProfileIcon()} type="button">
            <Upload size={17} />
            Upload
          </button>
          <button className="btn-ghost text-coral" onClick={() => void deleteProfileIcon()} type="button">
            <Trash2 size={17} />
            Supprimer
          </button>
        </div>
      </div>
    </section>
  );
}

function LogoutSection() {
  async function logout() {
    await api.logout();
    window.location.assign("/");
  }

  return (
    <section className="flex justify-end">
      <button className="btn-ghost text-coral" onClick={() => void logout()} type="button">
        Se deconnecter
      </button>
    </section>
  );
}

function PreferencesSection() {
  const me = useAsync(() => api.me(), []);
  const [sortValue, setSortValue] = useState("name:asc");
  const [range, setRange] = useState<RangeKey>("1d");
  const [localPeaSearchEnabled, setLocalPeaSearchEnabled] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const user = me.data?.user;
    if (!user) return;
    setSortValue(`${user.dashboardDefaultSortKey}:${user.dashboardDefaultSortDirection}`);
    setRange(user.defaultChartRange);
    setLocalPeaSearchEnabled(user.localPeaSearchEnabled);
  }, [me.data?.user]);

  async function save() {
    const [dashboardDefaultSortKey, dashboardDefaultSortDirection] = sortValue.split(":") as [DashboardSortKey, SortDirection];
    setToast(null);
    try {
      await api.updateMe({ dashboardDefaultSortKey, dashboardDefaultSortDirection, defaultChartRange: range, localPeaSearchEnabled });
      setToast({ tone: "success", text: "Preferences enregistrees." });
      await me.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Enregistrement impossible." });
    }
  }

  return (
    <Collapsible title="Mes preferences">
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className="muted mb-1 block">Tri par defaut du dashboard</span>
          <select className="input" onChange={(event) => setSortValue(event.target.value)} value={sortValue}>
            {sortOptions.map((option) => (
              <option key={`${option.key}:${option.direction}`} value={`${option.key}:${option.direction}`}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted mb-1 block">Intervalle par defaut des graphiques</span>
          <select className="input" onChange={(event) => setRange(event.target.value as RangeKey)} value={range}>
            {chartRanges.map((option) => (
              <option key={option} value={option}>{formatRangeLabel(option)}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-start gap-3 rounded-md border border-line bg-ink p-3">
        <button
          aria-checked={localPeaSearchEnabled}
          className={`mt-1 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${localPeaSearchEnabled ? "bg-mint" : "bg-panel2"}`}
          onClick={() => setLocalPeaSearchEnabled((current) => !current)}
          role="switch"
          type="button"
        >
          <span className={`h-4 w-4 rounded-full bg-white transition ${localPeaSearchEnabled ? "translate-x-5" : ""}`} />
        </button>
        <span>
          <span className="block font-semibold">Utiliser la recherche locale PEA</span>
          <span className="muted block">Utilise la liste locale d'actions et ETF PEA pour accelerer la recherche et eviter les appels API.</span>
          <span className="mt-2 block text-sm text-slate-300">
            Si cette option est activee, seules les valeurs eligibles PEA seront proposees. Pour rechercher toutes les actions et ETF, desactivez cette option.
          </span>
        </span>
      </label>
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={me.loading} onClick={() => void save()} type="button">
          <Save size={17} />
          Enregistrer
        </button>
      </div>
    </Collapsible>
  );
}

function IconSection() {
  const icons = useAsync(() => api.assetIcons(), []);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsRef = useRef<Record<string, string>>({});
  const [cacheBusts, setCacheBusts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((preview) => {
        if (preview) URL.revokeObjectURL(preview);
      });
    };
  }, []);

  async function save(symbol: string) {
    const file = files[symbol];
    if (!file) return;
    setToast(null);
    try {
      await api.uploadAssetIcon(symbol, file);
      if (fileInputs.current[symbol]) fileInputs.current[symbol]!.value = "";
      setFiles((current) => ({ ...current, [symbol]: undefined }));
      setPreviews((current) => {
        if (current[symbol]) URL.revokeObjectURL(current[symbol]);
        const next = { ...current, [symbol]: "" };
        previewsRef.current = next;
        return next;
      });
      const version = Date.now();
      setCacheBusts((current) => ({ ...current, [symbol]: version }));
      window.dispatchEvent(new CustomEvent("asset-icon-updated", { detail: { symbol, version } }));
      setToast({ tone: "success", text: `Icone ${symbol} mise a jour.` });
      await icons.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Upload impossible." });
    }
  }

  async function reset(symbol: string) {
    setToast(null);
    try {
      await api.resetAssetIcon(symbol);
      if (fileInputs.current[symbol]) fileInputs.current[symbol]!.value = "";
      setFiles((current) => ({ ...current, [symbol]: undefined }));
      setPreviews((current) => {
        if (current[symbol]) URL.revokeObjectURL(current[symbol]);
        const next = { ...current, [symbol]: "" };
        previewsRef.current = next;
        return next;
      });
      const version = Date.now();
      setCacheBusts((current) => ({ ...current, [symbol]: version }));
      window.dispatchEvent(new CustomEvent("asset-icon-updated", { detail: { symbol, version } }));
      setToast({ tone: "success", text: `Icone ${symbol} supprimee.` });
      await icons.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Suppression impossible." });
    }
  }

  function selectFile(symbol: string, file?: File) {
    setFiles((current) => ({ ...current, [symbol]: file }));
    setPreviews((current) => {
      if (current[symbol]) URL.revokeObjectURL(current[symbol]);
      const next = { ...current, [symbol]: file ? URL.createObjectURL(file) : "" };
      previewsRef.current = next;
      return next;
    });
  }

  return (
    <Collapsible title="Icones des actifs">
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      {icons.loading ? <p className="text-slate-400">Chargement...</p> : (
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {(icons.data ?? []).map((item) => (
            <div className="grid gap-3 bg-ink/70 p-3 md:grid-cols-[1fr_1.2fr_auto_auto] md:items-center" key={item.symbol}>
              <div className="flex items-center gap-3">
                <AssetIcon cacheBust={cacheBusts[item.symbol]} symbol={item.symbol} />
                <div>
                  <p className="font-semibold">{item.symbol}</p>
                  <p className="muted">{item.name}</p>
                  {item.icon?.fetchStatus === "failed" && <p className="text-xs text-amber">recuperation auto echouee</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {previews[item.symbol] && <img alt="" className="h-10 w-10 rounded-md object-contain" src={previews[item.symbol]} />}
                <input
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="input"
                  onChange={(event) => selectFile(item.symbol, event.target.files?.[0])}
                  ref={(node) => {
                    fileInputs.current[item.symbol] = node;
                  }}
                  type="file"
                />
              </div>
              <button className="btn-primary" disabled={!files[item.symbol]} onClick={() => void save(item.symbol)} type="button">
                <Upload size={17} />
                Upload
              </button>
              <button className="btn-ghost text-coral" onClick={() => void reset(item.symbol)} type="button">
                <Trash2 size={17} />
                Supprimer
              </button>
            </div>
          ))}
          {(icons.data ?? []).length === 0 && <p className="p-4 text-slate-400">Aucun actif en portefeuille ou watchlist.</p>}
        </div>
      )}
    </Collapsible>
  );
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 border-b border-line p-4 text-left"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="font-semibold">{title}</span>
        <ChevronDown className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} size={18} />
      </button>
      {open && <div className="space-y-4 p-4">{children}</div>}
    </section>
  );
}

function Toast({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <p className={`rounded-md border p-3 text-sm ${tone === "success" ? "border-mint/40 bg-mint/10 text-mint" : "border-coral/40 bg-coral/10 text-coral"}`}>
      {children}
    </p>
  );
}

function ImportSection() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BoursoramaImportRow[]>([]);
  const [updateRows, setUpdateRows] = useState<BoursoramaUpdateRow[]>([]);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function readCsv(file?: File) {
    if (!file) return undefined;
    const buffer = await file.arrayBuffer();
    const utf8 = new TextDecoder("utf-8").decode(buffer);
    return utf8.includes("Ã¯Â¿Â½") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
  }

  async function importCsv(file?: File) {
    const content = await readCsv(file);
    if (!content) return;
    setLoading(true);
    setMessage(null);
    try {
      const rows = await api.previewBoursorama(content);
      setRows(rows);
      setUpdateRows([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function previewUpdate(file?: File) {
    const content = await readCsv(file);
    if (!content) return;
    setLoading(true);
    setMessage(null);
    try {
      setUpdateRows(await api.previewBoursoramaUpdate(content));
      setRows([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmUpdate() {
    if (updateRows.some((row) => row.proposedAction === "delete") && !window.confirm("Confirmer les suppressions de positions absentes du CSV ?")) return;
    setLoading(true);
    const result = await api.confirmBoursoramaUpdate(updateRows);
    setMessage(`${result.imported.length} changement(s) applique(s), ${result.skipped.length} ignore(s), ${result.errors.length} erreur(s).`);
    setLoading(false);
    if (result.errors.length === 0) navigate("/");
  }

  async function confirmImport() {
    setLoading(true);
    const result = await api.confirmBoursorama(rows.map((row) => ({ ...row, action: row.action ?? "merge" })));
    setMessage(`${result.imported.length} ligne(s) importee(s), ${result.skipped.length} ignoree(s), ${result.errors.length} erreur(s).`);
    setLoading(false);
    if (result.errors.length === 0) navigate("/");
  }

  function updateImportRow(index: number, patch: Partial<BoursoramaImportRow>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  const visibleRows = showUnchanged ? updateRows : updateRows.filter((row) => row.proposedAction !== "unchanged");

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Import CSV Boursorama</h2>
          <p className="muted">Importer ou synchroniser l'etat total du portefeuille.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="btn-ghost cursor-pointer">
            <Upload size={17} />
            Importer CSV
            <input accept=".csv,text/csv" className="hidden" onChange={(event) => void importCsv(event.target.files?.[0])} type="file" />
          </label>
          <label className="btn-ghost cursor-pointer">
            <Upload size={17} />
            Mettre a jour via CSV
            <input accept=".csv,text/csv" className="hidden" onChange={(event) => void previewUpdate(event.target.files?.[0])} type="file" />
          </label>
        </div>
      </div>
      {message && <p className="p-4 text-sm text-mint">{message}</p>}
      {loading && <p className="p-4 text-slate-400">Traitement...</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-ink text-left text-slate-400">
              <tr>
                <th className="p-3">Nom</th>
                <th className="p-3">ISIN</th>
                <th className="p-3">Qte</th>
                <th className="p-3">PRU</th>
                <th className="p-3">Ticker</th>
                <th className="p-3">Action</th>
                <th className="p-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, index) => (
                <tr key={`${row.line}-${row.isin}`}>
                  <td className="p-3">{row.name}</td>
                  <td className="p-3">{row.isin}</td>
                  <td className="p-3">{row.quantity}</td>
                  <td className="p-3">{row.buyingPrice}</td>
                  <td className="p-3"><input className="input" onChange={(event) => updateImportRow(index, { symbol: event.target.value.toUpperCase(), needsReview: false })} value={row.symbol ?? ""} /></td>
                  <td className="p-3">
                    <select className="input" onChange={(event) => updateImportRow(index, { action: event.target.value as BoursoramaImportRow["action"] })} value={row.action ?? "merge"}>
                      <option value="merge">Fusionner</option>
                      <option value="replace">Remplacer</option>
                      <option value="ignore">Ignorer</option>
                    </select>
                  </td>
                  <td className={`p-3 ${row.needsReview || row.errors.length ? "text-amber" : "text-mint"}`}>{row.errors.length ? row.errors.join(", ") : row.needsReview ? "A verifier" : "OK"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end p-4">
            <button className="btn-primary" disabled={loading} onClick={() => void confirmImport()} type="button">
              <Database size={17} />
              Importer
            </button>
          </div>
        </div>
      )}
      {updateRows.length > 0 && (
        <div className="overflow-x-auto">
          <label className="flex items-center gap-2 p-4 text-sm text-slate-400">
            <input checked={showUnchanged} onChange={(event) => setShowUnchanged(event.target.checked)} type="checkbox" />
            Afficher les lignes inchangees
          </label>
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-ink text-left text-slate-400">
              <tr>
                <th className="p-3">Nom</th>
                <th className="p-3">ISIN</th>
                <th className="p-3">Ticker</th>
                <th className="p-3">Qte app</th>
                <th className="p-3">Qte CSV</th>
                <th className="p-3">Diff</th>
                <th className="p-3">PRU app</th>
                <th className="p-3">PRU CSV</th>
                <th className="p-3">Diff PRU</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleRows.map((row, index) => {
                const averageBuyPriceDiff = row.csvAverageBuyPrice - (row.currentAverageBuyPrice ?? row.csvAverageBuyPrice);
                const averageBuyPriceChanged = Math.abs(averageBuyPriceDiff) >= 0.000001 && row.proposedAction !== "delete";

                return (
                  <tr key={`${row.symbol}-${row.line}-${index}`}>
                    <td className="p-3">{row.name}</td>
                    <td className="p-3">{row.isin || "n/a"}</td>
                    <td className="p-3">
                      <input className="input" onChange={(event) => setUpdateRows((current) => current.map((item) => (item === row ? { ...item, symbol: event.target.value.toUpperCase() } : item)))} value={row.symbol ?? ""} />
                    </td>
                    <td className="p-3">{row.currentQuantity ?? 0}</td>
                    <td className="p-3">{row.csvQuantity}</td>
                    <td className={`p-3 ${row.quantityDiff >= 0 ? "text-mint" : "text-coral"}`}>{row.quantityDiff}</td>
                    <td className="p-3">{row.currentAverageBuyPrice ?? "n/a"}</td>
                    <td className="p-3">{row.csvAverageBuyPrice}</td>
                    <td className={`p-3 ${averageBuyPriceDiff >= 0 ? "text-mint" : "text-coral"}`}>
                      {averageBuyPriceChanged ? averageBuyPriceDiff.toLocaleString("fr-FR", { maximumFractionDigits: 4 }) : "0"}
                      {averageBuyPriceChanged && (
                        <span className="ml-2 rounded bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint">
                          PRU mis a jour
                        </span>
                      )}
                    </td>
                    <td className="p-3">{row.proposedAction}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-end p-4">
            <button className="btn-primary" disabled={loading} onClick={() => void confirmUpdate()} type="button">
              <Database size={17} />
              Valider la mise a jour
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

void LegacyImportSection;

function LegacyImportSection() {
  const [rows, setRows] = useState<BoursoramaImportRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function preview(file?: File) {
    if (!file) return;
    setLoading(true);
    setMessage(null);
    try {
      const buffer = await file.arrayBuffer();
      const utf8 = new TextDecoder("utf-8").decode(buffer);
      const content = utf8.includes("ï¿½") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
      setRows(await api.previewBoursorama(content));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview impossible.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(index: number, patch: Partial<BoursoramaImportRow>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function confirm() {
    setLoading(true);
    const result = await api.confirmBoursorama(rows.map((row) => ({ ...row, action: row.action ?? "merge" })));
    setMessage(`${result.imported.length} ligne(s) importee(s), ${result.skipped.length} ignoree(s), ${result.errors.length} erreur(s).`);
    setLoading(false);
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Import CSV Boursorama</h2>
          <p className="muted">Separateur point-virgule, nombres francais et correction ticker avant import.</p>
        </div>
        <label className="btn-ghost cursor-pointer">
          <Upload size={17} />
          Importer CSV
          <input accept=".csv,text/csv" className="hidden" onChange={(event) => void preview(event.target.files?.[0])} type="file" />
        </label>
      </div>
      {message && <p className="p-4 text-sm text-mint">{message}</p>}
      {loading && <p className="p-4 text-slate-400">Traitement...</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-ink text-left text-slate-400">
              <tr>
                <th className="p-3">Nom</th>
                <th className="p-3">ISIN</th>
                <th className="p-3">Qte</th>
                <th className="p-3">PRU</th>
                <th className="p-3">Ticker</th>
                <th className="p-3">PEA</th>
                <th className="p-3">Action</th>
                <th className="p-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, index) => (
                <tr key={`${row.line}-${row.isin}`}>
                  <td className="p-3">{row.name}</td>
                  <td className="p-3">{row.isin}</td>
                  <td className="p-3">{row.quantity}</td>
                  <td className="p-3">{row.buyingPrice}</td>
                  <td className="p-3">
                    <input className="input" onChange={(event) => updateRow(index, { symbol: event.target.value.toUpperCase(), needsReview: false })} value={row.symbol ?? ""} />
                  </td>
                  <td className="p-3">{row.peaEligibility ? <PeaBadge status={row.peaEligibility.status} /> : "n/a"}</td>
                  <td className="p-3">
                    <select className="input" onChange={(event) => updateRow(index, { action: event.target.value as BoursoramaImportRow["action"] })} value={row.action ?? "merge"}>
                      <option value="merge">Fusionner</option>
                      <option value="replace">Remplacer</option>
                      <option value="ignore">Ignorer</option>
                    </select>
                  </td>
                  <td className={`p-3 ${row.needsReview || row.errors.length ? "text-amber" : "text-mint"}`}>
                    {row.errors.length ? row.errors.join(", ") : row.needsReview ? "A verifier" : "OK"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end p-4">
            <button className="btn-primary" disabled={loading} onClick={() => void confirm()} type="button">
              <Database size={17} />
              Importer
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
