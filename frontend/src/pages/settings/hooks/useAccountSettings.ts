import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsToast } from "../../../components/common/feedback";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useAccountSettings() {
  const { t } = useTranslation(["settings"]);
  const me = useAsync(() => api.me());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profilePreview, setProfilePreview] = useState("");
  const [profileCacheBust, setProfileCacheBust] = useState(() => Date.now());
  const [profileFailed, setProfileFailed] = useState(false);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  useEffect(() => {
    setProfileFailed(!me.data?.user?.hasProfileIcon);
  }, [me.data?.user?.hasProfileIcon]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setToast(null);
    const willChangeCredentials = username !== "" || password !== "";
    try {
      await api.updateMe({
        username: username || me.data?.user?.username,
        password: password || undefined,
        confirmPassword: password ? confirmPassword : undefined,
      });
      if (willChangeCredentials) {
        setToast({ tone: "success", text: t("account.updatedLogout", { ns: "settings" }) });
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        await api.logout();
        window.location.assign("/");
      } else {
        setToast({ tone: "success", text: t("account.updated", { ns: "settings" }) });
        await me.reload();
      }
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("account.updateError", { ns: "settings" }) });
    }
  }

  async function uploadCroppedBlob(blob: Blob) {
    setToast(null);
    const dataUrl = await blobToDataURL(blob);
    setProfilePreview(dataUrl);
    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      await api.uploadProfileIcon(file);
      const nextBust = Date.now();
      setProfileFailed(false);
      setProfileCacheBust(nextBust);
      window.dispatchEvent(new CustomEvent("profile-icon-updated", { detail: { cacheBust: nextBust, hasProfileIcon: true } }));
      setToast({ tone: "success", text: t("account.profileIconUpdated", { ns: "settings" }) });
      await me.reload();
    } catch (error) {
      setProfilePreview("");
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("account.uploadError", { ns: "settings" }) });
    }
  }

  async function deleteProfileIcon() {
    setToast(null);
    try {
      await api.deleteProfileIcon();
      setProfilePreview("");
      const nextBust = Date.now();
      setProfileFailed(true);
      setProfileCacheBust(nextBust);
      window.dispatchEvent(new CustomEvent("profile-icon-updated", { detail: { cacheBust: nextBust, hasProfileIcon: false } }));
      setToast({ tone: "success", text: t("account.profileIconDeleted", { ns: "settings" }) });
      await me.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("account.deleteError", { ns: "settings" }) });
    }
  }

  return {
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
  };
}
