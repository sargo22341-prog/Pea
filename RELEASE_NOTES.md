# Notes de la prochaine version

Écrire sous la ligne `<!-- notes -->` les changements de la prochaine version, en français et en
Markdown (une ligne `- …` par changement). À chaque push sur `main`, la CI publie ce texte comme
description de la GitHub Release, puis vide la liste dans le commit `chore: bump version to vX.Y.Z`.
Sans notes, GitHub génère la liste des commits. Détails : [docs/release.md](docs/release.md).

<!-- notes -->
- Actualités : la page s'affiche immédiatement avec les derniers articles connus, rafraîchis en arrière-plan, et reste lisible si Yahoo est indisponible.
- Actualités : préchargement automatique en journée des actualités de vos actions et du flux global.
- Actualités : les nouveaux articles arrivés pendant la lecture sont proposés via un bouton au lieu de réorganiser la liste ; la page se met à jour au retour sur l'onglet.
- Actualités : vignettes en petite résolution, pour une page plus légère sur mobile.
- Les cours passent avant les actualités dans la file d'appels Yahoo ; un cours indisponible n'affecte plus que sa propre ligne du portefeuille.
- Navigation plus fluide : les pages déjà visitées (dashboard, dividendes, analyse, marchés, calendrier, alertes, objectifs) s'affichent sans écran de chargement puis se mettent à jour.
- Démarrage plus léger : les traductions anglaises ne sont téléchargées que si l'anglais est choisi.
- Le cache des actualités est désormais purgé automatiquement et la base SQLite écrit plus efficacement.
