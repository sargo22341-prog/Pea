import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "./useAsync";
import type { SettingsToast } from "../components/settings/SettingsSection";

export function useAccountSettings() {
  const me = useAsync(() => api.me(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileFile, setProfileFile] = useState<File | undefined>();
  const [profilePreview, setProfilePreview] = useState("");
  const [profileCacheBust, setProfileCacheBust] = useState(() => Date.now());
  const [profileFailed, setProfileFailed] = useState(false);
  const [toast, setToast] = useState<SettingsToast | null>(null);

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
      clearProfileSelection();
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
      clearProfileSelection();
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

  function clearProfileSelection() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setProfileFile(undefined);
    setProfilePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }

  return {
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
  };
}
