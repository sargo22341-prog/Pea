
## Notes de release


- lazy-with-reload.ts (nouveau) : remplace lazy(). Si un chunk ne se charge pas, la page se recharge une fois. Un délai de 10 s empêche de recharger en boucle si le serveur est vraiment down. Je l'ai branché sur toutes les pages dans App.tsx et sur les graphiques dans PortfolioChart.tsx.

- AppErrorBoundary.tsx (nouveau) : si le rechargement ne suffit pas, un message et un bouton « Recharger la page » s'affichent. Le message disparaît quand tu changes de page. Les textes sont traduits en français et en anglais dans common.json.

- sw.js : le service worker ne touche plus à /assets/, c'est le navigateur qui les charge directement. J'ai aussi changé le nom du cache (v4) pour que tous les navigateurs reprennent la nouvelle version.

- app.ts : un fichier /assets/... absent renvoie maintenant une vraie 404.