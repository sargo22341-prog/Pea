# Notes de la prochaine version

Écrire sous la ligne `<!-- notes -->` les changements de la prochaine version, en français et en
Markdown (une ligne `- …` par changement). À chaque push sur `main`, la CI publie ce texte comme
description de la GitHub Release, puis vide la liste dans le commit `chore: bump version to vX.Y.Z`.
Sans notes, GitHub génère la liste des commits. Détails : [docs/release.md](docs/release.md).

<!-- notes -->
- Android : modernisation de la configuration des barres système et du build, sans changement visible, pour préparer les prochaines versions d'Android et de Gradle.
- Fiche actif : nouvelle organisation en onglets (Aperçu, Fondamentaux, Analystes, Dividendes, Actualités ; Composition et Performance pour les ETF), avec l’onglet dans l’URL et les blocs sans donnée masqués.
- Fiche actif : blocs « Valorisation » (PER, P/B, BPA, capitalisation…) et « Santé financière » (verdict, rentabilité, endettement, croissance) avec explications au survol.
- ETF : principales lignes détenues, classes d’actifs, rendements sur 1 à 10 ans, performances par année et statistiques de risque.
- Graphique de cours : moyennes mobiles 50 et 200 séances activables depuis le bouton « Calques ».
- Divisions d’actions : détection automatique, bannière de validation sur la fiche et badge sur le dashboard ; l’ajustement des quantités n’est appliqué qu’après votre accord, sans modifier vos transactions.
- Réglages : nouvelle préférence « Mode avancé » qui déplie d’office les détails repliables de toutes les pages (fiche actif, dividendes…).
- Les fondamentaux déjà en cache sont rafraîchis en arrière-plan pour afficher les nouveaux indicateurs.
- Administration : interrupteurs des fonctionnalités consommatrices d’appels Yahoo et nouveau tableau « appels des dernières 24 h par fonctionnalité » dans le suivi Yahoo.
- Fiche actif : carte « États financiers » avec bilan et flux de trésorerie, en annuel ou trimestriel, et point « 12 mois glissants ».
- Onglet Analystes : tendance des recommandations, derniers relèvements et abaissements, prochaine publication et surprises des derniers trimestres.
- Aperçu : signaux techniques (court, moyen et long terme, valorisation relative, supports et résistances affichables sur le graphique) et actifs similaires, avec filtre PEA.
- Correction : un module Yahoo incomplet ne fait plus disparaître les fondamentaux de certaines valeurs (Air Liquide, Engie, Veolia…).
- Dashboard : rendement sur coût du portefeuille et de chaque ligne, jauge de la fourchette 52 semaines sous le cours et point ambre quand le consensus des analystes change.
- Dashboard : bouton « Comparer à un indice » (CAC 40, Euro Stoxx 50, MSCI World) avec courbe base 100 en pointillé.
- Calendrier : BPA et chiffre d’affaires attendus sous les prochaines publications de résultats.
- Correction : la comparaison à un indice jamais suivi prépare désormais son historique au lieu de rester vide.
- Dividendes : croissance sur 5 ans, badge « Aristocrate » (5 hausses consécutives), jauge du taux de distribution et historique annuel par action.
- Dividendes : une date de détachement annoncée par la société remplace l’estimation, avec la mention « annoncé » ; répartition du total entre détachés, annoncés et estimés.
- Dividendes : simulation du réinvestissement des dividendes sur 5 à 20 ans.
- Fiche actif : bloc « Croissance et soutenabilité » dans l’onglet Dividendes (taux de distribution, couverture par le flux de trésorerie disponible, croissance, hausses consécutives).
- Correction : les versements trimestriels décalés d’une année sur l’autre ne sont plus comptés deux fois dans les estimations, et une estimation dépassée sans versement n’est plus présentée comme à venir.
- Fiche actif : les séries « Chiffre d’affaires » et « Résultat net » du graphique des résultats sont désormais traduites.
- Analyse : onglets regroupés en « Répartition » et « Qualité », seuls les onglets disposant de données sont proposés.
- Analyse : valorisation du portefeuille (PER, rendement et bêta pondérés, avec la part du portefeuille couverte et le détail par actif).
- Analyse : transparence ETF, qui répartit vos ETF selon leurs principales lignes (« via vos ETF, vous détenez 3 % d’ASML »), en vue directe ou éclatée.
- Analyse : dividendes durables (taux de distribution et couverture par le flux de trésorerie, du plus sûr au plus fragile), répartition par capitalisation et par devise, et corrélation entre les lignes sur un an.
- Nouvelle page « Calendrier » : vue mois ou liste des publications de résultats, détachements et versements de dividendes, pour le portefeuille, la liste de suivi ou les deux, avec filtres par type, montant de dividende attendu (masqué en mode privé) et export vers un agenda (.ics).
- Dashboard : lien « Voir le calendrier » au-dessus des prochains évènements.
- Nouvelle page « Marchés » : indices, euro/dollar, or, Brent et taux américain à 10 ans avec leur courbe du mois, actualisés chaque minute ; désactivable par l'administrateur.
- Les listes Yahoo Finance quittent la page Recherche pour la page Marchés : six nouvelles listes (croissance technologique, petites capitalisations, fonds, obligations à haut rendement…), filtre « PEA uniquement » et PER, rendement et capitalisation sous chaque titre.
- Menu allégé : nouvelle entrée « Marchés », d’où l’on ouvre la recherche (« Rechercher un actif ») ; le calendrier s’ouvre depuis le dashboard ; Dividendes prend une icône de pièces.
- Actualités : bascule « Chronologique / Par actif » pour regrouper les articles de vos actifs avec un compteur, et badge « Résultats » sur les articles publiés à un jour près d’une publication de résultats.
- Nouveau comparateur : 2 à 4 actifs côte à côte, courbe de performance puis valorisation, santé financière, dividende, analystes et frais des ETF, la meilleure valeur de chaque ligne en vert ; accessible depuis la page Marchés et la fenêtre « Comparer » de la fiche actif.
- Nouveau screener PEA : filtres sur les actifs connus de l’instance (éligibilité PEA, secteur, rendement, PER, capitalisation, performance et distance au plus haut 52 semaines), préréglages « Rendement », « Value » et « Croissance », filtres enregistrables et colonnes au choix.
- Nouvelles alertes : seuil de cours, variation du jour, franchissement de la moyenne mobile 200 jours, nouveau plus haut ou plus bas 52 semaines, changement de recommandation des analystes et annonce d’un détachement, créées depuis la fiche actif (bouton cloche), avec anti-rebond réglable.
- En-tête : cloche avec le nombre d’alertes non lues et les derniers déclenchements ; page « Alertes » avec la liste et l’historique ; désactivable par l’administrateur.
