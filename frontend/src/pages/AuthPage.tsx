import { FormEvent, useState } from "react";
import { BarChart3 } from "lucide-react";

export function AuthPage({
  mode,
  onLogin
}: {
  mode: "login" | "setup";
  onLogin: (input: { username: string; password: string; confirmPassword?: string }) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!username.trim()) return setError("Username requis.");
    if (!password) return setError("Mot de passe requis.");
    if (mode === "setup" && password !== confirmPassword) return setError("Les mots de passe ne correspondent pas.");
    setSaving(true);
    try {
      await onLogin({ username, password, confirmPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentification impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form className="card w-full max-w-md space-y-4 p-5" onSubmit={submit}>
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-mint p-2 text-ink">
            <BarChart3 size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">{mode === "setup" ? "Creer le premier compte" : "Connexion"}</h1>
            <p className="muted">Acces personnel au portefeuille PEA.</p>
          </div>
        </div>
        <label className="block">
          <span className="muted mb-1 block">Username</span>
          <input className="input" autoComplete="username" onChange={(event) => setUsername(event.target.value)} required value={username} />
        </label>
        <label className="block">
          <span className="muted mb-1 block">Mot de passe</span>
          <input className="input" autoComplete={mode === "setup" ? "new-password" : "current-password"} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        </label>
        {mode === "setup" && (
          <label className="block">
            <span className="muted mb-1 block">Confirmation</span>
            <input className="input" autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
          </label>
        )}
        {error && <p className="rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p>}
        <button className="btn-primary w-full" disabled={saving} type="submit">
          {saving ? "Validation..." : mode === "setup" ? "Creer le compte" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
