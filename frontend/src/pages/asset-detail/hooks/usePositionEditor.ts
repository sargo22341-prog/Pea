import type { PositionWithMarket, Quote } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../lib/api";

/** Durée d'affichage du message de confirmation après une modification de position. */
const UPDATED_TOAST_MS = 3000;

/**
 * Ouverture de l'éditeur de position depuis la fiche actif. Sans position existante, une
 * position brouillon est créée puis supprimée si l'utilisateur ferme sans enregistrer.
 */
export function usePositionEditor({ position, quote, reload }: { position?: PositionWithMarket | undefined; quote?: Quote | undefined; reload: () => Promise<void> }) {
  const { t } = useTranslation("asset");
  const [editing, setEditing] = useState(false);
  const [draftPosition, setDraftPosition] = useState<PositionWithMarket | null>(null);
  const [openingPositionEditor, setOpeningPositionEditor] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function deletePosition() {
    const target = position ?? draftPosition;
    if (!target) return;
    await api.deletePosition(target.id);
    setDraftPosition(null);
    setToast(t("positionDeleted"));
    await reload();
  }

  async function refreshAfterEdit() {
    await reload();
    setDraftPosition(null);
    setToast(t("positionUpdated"));
    window.setTimeout(() => { setToast(null); }, UPDATED_TOAST_MS);
  }

  async function openPositionEditor() {
    if (position) {
      setEditing(true);
      return;
    }
    if (!quote) return;
    setOpeningPositionEditor(true);
    setToast(null);
    try {
      const created = await api.ensurePosition({ symbol: quote.symbol, name: quote.name, currency: quote.currency });
      setDraftPosition(created);
      setEditing(true);
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("addFailed"));
    } finally {
      setOpeningPositionEditor(false);
    }
  }

  async function closePositionEditor() {
    setEditing(false);
    if (!draftPosition) return;
    await api.deletePosition(draftPosition.id).catch(() => undefined);
    setDraftPosition(null);
    await reload();
  }

  return {
    closePositionEditor,
    deletePosition,
    editedPosition: position ?? draftPosition,
    editing,
    openPositionEditor,
    openingPositionEditor,
    refreshAfterEdit,
    setEditing,
    setToast,
    startWithDraft: !position,
    toast
  };
}
