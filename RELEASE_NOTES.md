
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

feat(actifs): animer la fiche actif

- fait entrer les sections de la page en cascade sans remonter le graphique
- surligne le prix en vert ou corail a chaque cotation recue en direct
- anime l'etoile de suivi, les actions de l'en-tete et les tuiles d'information
- remplit et fait glisser la jauge 52 semaines au lieu de la faire sauter
- garde les fenetres modales hors du conteneur anime pour preserver les voiles fixes
- neutralise chaque effet sous prefers-reduced-motion
- ajoute les tests d'animation de la fiche et du hook de pulsation

perf(dashboard): réduire les traitements, écritures SSE et re-renders inutiles

- agrège les frais du portefeuille en une requête SQL filtrée par utilisateur
- envoie les événements de rafraîchissement marché en une écriture SSE par client
- retire les écouteurs d'annulation une fois les requêtes terminées
- mémoïse la liste des positions et stabilise les props du graphique portefeuille
- ajoute les tests de frais, de regroupement SSE et de libération des écouteurs

fix(portefeuille): fiabiliser les transactions, les tâches de fond et le client temps réel

- refuse la suppression d'une transaction rendant la quantité négative et renvoie 404 si elle est absente
- enregistre les dates de transaction en ISO UTC, migre les dates CURRENT_TIMESTAMP et trie sur l'instant réel
- empêche les ticks des schedulers de produire des rejets non gérés arrêtant le processus
- renvoie 400/413 pour un JSON malformé ou trop volumineux et ne masque plus les erreurs SQL en 409
- affiche les erreurs serveur dans la modale des transactions et autorise l'édition d'une vente existante
- ignore les événements SSE illisibles, évite les listeners en double et temporise la reconnexion native
- centralise le calcul du coût moyen pondéré, le sous-échantillonnage et l'horloge de debug
- supprime les ré-exports legacy, le code mort et la dépendance vite de production
- range les clients API frontend dans lib/api-clients pour respecter la limite de fichiers
- ajoute les tests de régression backend et frontend associés
