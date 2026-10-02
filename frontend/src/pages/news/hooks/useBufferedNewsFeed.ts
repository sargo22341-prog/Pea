import type { NewsArticle } from "@pea/shared";
import { useState } from "react";
import { countNewArticles } from "../lib/newsCache";

interface ShownFeed<T> {
  key: string;
  value: T | null;
}

/**
 * Garde la liste affichée stable pendant la lecture : une nouvelle version apportant des articles
 * inédits est mise de côté (`newCount`) jusqu'à `showLatest`. Une version sans nouvel article est
 * appliquée directement, tout comme la première version d'un flux ou un changement de `feedKey`
 * (mode, page ou langues).
 */
export function useBufferedNewsFeed<T>(feedKey: string, latest: T | null, articlesOf: (value: T) => readonly NewsArticle[]) {
  const [shown, setShown] = useState<ShownFeed<T>>({ key: feedKey, value: latest });
  let current = shown;
  const replacesShown = shown.key !== feedKey
    || (latest !== null && latest !== shown.value && (shown.value === null || countNewArticles(articlesOf(shown.value), articlesOf(latest)) === 0));
  if (replacesShown) {
    current = { key: feedKey, value: latest };
    setShown(current);
  }

  const newCount = current.value !== null && latest !== null && latest !== current.value
    ? countNewArticles(articlesOf(current.value), articlesOf(latest))
    : 0;

  return {
    shown: current.value,
    newCount,
    showLatest: () => { setShown({ key: feedKey, value: latest }); }
  };
}
