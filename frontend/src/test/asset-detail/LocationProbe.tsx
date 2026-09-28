import { useLocation } from "react-router-dom";

/** Affiche la chaîne de requête courante pour vérifier ce que la page écrit dans l'URL. */
export function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}
