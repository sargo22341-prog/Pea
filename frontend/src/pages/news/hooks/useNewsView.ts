import { useState } from "react";
import { readLocalPreference, writeLocalPreference } from "../../../lib/local-preference";
import { NEWS_VIEWS, type NewsView } from "../lib/newsGrouping";

const VIEW_KEY = "news.view";

/** Présentation des actualités de mes actifs (chronologique ou par actif), mémorisée par navigateur. */
export function useNewsView() {
  const [view, setView] = useState<NewsView>(() => {
    const stored = readLocalPreference(VIEW_KEY);
    return NEWS_VIEWS.find((value) => value === stored) ?? "chronological";
  });
  return {
    view,
    changeView: (next: NewsView) => {
      setView(next);
      writeLocalPreference(VIEW_KEY, next);
    }
  };
}
