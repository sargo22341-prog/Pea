// Point unique de rechargement complet de la page, isole pour que les tests
// puissent verifier l'appel sans declencher une navigation que jsdom ne gere pas.
export function reloadPage(): void {
  window.location.reload();
}
