
## Notes de release

feat(mobile): recharger la page par un geste natif et mettre a jour les dependances

- ajoute le pull-to-refresh Android avec l'indicateur circulaire natif et un rechargement sans cache
- suspend le geste pendant l'affichage des fenetres modales pour proteger les saisies en cours
- passe la chaine Android a Gradle 9.7.1, AGP 9.4.1, google-services 4.5.0, compileSdk 37 et AndroidX a jour
- met a jour dotenv en version 18 cote backend et realigne allowScripts sur esbuild 0.28.2
- retire les dependances racine inutilisees qui exposaient une alerte uuid en production
- ajoute les tests de regression du compteur de suspensions du geste

