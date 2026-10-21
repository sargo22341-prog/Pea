import { useCallback, useState } from "react";
import { readLocalPreference, writeLocalPreference } from "../../../../lib/local-preference";
import { IMPORT_GUIDE_STEPS } from "./import-guide-steps";

/** Étapes du guide déjà consultées, propres à ce navigateur (simple confort de lecture). */
const SEEN_STEPS_KEY = "importGuide.seen";

function readSeen(): Set<number> {
  const stored = readLocalPreference(SEEN_STEPS_KEY);
  if (!stored) return new Set();
  const indexes = stored.split(",").map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < IMPORT_GUIDE_STEPS.length);
  return new Set(indexes);
}

export interface GuideProgress {
  seen: ReadonlySet<number>;
  markSeen: (index: number) => void;
  /** Toutes les étapes ont été consultées au moins une fois. */
  complete: boolean;
}

export function useGuideProgress(): GuideProgress {
  const [seen, setSeen] = useState<ReadonlySet<number>>(readSeen);

  const markSeen = useCallback((index: number) => {
    setSeen((current) => {
      if (current.has(index)) return current;
      const next = new Set(current).add(index);
      writeLocalPreference(SEEN_STEPS_KEY, [...next].sort((a, b) => a - b).join(","));
      return next;
    });
  }, []);

  return { seen, markSeen, complete: seen.size === IMPORT_GUIDE_STEPS.length };
}
