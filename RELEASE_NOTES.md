
## Notes de release

feat(objectifs): ajouter des modes de simulation de la courbe de projection

- propose quatre formes de courbe: lisse, stochastique, chocs aleatoires et Monte-Carlo
- rend chaque tirage reproductible via une graine enregistree et un bouton de nouveau tirage
- affiche la bande 10 %-90 % et la probabilite de reussite en mode Monte-Carlo
- borne les parametres de simulation cote Zod et cote calcul
- decoupe le calculateur d'objectifs et la modale d'edition en modules dedies
- supprime le code mort du calculateur et pre-calcule la ligne de seuil
- ajoute les tests de simulation backend et les tests d'interface associes

feat(dividendes): projeter l'annee suivante et harmoniser les animations

- projette l'annee N+1 par actif a partir des deux annees precedentes, croissance bornee
- signale la projection dans le selecteur, la carte annuelle et chaque ligne d'actif
- regroupe les animations dans une couche unique neutralisee par prefers-reduced-motion
- anime la navigation, les fenetres modales, le menu, les listes et les messages
- scinde la feuille de styles pour respecter la limite de 300 lignes
- ajoute les tests de projection, d'interface dividendes et de decalage d'animation
