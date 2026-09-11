
## Notes de release

- update modules

- lazy-with-reload.ts (nouveau) : remplace lazy(). Si un chunk ne se charge pas, la page se recharge une fois. Un délai de 10 s empêche de recharger en boucle si le serveur est vraiment down. Je l'ai branché sur toutes les pages dans App.tsx et sur les graphiques dans PortfolioChart.tsx.

- AppErrorBoundary.tsx (nouveau) : si le rechargement ne suffit pas, un message et un bouton « Recharger la page » s'affichent. Le message disparaît quand tu changes de page. Les textes sont traduits en français et en anglais dans common.json.

- sw.js : le service worker ne touche plus à /assets/, c'est le navigateur qui les charge directement. J'ai aussi changé le nom du cache (v4) pour que tous les navigateurs reprennent la nouvelle version.

- app.ts : un fichier /assets/... absent renvoie maintenant une vraie 404.

- useAsync garde les données affichées lors d'un reload (stale-while-revalidate) :
  plus de démontage des listes du dashboard ni de requêtes dupliquées à chaque événement SSE

- ignore les market-snapshot-updated diffusés pour des symboles hors portefeuille/watchlist

- met en cache le token, l'URL serveur et la configuration du plugin réseau natifs (Android)

- mémoïse les points du graphique d'actif et la valeur du contexte de confidentialité

- la page Recherche réutilise l'utilisateur chargé au lieu de rappeler /api/auth/me

- active la compression HTTP côté backend en excluant le flux SSE

- ajoute les tests de régression useAsync, filtre SSE, cache natif et compression
