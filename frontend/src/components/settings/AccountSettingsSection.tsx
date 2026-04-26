import { Save, Trash2, Upload } from "lucide-react";
import { useAccountSettings } from "../../hooks/useAccountSettings";
import { Collapsible, Toast } from "./SettingsSection";

export function AccountSettingsSection() {
  const {
    confirmPassword,
    deleteProfileIcon,
    fileInputRef,
    me,
    password,
    profileCacheBust,
    profileFailed,
    profileFile,
    profilePreview,
    selectProfileFile,
    setConfirmPassword,
    setPassword,
    setProfileFailed,
    setUsername,
    submit,
    toast,
    uploadProfileIcon
  } = useAccountSettings();

  if (me.loading) return <Collapsible title="Compte"><p className="text-slate-400">Chargement du compte...</p></Collapsible>;

  const user = me.data?.user;
  const initial = user?.username.slice(0, 1).toUpperCase() || "?";

  return (
    <Collapsible title="Compte">
      <form className="space-y-4" onSubmit={submit}>
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
    </Collapsible>
  );
}
