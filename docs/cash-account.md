# Compte espèces du PEA

Ce document décrit comment l'application sépare les **versements** (argent apporté au PEA depuis
l'extérieur) des **achats** (argent du PEA converti en titres). Les règles vivent dans le backend
(`backend/src/services/cash/`) ; le frontend ne fait qu'afficher et recueillir les confirmations.

## Modèle de données

| Table | Rôle |
|---|---|
| `transactions` | Achats (`buy`) et ventes (`sell`) existants, avec frais. Nouvelle colonne `import_ref` (référence d'ordre d'un avis PDF, préfixée `pdf:`) pour refuser un second import. |
| `cash_movements` | Versements (`deposit`), retraits (`withdrawal`), dividendes encaissés (`dividend`), frais indépendants (`fee`). Montant en **centimes entiers** (`amount_cents > 0`), date effective, actif lié éventuel, origine (`manual`, `csv`, `pdf`, `migration`), référence d'import unique par utilisateur. |
| `cash_accounts` | Une ligne par utilisateur : statut (`pending` / `ready`), état initial (date de référence, solde espèces, versements et retraits cumulés à cette date, en centimes) et date d'ouverture facultative. |
| `cash_account_revisions` | Trace de chaque confirmation ou correction de l'état initial (avant / après, en JSON). |

Le **solde espèces n'est jamais stocké**. Il est recalculé à chaque lecture en rejouant, dans
l'ordre chronologique, les mouvements et les transactions (`cash-ledger.ts`). À date égale, l'ordre
est déterministe : état initial, versement, dividende, vente, achat, frais, retrait, puis
identifiant.

Effet sur les espèces :

- achat : `-(quantité × prix + frais)` ;
- vente : `+(quantité × prix - frais)` ;
- versement et dividende encaissé : crédit ; retrait et frais : débit.

Les montants sont arrondis au centime puis additionnés en entiers : aucune dérive flottante.

## Indicateurs

- **Versements cumulés** = versements déclarés dans l'état initial + versements enregistrés
  ensuite. Un achat, une vente, un dividende, une plus-value ou un ajustement technique ne les
  augmentent jamais.
- **Retraits cumulés** sont suivis séparément : ils n'effacent pas les versements.
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
distincts des dividendes **encaissés**, saisis dans le journal espèces.

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

## Migration (version 47) et sauvegarde

- Avant d'appliquer la migration sur une base qui contient des utilisateurs, une copie complète
  est écrite par `VACUUM INTO` dans `backups/` à côté du fichier SQLite
  (`<base>-avant-migration-47-<horodatage>.sqlite`). En Docker : `/app/data/backups/`.
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

## Limites connues

- Les versements antérieurs à la refonte ne peuvent pas être reconstitués : la performance
  historique d'un portefeuille migré est indicative et le XIRR n'est pas calculé.
- Le compte espèces est en euros ; les opérations sur titres sont comptées dans leur devise sans
  conversion, comme le reste du tableau de bord.
- Les ajustements d'un import CSV de détentions (sans historique) sont des achats et ventes datés
  de l'import au PRU de l'export : leur effet sur les espèces est une approximation.
- Les dividendes encaissés sont saisis manuellement ; ils ne sont pas créés à partir des
  dividendes estimés.
- Aucune fiscalité n'est calculée pour les retraits : seul un avertissement informatif est affiché.
