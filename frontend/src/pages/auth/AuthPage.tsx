import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

export function AuthPage({
  mode,
  onLogin
}: {
  mode: "login" | "setup";
  onLogin: (input: { username: string; password: string; confirmPassword?: string }) => Promise<void>;
}) {
  const { t } = useTranslation(["common", "errors"]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!username.trim()) return setError(t("errors:usernameRequired"));
    if (!password) return setError(t("errors:passwordRequired"));
    if (mode === "setup" && password !== confirmPassword) return setError(t("errors:passwordMismatch"));
    setSaving(true);
    try {
      await onLogin({ username, password, confirmPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors:authFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="safe-bottom flex min-h-screen items-center justify-center px-4 py-10" data-system-bars-bottom="#071014" data-system-bars-top="#071014">
      <form className="card w-full max-w-md space-y-4 p-5" onSubmit={submit}>
        <div className="flex items-center gap-3">
          <img alt="" className="h-12 w-12 rounded-md object-cover shadow-glow" src="/pea-icon.png" />
          <div>
            <h1 className="text-xl font-bold">{mode === "setup" ? t("common:auth.createFirstAccount") : t("common:auth.login")}</h1>
            <p className="muted">{t("common:auth.personalAccess")}</p>
          </div>
        </div>
        <label className="block">
          <span className="muted mb-1 block">{t("common:fields.username")}</span>
          <input className="input" autoComplete="username" onChange={(event) => setUsername(event.target.value)} required value={username} />
        </label>
        <label className="block">
          <span className="muted mb-1 block">{t("common:fields.password")}</span>
          <input className="input" autoComplete={mode === "setup" ? "new-password" : "current-password"} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        </label>
        {mode === "setup" && (
          <label className="block">
            <span className="muted mb-1 block">{t("common:common.confirmation")}</span>
            <input className="input" autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
          </label>
        )}
        {error && <p className="rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p>}
        <button className="btn-primary w-full" disabled={saving} type="submit">
          {saving ? t("common:auth.validation") : mode === "setup" ? t("common:auth.createAccount") : t("common:auth.loginAction")}
        </button>
      </form>
    </main>
  );
}
