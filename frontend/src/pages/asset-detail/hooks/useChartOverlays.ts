import { CHART_OVERLAY_KEYS, type ChartOverlayKey } from "@pea/shared";
import { useState } from "react";
import { readBooleanPreference, readLocalPreference, writeLocalPreference } from "../../../lib/local-preference";

const STORAGE_KEY = "chart.overlays";
const LEVELS_STORAGE_KEY = "chart.levels";

function readStoredOverlays(): ChartOverlayKey[] {
  const stored = readLocalPreference(STORAGE_KEY)?.split(",") ?? [];
  return CHART_OVERLAY_KEYS.filter((key) => stored.includes(key));
}

/**
 * Calques du graphique de cours choisis par l'utilisateur, mémorisés sur ce navigateur : moyennes
 * mobiles (calculées par le serveur) et niveaux supports / résistances (issus des signaux).
 */
export function useChartOverlays() {
  const [overlays, setOverlays] = useState<ChartOverlayKey[]>(readStoredOverlays);
  const [levels, setLevels] = useState(() => readBooleanPreference(LEVELS_STORAGE_KEY) ?? false);

  function toggleOverlay(key: ChartOverlayKey) {
    setOverlays((current) => {
      const next = CHART_OVERLAY_KEYS.filter((item) => (item === key ? !current.includes(item) : current.includes(item)));
      writeLocalPreference(STORAGE_KEY, next.join(","));
      return next;
    });
  }

  function toggleLevels() {
    setLevels((current) => {
      writeLocalPreference(LEVELS_STORAGE_KEY, String(!current));
      return !current;
    });
  }

  return { levels, overlays, toggleLevels, toggleOverlay };
}
