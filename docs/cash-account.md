# Compte espèces du PEA

Ce document décrit comment l'application sépare les **versements** (argent apporté au PEA depuis
l'extérieur) des **achats** (argent du PEA converti en titres). Les règles vivent dans le backend
(`backend/src/services/cash/`) ; le frontend ne fait qu'afficher et recueillir les confirmations.

## Modèle de données

| Table | Rôle |
|---|---|
| `transactions` | Achats (`buy`) et ventes (`sell`) existants, avec frais. Nouvelle colonne `import_ref` (référence d'ordre d'un avis PDF, préfixée `pdf:`) pour refuser un second import. `traded_at` est toujours un instant ISO UTC (migration 55, voir « Opérations sur titres sans doublon »). |
| `cash_movements` | Versements (`deposit`), retraits (`withdrawal`), dividendes encaissés (`dividend`), remboursements de capital (`capital_repayment`) et indemnisations (`compensation`, migration 56), frais indépendants (`fee`). Montant en **centimes entiers** (`amount_cents > 0`), date effective, actif lié éventuel, origine (`manual`, `csv`, `pdf`, `migration`), référence d'import unique par utilisateur. |
| `cash_accounts` | Une ligne par utilisateur : statut (`pending` / `ready`), état initial (date de référence, solde espèces, versements et retraits cumulés à cette date, en centimes), dividendes déjà perçus confirmés (migration 51), réglage d'ajout automatique des dividendes (migration 49) et date d'ouverture facultative. |
| `cash_account_revisions` | Trace de chaque confirmation ou correction de l'état initial (avant / après, en JSON). |
| `cash_dividend_proposals` | Dividendes proposés à la validation (migration 48) : une ligne par utilisateur, actif et date de détachement, statut `pending` / `accepted` / `ignored`, montants en centimes et mouvement créé à la validation. |
| `cash_statements` | Relevés espèces importés (migration 57) : un par utilisateur et par mois, période couverte (date de l'ancien solde, date du nouveau solde), soldes en centimes et empreinte du contenu lu. |
| `cash_statement_lines` | Lignes de relevé espèces (migration 57) : date d'écriture et de valeur, nature, libellé normalisé, montant signé en centimes, quantité, nom abrégé, échéance d'un coupon, et l'élément vérifié (transaction, mouvement ou ligne de relevé de coupons). Au plus un élément par ligne (`CHECK`), au plus une ligne par élément (index uniques), `ON DELETE SET NULL`. |
| `cash_dividend_statement_lines` | Lignes de relevé de coupons certifiées pour des crédits antérieurs ou égaux à l'état initial (migration 53) : mois, numéro de ligne, ISIN, date, net et retenue. Les colonnes `verification`, `verified_at` et `verification_ref` de `cash_movements` et `opening_dividends_certified_at` de `cash_accounts` portent la vérification des dividendes. |

Le **solde espèces n'est jamais stocké**. Il est recalculé à chaque lecture en rejouant, dans
l'ordre chronologique, les mouvements et les transactions (`cash-ledger.ts`). À date égale, l'ordre
est déterministe : état initial, versement, dividende, remboursement de capital, indemnisation,
vente, achat, frais, retrait, puis identifiant.

Effet sur les espèces :

- achat : `-(quantité × prix + frais)` ;
- vente : `+(quantité × prix - frais)` ;
- versement, dividende encaissé, remboursement de capital et indemnisation : crédit ; retrait et
  frais : débit.

Les montants sont arrondis au centime puis additionnés en entiers : aucune dérive flottante.

## Indicateurs

- **Versements cumulés** = versements déclarés dans l'état initial + versements enregistrés
  ensuite. Un achat, une vente, un dividende, une plus-value ou un ajustement technique ne les
  augmentent jamais.
- **Retraits cumulés** sont suivis séparément : ils n'effacent pas les versements.
- **Autres crédits** (`otherCredits`) = remboursements de capital et indemnisations postérieurs à
  l'état initial. Ils augmentent le solde espèces (donc la valeur et le gain global) mais ne sont
  ni des versements (plafond, versements nets, flux du rendement annualisé) ni des dividendes
  encaissés.
- **Plafond restant** = 150 000 € - versements cumulés (PEA classique ; les retraits ne
  reconstituent pas le plafond). Un versement au-delà est signalé, pas bloqué.
- **Plus-values réalisées** : pour chaque vente, produit net (frais déduits) moins le coût moyen
  pondéré des titres vendus (PRU frais d'achat inclus, divisions validées appliquées).
- **Valeur PEA** = valeur des positions + solde espèces.
- **Gain global** = valeur PEA + retraits cumulés - versements cumulés. Les plus-values réalisées
  sont déjà dans le solde espèces : elles ne sont pas ajoutées une seconde fois.
- **Rendement** : le gain global rapporté aux versements nets est affiché à titre indicatif. Le
  taux annualisé (XIRR des seuls flux externes) n'est calculé que si le journal est complet depuis
  l'ouverture (sans état initial) et couvre au moins 90 jours.

Les dividendes « estimés » du tableau de bord (données de marché × quantité détenue) restent
distincts des dividendes **encaissés**, enregistrés dans le journal espèces (saisis à la main ou
proposés puis validés, voir ci-dessous).

## Dividendes proposés à la validation

Chaque dividende détaché sur une position détenue devient une **proposition** à valider. Aucun
dividende n'est crédité sans confirmation explicite, sauf les dividendes sûrs quand l'utilisateur
a activé l'ajout automatique (voir plus bas). Le code vit dans
`backend/src/services/cash/dividends/`.

**Génération** (`dividend-proposals-sync.ts`) : à chaque lecture de
`GET /api/cash/dividend-proposals` (cloche de l'en-tête, page « Mon PEA »), à partir des seules
données stockées, sans appel Yahoo :

- détachements réels de `asset_dividends` (historique Yahoo `chart`, rafraîchi chaque jour par
  les tâches existantes) ; un détachement seulement annoncé ne crée rien ;
- quantité détenue à la date de détachement, avec la même règle que les dividendes estimés
  (`buildTransactionCache` + `getQuantityAtTime`, divisions validées appliquées) ;
- date de paiement : la date `dividend` publiée dans `asset_calendar_events` si elle tombe entre
  le jour du détachement et 60 jours après (`PAYMENT_DATE_MAX_DELAY_DAYS`), sinon détachement +
  2 jours de bourse (`ESTIMATED_PAYMENT_DELAY_BUSINESS_DAYS`), signalée comme estimée ;
- brut = dividende par action × quantité ; net = brut - retenue estimée, au centime.

Rien n'est proposé pour un compte `pending`, une quantité nulle (ou un ETF capitalisant, sans
dividende publié), ni pour un crédit daté avant ou à la date de l'état initial : il est déjà
compris dans le solde déclaré. Une proposition n'apparaît qu'à sa date de paiement. La
génération est idempotente (unicité `(user_id, symbol, ex_date)`) : une proposition en attente
suit les données rafraîchies, une proposition ignorée ou validée n'est plus modifiée, et une
proposition non validée devenue sans objet est retirée.

**Retenue à la source** (`withholding-tax.ts`) : taux domestique du pays de la société, déduit du
préfixe ISIN (avis d'opéré importés) ou, à défaut, de la place de cotation (toujours « à
vérifier »). FR 0 %, DE 26,375 %, NL 15 %, IT 26 %, ES 19 %, BE 30 %, PT 25 %, AT 27,5 %, IE 25 % et
LU 15 % (à vérifier : les fonds de ces pays sont souvent exonérés). Pays inconnu : 0 % et montant à
vérifier ; un dividende en devise étrangère est aussi à vérifier (non converti). Dans un PEA, cette
retenue n'est ni récupérable ni imputable ; la fiscalité française ne s'applique qu'au retrait.
Taux vérifiés le 2026-10-20 (sources en commentaire du module).

**Décision** (`dividend-proposals.service.ts`, routes `POST /api/cash/dividend-proposals/:id/…`) :

- `accept` (Valider ou Corriger, avec `amount` et `effectiveAt` facultatifs) : dans une seule
  transaction, crée un mouvement `dividend` (origine `manual`, puisque confirmé par
  l'utilisateur, `import_ref = dividend:<SYMBOLE>:<date de détachement>`, position liée) et passe
  la proposition en `accepted`. La date de crédit doit être postérieure à l'état initial et non
  future ;
- `ignore` : statut `ignored`, réversible par `restore` depuis « Mon PEA » ;
- supprimer le mouvement d'un dividende validé remet la proposition en attente.

**Ajout automatique** (réglage « Dividendes » de la page Réglages, désactivé par défaut,
`GET`/`PUT /api/cash/dividend-settings`) : seuls les dividendes **sûrs** sont validés sans clic,
avec la même transaction que « Valider ». Sûr = ISIN valide connu (saisi sur la position, migration
50, ou issu d'un avis d'opéré), pays présent dans la table des retenues hors IE/LU, dividende en
euros, et aucune saisie manuelle rapprochée. La date de paiement estimée est acceptée (elle reste
corrigeable). Les autres restent à confirmer. La tâche horaire `dividend-proposals-scheduler`
génère les propositions et applique l'ajout automatique pour chaque compte prêt, sans appel Yahoo,
et envoie l'évènement SSE `cash-dividends-updated` quand un dividende est ajouté ou devient à
confirmer. Chaque ajout automatique est signalé dans la cloche jusqu'à « Tout marquer comme lu ».

**Correction** (`POST /api/cash/dividend-proposals/:id/correct`) : un dividende validé (à la main
ou automatiquement) se corrige directement, montant et date, depuis la cloche ou « Mon PEA »
(dividendes enregistrés depuis moins de 30 jours). Le mouvement est modifié sous `withCashGuard` :
une baisse qui découvrirait le compte plus tard est refusée (`422`, non finançable).

**ISIN d'une position** (`PUT /api/portfolio/positions/:id/isin`, clé de contrôle vérifiée) :
saisi depuis la fenêtre d'un dividende « à vérifier », il fixe le pays de la société, recalcule
les propositions en attente et rend les suivantes sûres.

**Rapprochement** (`isSameDividendCredit`) : deux crédits de dividende du même actif datés à moins
de 10 jours (`DIVIDEND_RECONCILIATION_WINDOW_DAYS`) sont le même versement. Un dividende déjà saisi
à la main n'est donc pas proposé, une proposition validée ne peut pas être ressaisie à la main
(`409`), et la référence d'import unique interdit un second enregistrement. Un dividende saisi sans
actif n'est rapproché de rien.

## Dividendes perçus avant l'état initial

Après la confirmation de l'état initial (seconde étape de la popup du tableau de bord, ou carte
« Dividendes déjà perçus » de « Mon PEA », ouverte aussitôt après une configuration faite depuis
cette page, puis résumée avec « Modifier » une fois le montant confirmé), une étape (`GET`/`PUT
/api/cash/account/opening-dividends`, `opening-dividends.ts`) propose les dividendes déjà perçus.
Le solde espèces vaut versements nets - achats + ventes - frais + autres crédits + dividendes,
donc :

```text
dividendes = solde déclaré - versements nets déclarés + achats - ventes + frais indépendants
             - remboursements de capital - indemnisations
```

(opérations antérieures ou égales à la date de référence, frais d'achat et de vente inclus). Le
calcul n'est juste que si toutes les opérations antérieures sont enregistrées ; il est recoupé avec
les dividendes publiés × quantité détenue (positions à transactions datées), brut et net de retenue.
Avertissements : résultat négatif, opérations issues d'un import CSV de détentions, aucune opération
antérieure, écart de plus de 25 % (et 50 €) avec l'estimation publiée. Le montant confirmé (ou
corrigé) n'alimente que l'indicateur « Dividendes encaissés » : ni le solde ni les versements. Il
remplace alors les dividendes saisis avant la date de référence (jamais comptés deux fois), est
tracé dans `cash_account_revisions`, et est effacé si l'état initial change (à reconfirmer).

**Affichage des dividendes certifiés par relevé** : les lignes de relevé conservées dans
`cash_dividend_statement_lines` (voir « Certification par les relevés de coupons ») sont ajoutées
au journal de `GET /api/cash` (et de toute réponse qui renvoie le journal) comme dividendes en
lecture seule : `id = statement-line:<id>`, `kind: "dividend"`, `absorbed: true`,
`source: "statement"`, vérification `document` avec la référence `AAAA-MM#ligne`. Seules les
lignes de l'utilisateur antérieures ou égales à la date de départ **actuelle** sont renvoyées (une
ligne devenue postérieure est masquée). Chaque ligne est rattachée à une position par ISIN
(`positions.isin`, sinon l'ISIN le plus récent des avis d'opéré) ; sans position, l'ISIN et le nom
lu sur le relevé (`name`, migration 54, complété au réimport) sont affichés. Ces lignes ne sont
jamais des mouvements `cash_movements` et n'entrent dans aucun calcul : leur « solde après » est
celui de l'entrée précédente, et le solde, les versements, le plafond, « Dividendes encaissés »
(qui les compte déjà via le montant confirmé), le gain global et le XIRR sont inchangés. Elles
apparaissent grisées, avec la mention « avant la date de départ » et le badge « Certifié par
relevé », sans action, dans l'historique de « Mon PEA » et dans la liste des opérations d'une
position ; la carte « Dividendes déjà perçus » indique leur nombre.

## Contrôle des fonds

`withCashGuard` (`cash-guard.ts`) est le point de contrôle unique de toute écriture qui débite les
espèces : création, modification et suppression d'achats ou de ventes, suppression de position,
imports CSV et PDF, retraits, frais, suppression d'un mouvement. Dans une seule transaction SQLite :

1. le journal est rejoué avant l'écriture ;
2. le versement de financement éventuel, **confirmé explicitement** par l'utilisateur
   (`funding: { amount }` dans la requête), est inséré à la date de l'opération ;
3. l'écriture est appliquée et le journal rejoué à nouveau ;
4. si le plus bas solde passe sous zéro (ou s'y enfonce davantage), tout est annulé et l'API
   répond `422` avec `details = { code: "INSUFFICIENT_FUNDS", available, required, shortfall,
   effectiveAt, fundable }`.

Un import de plusieurs opérations est rejoué dans l'ordre chronologique avec un **contrôle
unique** sur le lot : les ventes du lot financent ses achats, une seule popup récapitule le
manque, et un refus n'écrit aucune ligne. Un retrait ou une suppression n'est jamais financé par
un versement (`fundable: false`).

## Opérations sur titres sans doublon

Le code vit dans `backend/src/services/portfolio/duplicates/` (règle commune) et
`backend/src/services/boursorama/avis-trade-linking.ts` (avis d'opéré).

**Opération identique** (`isIdenticalTrade`) : même position, même sens, et même instant
d'exécution (à la seconde près, `SAME_INSTANT_TOLERANCE_MS`) ou même jour à Paris avec la même
quantité et le même cours (`PRICE_TOLERANCE`, 4 décimales). Deux références d'ordre différentes
désignent toujours deux ordres distincts. Création ou modification d'un achat ou d'une vente
identique à une opération de la position : refus `409`, `details = { code:
"DUPLICATE_TRANSACTION", transactionId }`, sauf `confirmDuplicate: true` dans la requête ; la
fenêtre des opérations d'une position demande cette confirmation.

**Avis d'opéré** (`POST /api/import/avis-operes/preview` puis `/confirm`) :

- l'actif est d'abord reconnu par l'ISIN de l'avis (ISIN saisi sur une position de
  l'utilisateur, sinon lu sur ses avis déjà importés), puis seulement par ticker, nom ou recherche ;
- l'aperçu propose décochés (`action: "ignore"`) un avis déjà importé (même référence), une
  opération identique déjà enregistrée, un doublon probable (même jour, quantité et sens) et un
  avis répété dans le lot ; l'interface conserve ce choix, et cocher un doublon signalé envoie
  `confirmDuplicate: true` ;
- la confirmation recalcule tout sur l'état courant : une référence déjà importée est ignorée ; une
  opération identique unique (importée avant l'enregistrement de la référence, ou saisie à la main)
  **reçoit la référence d'ordre et l'ISIN de l'avis** sans rien créer (`linked` dans la réponse),
  même pour une ligne décochée ; plusieurs candidates sans instant commun sont signalées en erreur
  et rien n'est choisi ; seule une ligne avec `confirmDuplicate` crée une seconde opération ;
- un même fichier (empreinte SHA-256 du contenu, quel que soit son nom) envoyé deux fois dans un
  lot est refusé (`400`, `details.code = "DUPLICATE_UPLOAD"`), pour les avis comme pour les relevés.

**Dates** : l'heure imprimée sur un avis (sans fuseau) est lue dans le fuseau de l'application
(`TZ`, `Europe/Paris` par défaut, heure d'été comprise, `wall-clock.ts`) puis stockée en ISO UTC. La
migration 55 convertit de la même façon les dates enregistrées sans fuseau par les anciens imports :
l'instant lu par l'application, les positions, le PRU et la performance sont inchangés.

## Migration (version 47) et sauvegarde

La migration 52 vide les blocs d'interface en cache (`frontend_block_cache`) : écrits avant le
compte espèces et valides jusqu'à 72 heures après la clôture, ils ne portaient pas son statut et
masquaient la popup de configuration d'une base tout juste migrée.

- Avant d'appliquer la migration sur une base qui contient des utilisateurs, une copie complète
  est écrite par `VACUUM INTO` dans `backups/` à côté du fichier SQLite
  (`<base>-avant-migration-47-<horodatage>.sqlite`). En Docker : `/app/data/backups/`. Les autres
  migrations sensibles (55) font de même ; une seule copie est écrite par démarrage, avant la
  première d'entre elles.
- La migration ne modifie ni ne supprime aucune position, transaction ou donnée existante. Elle
  crée les tables ci-dessus, la colonne `import_ref`, et un compte espèces par utilisateur :
  `pending` s'il possède déjà des transactions, `ready` (solde nul) sinon.
- Elle est idempotente : une base déjà migrée n'est ni re-sauvegardée ni re-migrée.

**Restauration** : arrêter le serveur (`docker compose stop`), remplacer `pea.sqlite` par la copie
de `backups/` (et supprimer `pea.sqlite-wal` / `pea.sqlite-shm`), puis redémarrer une version
antérieure de l'image.

### État initial d'un portefeuille existant

À la première ouverture, un compte `pending` affiche une popup guidée. L'utilisateur renseigne :

1. la date de référence (par défaut maintenant) ;
2. le solde espèces à cette date ;
3. les versements cumulés depuis l'ouverture ;
4. les retraits cumulés depuis l'ouverture ;
5. facultativement la date d'ouverture du PEA (avertissement sur les retraits).

Rien n'est déduit des anciens achats : seuls le prix de revient des positions est affiché, à titre
d'information. Les opérations antérieures ou égales à la date de référence sont **résumées** par
l'état initial (marquées « résumé par l'état initial » dans l'historique) : un ajustement technique
ramène le solde rejoué au montant confirmé. Cet ajustement n'est jamais un versement, et un achat
antidaté avant la date de référence ne débite pas une seconde fois les espèces.

Garde-fous : aucun versement ni retrait ne peut être daté avant la date de référence ; une date de
référence postérieure à un versement enregistré est refusée ; un état initial qui rendrait le
solde négatif plus tard est refusé. L'état initial se corrige à tout moment depuis la page
« Mon PEA » ; chaque correction est tracée dans `cash_account_revisions`.

Tant que le compte est `pending`, les achats et ventes restent possibles sans contrôle (le solde
n'est pas connu ; ils seront résumés par l'état initial) mais aucun mouvement espèces ne peut être
saisi.

### Tester la migration sur une installation existante

1. Copier la base : `docker compose stop`, puis copier `pea.sqlite` (ou utiliser une copie locale).
2. Démarrer l'application sur cette copie (`PEA_DATA_DIR` vers un dossier contenant la copie, ou
   `npm run dev` avec la copie dans `data/`).
3. Vérifier la présence de la sauvegarde dans `backups/` et que positions et PRU sont inchangés.
4. Ouvrir le tableau de bord : la popup « Nouveau : le compte espèces de votre PEA » apparaît.
   Renseigner le solde espèces et les versements du relevé, valider.
5. Contrôler la page « Mon PEA » : l'état initial apparaît comme ajustement technique, les
   anciennes opérations comme résumées, et le solde espèces correspond au relevé.

## Certification par les relevés de coupons

Le code vit dans `backend/src/services/cash/dividend-statements/` (lecture et rapprochement) et
`backend/src/services/cash/dividends/` (vérification, correction).

**Niveaux de confiance** d'un mouvement `dividend` : aucun, `manual` (« Vérifié manuellement »,
`POST /api/cash/movements/:id/verify`) ou `document` (« Certifié par relevé », avec la date et la
référence `AAAA-MM#ligne`, sans donnée personnelle). Le document prime : une vérification manuelle
ne remplace jamais une certification. Corriger le montant ou la date d'un dividende vérifié retire
sa vérification ; pour un dividende certifié, l'API exige `confirmUncertify: true` (sinon `409`,
`details.code = "CERTIFIED_DIVIDEND"`) et l'interface affiche l'avertissement avant d'enregistrer
(`PUT /api/cash/movements/:id`, ou correction d'une proposition validée).

**Lecture d'un relevé** (`parser/`) : le texte est extrait par `pdf-parse` dans le processus enfant
des avis d'opéré ; le PDF (application/pdf, signature `%PDF-`, 2 Mo et 120 fichiers au plus, lus 4 à la fois) n'est
jamais écrit sur disque. `pdf-parse` n'écrit pas les cellules vides : une ligne française affiche 3
montants, une ligne étrangère 4. Chaque attribution possible des colonnes (brut, crédit d'impôt,
acompte, net fiscal, commission, net client) est contrôlée par l'arithmétique de la ligne (net
fiscal - commission = net client), puis l'ensemble par la ligne `TOTAL EUR` et le récapitulatif
`COUPONS : NETS FISCAUX`. Mois introuvable, feuillet manquant, ligne illisible, total faux ou
lecture ambiguë : le relevé est **refusé en entier**, sans importation partielle. Une quantité sur
une ligne à part est rattachée à sa ligne. Les remboursements (`DETAIL REMBOURSEMENTS`) ne sont
jamais des dividendes : chaque ligne (date, valeur, ISIN, montant unitaire, quantité, brut,
commission absente si nulle, net) est contrôlée (unitaire × quantité = brut au centime près, brut -
commission = net), leur somme par la ligne `TOTAL EUR` de la section et le récapitulatif
`REMBOURSEMENTS : BRUTS GLOBAUX` ; une ligne illisible ou un total faux refuse le relevé.

**Rapprochement** d'une ligne (`statement-reconciliation.ts`) : actif par ISIN uniquement
(`positions.isin`, sinon l'ISIN le plus récent des avis d'opéré), date par `isSameDividendCredit`,
montant au centime, jour à Paris. Cas : dividende enregistré identique (certifié), différent
(correction proposée, non cochée par défaut), proposition en attente ou ignorée (validée avec le
net du relevé et certifiée dans une transaction), aucun dividende (mouvement `dividend`, origine
`pdf`, `import_ref = statement:AAAA-MM#ligne`, certifié), crédit antérieur ou égal à l'état initial
(jamais crédité), ISIN inconnu (position à choisir, l'ISIN y est enregistré). Un compte `pending`
est refusé (`409`). La retenue réelle est comparée au taux estimé de `withholding-tax.ts` (écart
signalé au-delà de 2 % du brut et 2 centimes).

**Remboursements de capital** (`statement-refunds.ts`, règle commune
`credits/other-credit-matching.ts`) : clé `AAAA-MM#R<ligne>`. Un mouvement `capital_repayment` est
le même crédit s'il a le même montant au centime, une date à 15 jours au plus
(`OTHER_CREDIT_MATCH_WINDOW_DAYS`) et le même actif quand les deux en ont un (le nom n'est jamais un
critère) ; un mouvement déjà certifié par une autre ligne est exclu. Cas : déjà créé ou certifié
par cette ligne (`already_certified`, réimport sans effet), un seul candidat (certifié), plusieurs
(`ambiguous` : rien n'est choisi, l'utilisateur désigne le mouvement, `movementId` dans la
décision, recontrôlé côté serveur parmi ses seuls candidats), aucun (mouvement créé, origine `pdf`,
`import_ref = statement:AAAA-MM#R<ligne>`, certifié ; sans position portant l'ISIN, il est créé sans
actif avec le nom et l'ISIN en note ; non coché par défaut si un remboursement d'un autre montant
existe pour la même valeur à une date proche), date future (ignoré). Un remboursement antérieur à
l'état initial est enregistré de la même façon : résumé par l'état initial, il ne change pas le
solde mais est déduit du calcul des dividendes déjà perçus. La référence d'import unique interdit
une seconde création, quel que soit l'ordre des imports.

**Import en lot** (Réglages, `POST /api/cash/dividend-statements/preview` puis `/confirm`) :
l'aperçu n'écrit rien ; la confirmation renvoie les mêmes fichiers avec les choix (`decisions`),
le serveur relit les relevés et recalcule chaque cas sur l'état courant, ligne par ligne dans une
transaction. Les lignes antérieures à l'état initial peuvent être certifiées comme dividendes déjà
perçus : elles sont conservées dans `cash_dividend_statement_lines` et leur total devient le
montant confirmé (tracé dans `cash_account_revisions`) ; une modification manuelle de ce montant
retire la certification. Réimporter un relevé ne crée rien et l'indique « déjà certifié ».

**Un seul dividende** (fenêtre du dividende, `POST /api/cash/movements/:id/statement-check` puis
`/statement-certify`) : le relevé du mois suffit. Sans correspondance exacte, un avertissement
précis est renvoyé (autre mois, absent à cette date, montant ou date différents, ISIN inconnu) avec
les lignes de l'actif ; rien n'est écrit sans confirmation, et un écart n'est corrigé qu'avec
`correct=true`.

## Remboursements de capital et indemnisations

Deux types de mouvement (migration 56, qui recopie `cash_movements` à l'identique pour élargir la
contrainte du type, base sauvegardée avant) : `capital_repayment` (prime d'émission, réduction de
capital) et `compensation` (rompus d'une attribution gratuite, soulte). Ce sont des crédits : ils
augmentent le solde, mais ne sont ni des versements (plafond, versements nets, XIRR) ni des
dividendes (`cashDividends`) ; ils alimentent l'indicateur « Autres crédits ». Ils se saisissent
dans « Mon PEA » (formulaire « Ajouter un mouvement », actif facultatif), y compris avant la date de
l'état initial (résumés, sans effet sur le solde, mais déduits des dividendes déjà perçus), et se
filtrent dans l'historique. Les remboursements sont aussi créés ou certifiés par l'import des
relevés de coupons (voir ci-dessus). Supprimer l'un d'eux passe par `withCashGuard`, comme tout
mouvement.

## Lecture des relevés espèces

Le relevé espèces mensuel est le document qui fait foi pour tous les flux d'argent. Sa lecture vit
dans `backend/src/services/cash/cash-statements/parser/` ; le PDF est extrait en mémoire par le
processus enfant des avis d'opéré et n'est jamais conservé. Seuls les champs utiles sont gardés :
dates d'écriture et de valeur, libellé normalisé (`VIR Virement de`, sans le nom), montant signé,
quantité, nom abrégé de la valeur, date d'échéance d'un coupon. Jamais d'IBAN, de nom du titulaire,
de numéro de compte ni de nom de donneur d'ordre.

**Formats** : l'ancien (jusqu'à janvier 2026, « RELEVE COMPTE ESPECES : JUILLET 2021 », feuillets,
tableau borné par `ANCIEN SOLDE` et `NOUVEAU SOLDE`, milliers séparés par une espace) et le nouveau
(à partir de février 2026, « Du … au … 1/1 », `Solde au`, date de valeur, milliers séparés par un
point, nom et quantité sur des lignes à part, caractère parasite possible avant le nouveau solde).
Le mois est lu dans le contenu, jamais dans le nom du fichier.

**Sens** : `pdf-parse` perd les colonnes Débit / Crédit. Le libellé, reconnu en début de ligne
seulement (`VEOLIA ENVIRON.` contient « VIR »), donne le sens quand il est sans équivoque :
virements entrants (`VIR VIREMENT CREATION COMPTE`, `VIR Virement interne depuis`, `VIR Virement
depuis`, `VIR Virement de`), achats, ventes, coupons (`COUPONS ECHEANCE JJ/MM`), remboursements
(`REMBOURSEMENT TITRES`), indemnisations (`LIQUID. INDEMNISATION`), frais, taxes et retraits. Un
autre virement (`VIR …`) ou une reprise de solde peuvent être dans les deux sens. Contrôle
obligatoire : ancien solde + lignes = nouveau solde au centime ; seule l'unique attribution qui
boucle est acceptée (`statement-signs.ts`). Un montant de l'ancien format est d'abord lu avec ses
milliers (« 2 583,38 ») ; si rien ne boucle, les autres lectures (« 583,38 » précédé de « 2 ») sont
essayées. Libellé inconnu, solde qui ne boucle pas, plusieurs lectures qui bouclent, feuillet ou page
manquant, opération hors de la période : le relevé est **refusé en entier**.

**Continuité** (`statement-continuity.ts`) : chaque relevé est comparé au précédent connu (importé
ou du même lot) : continu (mois suivant, ancien solde = nouveau solde précédent), rupture de solde,
mois manquant (avec l'indication que le solde se suit, mois probablement sans opération, ou non,
relevé oublié) ou changement de compte (ancien solde nul et ligne `Reprise solde compte` égale au
solde précédent : transfert neutre, ni versement ni crédit). Une empreinte du contenu lu (sans
donnée personnelle) reconnaît deux fichiers identiques.

## Rapprochement des relevés espèces

Le code vit dans `backend/src/services/cash/cash-statements/` (règles pures dans `matching/`,
`statement-classification.ts` et `statement-coverage.ts`) ; l'import passe par `POST
/api/cash/cash-statements/preview` puis `/confirm` (Réglages, à côté des autres imports, 120 relevés
au plus par lot, lus 4 à la fois). L'aperçu n'écrit rien ; la confirmation relit les fichiers,
enregistre chaque relevé et ses lignes (un mois déjà importé à l'identique est relu sans rien
recréer, un autre contenu pour le même mois est refusé, deux fois le même mois dans un lot aussi),
puis applique chaque ligne choisie dans sa transaction, après recalcul sur l'état courant.

**Critères** (`matching/line-matching.ts`) : nature (donc sens), montant signé au centime, quantité
pour un achat ou une vente, date d'écriture dans une fenêtre nommée (`match-windows.ts`) : un achat
ou une vente est écrit de 1 jour avant à 5 jours après l'exécution, un coupon jusqu'à 15 jours
après son paiement (3 jours avant pour une saisie manuelle), un versement, un retrait ou des frais à
7 jours près, un remboursement ou une indemnisation à 15 jours près. Le nom abrégé de la valeur
n'est jamais un critère. Les candidats sont les transactions, les mouvements et, pour un coupon
antérieur à l'état initial, les lignes de relevé de coupons certifiées ; un élément déjà rapproché
d'une autre ligne n'est jamais candidat. Sur tout le lot, une ligne qui n'a plus qu'un candidat le
prend ; n lignes identiques face aux mêmes n éléments sont appariées dans l'ordre chronologique ;
une ligne face à plusieurs éléments reste **ambiguë** et l'utilisateur choisit (`targetId`,
recontrôlé côté serveur parmi les seuls candidats).

| Ligne du relevé | Rapprochée avec | Si rien ne correspond |
|---|---|---|
| Achat / vente | transaction : sens, montant net (quantité × cours ± frais), quantité, fenêtre | « Avis d'opéré manquant », rien n'est créé |
| Coupon | dividende (mouvement, ou ligne de relevé de coupons avant l'état initial) | après l'état initial : dividende créé à sa date d'échéance, position choisie par l'utilisateur (une proposition en attente est validée plutôt que doublée ; un autre dividende proche de la même valeur refuse la création) ; avant : « relevé de coupons manquant » |
| Virement entrant / sortant, frais | versement, retrait, frais | créé (origine `pdf`, `import_ref = cash-statement:AAAA-MM#ligne`, affiché « Relevé espèces ») ; avant l'état initial : résumé par celui-ci, rien n'est créé |
| Remboursement / indemnisation | mouvement du même type | créé (même avant l'état initial : résumé, mais déduit des dividendes déjà perçus), nom abrégé en note |
| Reprise de solde | — | transfert neutre, aucun mouvement |

Un versement créé est daté du début du jour d'écriture à Paris (il précède les achats qu'il finance
le même jour) ; un retrait ou des frais passent par `withCashGuard`. Le remboursement est le même
crédit pour les deux documents : créé par le relevé de coupons, il est vérifié par le relevé
espèces ; créé par le relevé espèces, il est certifié par le relevé de coupons (critères de
`other-credit-matching.ts`) : jamais deux mouvements.

**Contrôle de chaque élément** (`cashCheck` des lignes du journal et des opérations d'une position) :
`verified` (« Vérifié par relevé espèces », référence `AAAA-MM#ligne` et date), `not_found` (« Non
retrouvé au relevé » : toute la fenêtre où il aurait dû être écrit est couverte par des relevés
importés, mais aucune ligne ne lui correspond, doublon ou erreur probable) ou `to_verify` (« À
vérifier »). Un dividende peut porter les deux niveaux : « Certifié par relevé » (coupons) et
« Vérifié par relevé espèces ».

**Modifier ou supprimer un élément vérifié** (achat, vente, mouvement, position contenant une
opération vérifiée, correction d'un dividende) retire la vérification : sans `confirmUnverify`
(corps de la requête, ou `?confirmUnverify=true` pour une suppression), l'API répond `409`,
`details = { code: "CASH_STATEMENT_VERIFIED", reference }`, et l'interface affiche
l'avertissement avant de renvoyer la demande confirmée. La ligne redevient à rapprocher ; un
réimport du relevé la vérifie de nouveau si l'élément y correspond toujours (ou crée l'élément
manquant). Une correction issue d'un relevé de coupons vaut confirmation.

## Limites connues

- Les versements antérieurs à la refonte ne peuvent pas être reconstitués : la performance
  historique d'un portefeuille migré est indicative et le XIRR n'est pas calculé.
- Le compte espèces est en euros ; les opérations sur titres sont comptées dans leur devise sans
  conversion, comme le reste du tableau de bord.
- Les ajustements d'un import CSV de détentions (sans historique) sont des achats et ventes datés
  de l'import au PRU de l'export : leur effet sur les espèces est une approximation.
- Les dividendes encaissés ne sont jamais créés à partir des dividendes estimés : seuls les
  détachements réels sont proposés, crédités après validation, ou sans clic s'ils sont sûrs et
  que l'ajout automatique est activé. Les jours fériés ne
  sont pas pris en compte dans la date de paiement estimée.
- Le solde espèces ne se corrige pas directement : un écart avec le relevé du courtier se résout
  en corrigeant les mouvements ou l'état initial (aucun type « écart de rapprochement » n'existe).
- Aucune fiscalité n'est calculée pour les retraits : seul un avertissement informatif est affiché.
- Relevés espèces : un relevé par mois (deux comptes le même mois, lors d'un changement de compte,
  ne sont pas distingués) ; une ligne restée sans avis d'opéré ou sans relevé de coupons n'est
  rapprochée qu'au réimport du relevé espèces, après l'import du document manquant.
