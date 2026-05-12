import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { useAsync } from "../../../hooks/useAsync";
import type { SettingsToast } from "../../../components/common/feedback";

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useAccountSettings() {
  const me = useAsync(() => api.me(), []);
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
    // Detect whether the user actually typed something in the credential fields
    const willChangeCredentials = username !== "" || password !== "";
    try {
      await api.updateMe({
        username: username || me.data?.user?.username,
        password: password || undefined,
        confirmPassword: password ? confirmPassword : undefined,
      });
      if (willChangeCredentials) {
        setToast({ tone: "success", text: "Compte mis a jour. Deconnexion en cours…" });
        await new Promise<void>((r) => setTimeout(r, 1500));
        await api.logout();
        window.location.assign("/");
      } else {
        setToast({ tone: "success", text: "Compte mis a jour." });
        await me.reload();
      }
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Mise a jour impossible." });
    }
  }

  async function uploadCroppedBlob(blob: Blob) {
    setToast(null);
    // Show the cropped image as preview immediately (avoid waiting for server round-trip)
    const dataUrl = await blobToDataURL(blob);
    setProfilePreview(dataUrl);
    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      await api.uploadProfileIcon(file);
      const nextBust = Date.now();
      setProfileFailed(false);
      setProfileCacheBust(nextBust);
      window.dispatchEvent(
        new CustomEvent("profile-icon-updated", { detail: { cacheBust: nextBust, hasProfileIcon: true } })
      );
      setToast({ tone: "success", text: "Icone de profil mise a jour." });
      await me.reload();
    } catch (error) {
      setProfilePreview("");
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Upload impossible." });
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
      window.dispatchEvent(
        new CustomEvent("profile-icon-updated", { detail: { cacheBust: nextBust, hasProfileIcon: false } })
      );
      setToast({ tone: "success", text: "Icone de profil supprimee." });
      await me.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Suppression impossible." });
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
