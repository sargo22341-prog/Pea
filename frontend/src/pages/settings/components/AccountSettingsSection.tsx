import { Camera, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible, Toast } from "../../../components/common/feedback";
import { useAuthenticatedImageUrl } from "../../../hooks/useAuthenticatedImageUrl";
import { useAccountSettings } from "../hooks/useAccountSettings";
import { AvatarCropModal } from "./AvatarCropModal";

export function AccountSettingsSection({ open, onToggle }: { open?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation(["common", "settings"]);
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
  const user = me.data?.user;
  const shouldLoadProfileIcon = Boolean(user?.hasProfileIcon && !profileFailed && !profilePreview);
  const profileIconUrl = useAuthenticatedImageUrl(`/api/auth/me/profile-icon?v=${profileCacheBust}`, profileCacheBust, shouldLoadProfileIcon);

  if (me.loading) {
    return (
      <Collapsible onToggle={onToggle} open={open} title={t("account.title", { ns: "settings" })}>
        <p className="text-slate-400">{t("account.loading", { ns: "settings" })}</p>
      </Collapsible>
    );
  }

  const initial = user?.username.slice(0, 1).toUpperCase() ?? "?";
  const hasIcon = !profileFailed && (user?.hasProfileIcon || profilePreview !== "");

  function handleFileChange(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) setCropSrc(dataUrl);
    };
    reader.readAsDataURL(file);
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
      <Collapsible onToggle={onToggle} open={open} title={t("account.title", { ns: "settings" })}>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className="muted mb-1 block">{t("fields.username", { ns: "common" })}</span>
              <input className="input" onChange={(event) => setUsername(event.target.value)} placeholder={user?.username} />
            </label>
            <label>
              <span className="muted mb-1 block">{t("account.newPassword", { ns: "settings" })}</span>
              <input className="input" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
            </label>
            <label>
              <span className="muted mb-1 block">{t("common.confirmation", { ns: "common" })}</span>
              <input className="input" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="submit">
              <Save size={17} />
              {t("actions.save", { ns: "common" })}
            </button>
          </div>
        </form>

        <div className="rounded-md border border-line bg-ink p-3">
          <p className="mb-3 font-semibold">{t("account.userIcon", { ns: "settings" })}</p>
          <div className="flex items-center gap-4">
            <button
              className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel2 font-bold text-sky"
              onClick={() => fileInputRef.current?.click()}
              title={t("account.editIcon", { ns: "settings" })}
              type="button"
            >
              {profilePreview ? (
                <img alt="" className="h-full w-full object-cover" src={profilePreview} />
              ) : !shouldLoadProfileIcon || !profileIconUrl ? (
                <span>{initial}</span>
              ) : (
                <img alt="" className="h-full w-full object-cover" onError={() => setProfileFailed(true)} src={profileIconUrl} />
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="text-white" size={20} />
              </div>
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("account.profilePicture", { ns: "settings" })}</p>
              <p className="muted text-xs">{t("account.profilePictureHelp", { ns: "settings" })}</p>
            </div>

            {hasIcon && (
              <button className="btn-ghost text-coral" onClick={() => void deleteProfileIcon()} type="button">
                <Trash2 size={17} />
                {t("actions.delete", { ns: "common" })}
              </button>
            )}
          </div>

          <input accept="image/png,image/jpeg" className="hidden" onChange={(event) => handleFileChange(event.target.files?.[0])} ref={fileInputRef} type="file" />
        </div>

        {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      </Collapsible>
    </>
  );
}
