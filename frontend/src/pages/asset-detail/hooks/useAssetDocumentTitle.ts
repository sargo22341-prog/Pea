import { useEffect } from "react";

const APP_TITLE = "PEA Portfolio";

/** Titre d'onglet du navigateur : nom de l'actif en majuscules, sinon son symbole. */
export function useAssetDocumentTitle(name: string | undefined, symbol: string) {
  useEffect(() => {
    const label = name || symbol;
    document.title = label ? `${label.toUpperCase()} | ${APP_TITLE}` : APP_TITLE;
    return () => {
      document.title = APP_TITLE;
    };
  }, [name, symbol]);
}
