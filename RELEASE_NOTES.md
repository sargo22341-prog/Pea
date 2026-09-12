
## Notes de release

- objectifs : nouvelle option « Simulation de la courbe » avec quatre formes de projection

  - courbe lisse (comportement historique, aucune variation aleatoire) ;
  - projection stochastique : rendement mensuel tire au hasard autour de la tendance (volatilite annuelle reglable) ;
  - chocs aleatoires : crises tirees au hasard (frequence et baisse moyenne reglables) suivies d'une reprise partielle ;
  - Monte-Carlo : des centaines de trajectoires combinant volatilite et chocs, affichees en courbe mediane, bande 10 %-90 % et probabilite d'atteindre l'objectif.

- chaque tirage est reproductible grace a une graine enregistree : la courbe ne change plus a chaque recalcul automatique, et le bouton « Nouveau tirage » permet d'explorer un autre scenario
