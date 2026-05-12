import { Camera, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useAccountSettings } from "../hooks/useAccountSettings";
import { AvatarCropModal } from "./AvatarCropModal";
import { Collapsible, Toast } from "../../../components/common/feedback";

export function AccountSettingsSection() {
  const {
    confirmPassword,
    deleteProfileIcon,
    me,
    password,
    profileCacheBust,
    profileFailed,
    profilePreview,
    setConfirmPassword,
    setPassword,
    setProfileFailed,
    setUsername,
    submit,
    toast,
    uploadCroppedBlob,
  } = useAccountSettings();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  if (me.loading)
    return (
      <Collapsible title="Compte">
        <p className="text-slate-400">Chargement du compte…</p>
      </Collapsible>
    );

  const user = me.data?.user;
  const initial = user?.username.slice(0, 1).toUpperCase() ?? "?";
  const hasIcon = !profileFailed && (user?.hasProfileIcon || profilePreview !== "");

  function handleFileChange(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) setCropSrc(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCropConfirm(blob: Blob) {
    setCropSrc(null);
    await uploadCroppedBlob(blob);
  }

  return (
    <>
      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          onConfirm={(blob) => void handleCropConfirm(blob)}
          onCancel={() => setCropSrc(null)}
        />
      )}
      <Collapsible title="Compte">
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className="muted mb-1 block">Username</span>
              <input
                className="input"
                onChange={(e) => setUsername(e.target.value)}
                placeholder={user?.username}
              />
            </label>
            <label>
              <span className="muted mb-1 block">Nouveau mot de passe</span>
              <input
                className="input"
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                value={password}
              />
            </label>
            <label>
              <span className="muted mb-1 block">Confirmation</span>
              <input
                className="input"
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                value={confirmPassword}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="submit">
              <Save size={17} />
              Enregistrer
            </button>
          </div>
        </form>

        <div className="rounded-md border border-line bg-ink p-3">
          <p className="mb-3 font-semibold">Icone utilisateur</p>
          <div className="flex items-center gap-4">
            {/* Clickable avatar circle */}
            <button
              className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel2 font-bold text-sky"
              onClick={() => fileInputRef.current?.click()}
              title="Modifier l'icone"
              type="button"
            >
              {profilePreview ? (
                <img alt="" className="h-full w-full object-cover" src={profilePreview} />
              ) : profileFailed || !user?.hasProfileIcon ? (
                <span>{initial}</span>
              ) : (
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setProfileFailed(true)}
                  src={`/api/auth/me/profile-icon?v=${profileCacheBust}`}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="text-white" size={20} />
              </div>
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Photo de profil</p>
              <p className="muted text-xs">Cliquez sur l'icone pour modifier. PNG ou JPEG, max 1 Mo.</p>
            </div>

            {hasIcon && (
              <button
                className="btn-ghost text-coral"
                onClick={() => void deleteProfileIcon()}
                type="button"
              >
                <Trash2 size={17} />
                Supprimer
              </button>
            )}
          </div>

          <input
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      </Collapsible>
    </>
  );
}
