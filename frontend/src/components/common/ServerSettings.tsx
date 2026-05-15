import { Save, Server, Wifi } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { describeNetworkError, fetchWithTimeout } from "../../lib/api-core";
import { clearNativeAuthToken, getNativeServerUrl, getServerUrlDetails, isInsecureServerUrl, isNativeApp, normalizeServerUrl, resolveServerPath, setNativeServerUrl } from "../../lib/native-auth";
import { Collapsible, Toast } from "./feedback";

async function assertServerReachable(serverUrl: string) {
  const details = getServerUrlDetails(serverUrl);
  const healthUrls = Array.from(new Set([
    resolveServerPath(serverUrl, "/api/health"),
    resolveServerPath(serverUrl, "/health")
  ]));
  const failures: string[] = [];

  for (const url of healthUrls) {
    if (isNativeApp()) console.info("[pea:server] health check", { url, protocol: details.protocol, hostname: details.hostname });
    try {
      const response = await fetchWithTimeout(url, { cache: "no-store" }, 12_000);
      if (isNativeApp()) console.info("[pea:server] health response", { status: response.status, ok: response.ok, url: response.url });
      if (response.ok) return;
      failures.push(`${url} -> HTTP ${response.status}`);
    } catch (error) {
      const diagnostic = describeNetworkError(error);
      if (isNativeApp()) console.error("[pea:server] health fetch failed", { url, protocol: details.protocol, hostname: details.hostname, ...diagnostic });
      failures.push(`${url} -> ${diagnostic.name}: ${diagnostic.message}`);
    }
  }

  const sslHint = details.protocol === "https:" ? " Si c'est un certificat prive, verifiez qu'il est installe comme autorite racine Android et autorise pour les apps." : "";
  const httpHint = details.protocol === "http:" ? " HTTP est autorise par l'APK, mais le telephone doit joindre directement l'IP/le nom et le port du serveur." : "";
  throw new Error(`Serveur inaccessible apres tentative reelle vers ${details.protocol}//${details.hostname}.${httpHint}${sslHint} Details: ${failures.join(" ; ")}`);
}

export function ServerSetupPage({ message, onConfigured }: { message?: string; onConfigured: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-8 text-slate-100">
      <div className="w-full max-w-md rounded-md border border-line bg-panel p-5 shadow-glow">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-panel2 text-mint">
            <Server size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Serveur PEA</h1>
            <p className="muted text-sm">Adresse de votre instance auto-hebergee.</p>
          </div>
        </div>
        {message && <p className="mb-3 rounded-md border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{message}</p>}
        <ServerUrlForm submitLabel="Connecter" onSaved={onConfigured} />
      </div>
    </div>
  );
}

export function ServerSettingsSection() {
  if (!isNativeApp()) return null;

  return (
    <Collapsible title="Serveur">
      <ServerUrlForm
        submitLabel="Modifier serveur"
        onSaved={() => {
          window.location.assign("/");
        }}
      />
    </Collapsible>
  );
}

function ServerUrlForm({ onSaved, submitLabel }: { onSaved: () => void; submitLabel: string }) {
  const [serverUrl, setServerUrl] = useState("");
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const insecureUrl = isInsecureServerUrl(serverUrl);

  useEffect(() => {
    let active = true;
    void getNativeServerUrl().then((url) => {
      if (active) setServerUrl(url ?? "");
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      const normalized = normalizeServerUrl(serverUrl);
      await assertServerReachable(normalized);
      await setNativeServerUrl(normalized);
      await clearNativeAuthToken();
      setToast({ tone: "success", text: "Serveur enregistre. Reconnexion requise." });
      onSaved();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Serveur inaccessible." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <label>
        <span className="muted mb-1 block">URL serveur</span>
        <input
          className="input"
          inputMode="url"
          onChange={(event) => setServerUrl(event.target.value)}
          placeholder="https://pea.nas.home"
          value={serverUrl}
        />
      </label>
      {insecureUrl && (
        <p className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          HTTP est autorise pour les serveurs locaux/self-hosted. Verifiez seulement que le telephone peut joindre ce nom ou cette IP sur le meme reseau.
        </p>
      )}
      <button className="btn-primary" disabled={saving} type="submit">
        {saving ? <Wifi size={17} /> : <Save size={17} />}
        {saving ? "Verification..." : submitLabel}
      </button>
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
    </form>
  );
}
