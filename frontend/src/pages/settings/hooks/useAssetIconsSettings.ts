import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsToast } from "../../../components/common/feedback";
import { api } from "../../../lib/api";
import { useAsync } from "../../../hooks/useAsync";

/** Diffuse la nouvelle version d'une icone aux composants affiches et renvoie ce numero de version. */
function announceIconUpdate(symbol: string): number {
  const version = Date.now();
  window.dispatchEvent(new CustomEvent("asset-icon-updated", { detail: { symbol, version } }));
  return version;
}

export function useAssetIconsSettings() {
  const { t } = useTranslation(["settings"]);
  const icons = useAsync(() => api.assetIcons());
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsRef = useRef<Record<string, string>>({});
  const [cacheBusts, setCacheBusts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<SettingsToast | null>(null);

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
      clearSymbolFile(symbol);
      const version = announceIconUpdate(symbol);
      setCacheBusts((current) => ({ ...current, [symbol]: version }));
      setToast({ tone: "success", text: t("icons.updated", { ns: "settings", symbol }) });
      await icons.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("icons.uploadError", { ns: "settings" }) });
    }
  }

  async function reset(symbol: string) {
    setToast(null);
    try {
      await api.resetAssetIcon(symbol);
      clearSymbolFile(symbol);
      const version = announceIconUpdate(symbol);
      setCacheBusts((current) => ({ ...current, [symbol]: version }));
      setToast({ tone: "success", text: t("icons.deleted", { ns: "settings", symbol }) });
      await icons.reload();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("icons.deleteError", { ns: "settings" }) });
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

  function clearSymbolFile(symbol: string) {
    if (fileInputs.current[symbol]) fileInputs.current[symbol].value = "";
    setFiles((current) => ({ ...current, [symbol]: undefined }));
    setPreviews((current) => {
      if (current[symbol]) URL.revokeObjectURL(current[symbol]);
      const next = { ...current, [symbol]: "" };
      previewsRef.current = next;
      return next;
    });
  }

  return {
    cacheBusts,
    fileInputs,
    files,
    icons,
    previews,
    reset,
    save,
    selectFile,
    toast
  };
}
