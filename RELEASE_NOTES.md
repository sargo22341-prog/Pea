# Notes de la prochaine version

Écrire sous la ligne `<!-- notes -->` les changements de la prochaine version, en français et en
Markdown (une ligne `- …` par changement). À chaque push sur `main`, la CI publie ce texte comme
description de la GitHub Release, puis vide la liste dans le commit `chore: bump version to vX.Y.Z`.
Sans notes, GitHub génère la liste des commits. Détails : [docs/release.md](docs/release.md).

<!-- notes -->
- Import des avis d'opérés PDF : les quantités de 1 000 titres et plus (ex. « 1 916 ») sont désormais lues en entier, et un avis déjà importé (même référence d'ordre) est ignoré.
- Nouveau compte espèces du PEA : un achat n'est plus compté comme un versement. Les ventes et dividendes encaissés créditent les espèces, les achats, frais et retraits les débitent, et le solde est recalculé à partir de l'historique.
- Achat sans espèces suffisantes : une fenêtre indique le solde, le coût et le montant manquant, et propose d'enregistrer le versement correspondant avec l'achat (saisie manuelle, imports CSV et PDF).
- Nouvelle page « Mon PEA » (lien depuis l'accueil et menu du profil) : valeur, versements et performance du compte, saisie des versements, retraits avec avertissement réglementaire, dividendes encaissés et frais, et historique complet avec le solde après chaque mouvement.
- Accueil simplifié : la valeur totale du PEA espèces comprises et quatre indicateurs (gain global, performance sur la période, espèces disponibles, versements cumulés) ; le détail est regroupé dans « Mon PEA », et chaque indicateur est expliqué au survol de son icône ⓘ.
- Mise à jour d'un portefeuille existant : une fenêtre guidée demande le solde espèces et les versements historiques (jamais déduits des anciens achats) ; la base est sauvegardée automatiquement avant la migration.
- Dividendes encaissés proposés automatiquement : chaque dividende détaché sur une position détenue apparaît dans la cloche à sa date de paiement, avec le brut, la retenue à la source estimée selon le pays et le net proposé ; rien n'est crédité sans votre validation (Valider, Corriger ou Ignorer).
- Page « Mon PEA » : liste des dividendes à valider et des dividendes ignorés, réactivables ; un dividende déjà saisi à la main n'est ni proposé ni enregistré une seconde fois.
- Réglages, section « Dividendes » : option d'ajout automatique des dividendes sûrs (ISIN connu, pays identifié, versés en euros) ; les autres restent à confirmer, et chaque ajout est signalé dans la cloche, même sans s'être connecté.
- Un dividende enregistré, à la main ou automatiquement, se corrige directement (montant et date) depuis la cloche ou « Mon PEA ».
- L'ISIN d'une action peut être saisi depuis la fenêtre d'un dividende « à vérifier », pour une retenue à la source exacte.
- Après la configuration du compte espèces, les dividendes déjà perçus sont calculés à partir du solde, des versements, des achats et des ventes, recoupés avec les dividendes publiés, puis proposés à confirmer.
- Correction : sur une base mise à jour, la fenêtre de configuration du compte espèces s'affiche de nouveau dès l'accueil (un résumé en cache la masquait).
- « Mon PEA » : les dividendes déjà perçus ont leur propre carte, ouverte juste après la configuration du solde, puis résumée avec un bouton « Modifier » une fois confirmés.
- Certification des dividendes par les relevés de coupons PDF du courtier : import de plusieurs relevés à la fois dans les Réglages, aperçu par relevé (dividendes à certifier, à corriger, à ajouter, déjà perçus avant l'état initial), puis confirmation ; les PDF ne sont jamais conservés et un relevé incohérent est refusé en entier.
- Fenêtre d'un dividende : badge « Certifié par relevé » ou « Vérifié manuellement », bouton « Vérifier avec un relevé » (le relevé du mois suffit) avec un avertissement précis en cas d'écart ; corriger un dividende certifié retire la certification après avertissement.
- Liste des transactions d'une position : les dividendes encaissés y apparaissent avec leur badge, et un filtre Tous / Achats / Ventes / Dividendes.
- Dividendes perçus avant la date de départ : chaque ligne certifiée par un relevé de coupons PDF apparaît désormais, grisée et en lecture seule, dans l'historique de « Mon PEA » et dans les dividendes d'une position, sans modifier le solde ni les indicateurs ; la carte « Dividendes déjà perçus » en indique le nombre.
