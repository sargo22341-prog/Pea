import type { CalendarScope } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../lib/api";

/** Propose le fichier iCalendar au téléchargement via un lien temporaire. */
function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useCalendarExport() {
  const { t } = useTranslation(["calendar"]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportRange(range: { scope: CalendarScope; from: string; to: string }) {
    setExporting(true);
    setError(null);
    try {
      saveFile(await api.calendarIcs(range), `pea-calendrier-${range.from}-${range.to}.ics`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("calendar:exportError"));
    } finally {
      setExporting(false);
    }
  }

  return { exporting, error, exportRange };
}
