
## Notes de release

feat(objectifs): ajouter des modes de simulation de la courbe de projection

- propose quatre formes de courbe: lisse, stochastique, chocs aleatoires et Monte-Carlo
- rend chaque tirage reproductible via une graine enregistree et un bouton de nouveau tirage
- affiche la bande 10 %-90 % et la probabilite de reussite en mode Monte-Carlo
- borne les parametres de simulation cote Zod et cote calcul
- decoupe le calculateur d'objectifs et la modale d'edition en modules dedies
- supprime le code mort du calculateur et pre-calcule la ligne de seuil
- ajoute les tests de simulation backend et les tests d'interface associes