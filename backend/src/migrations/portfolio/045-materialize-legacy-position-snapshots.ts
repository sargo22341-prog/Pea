import type { Migration } from "../types.js";

/**
 * Les transactions sont l'unique source de vérité des positions. Une position historique avec une
 * quantité mais sans aucune transaction reçoit une transaction d'origine reprenant son snapshot :
 * sans elle, la première transaction ajoutée effaçait cette quantité et une vente était refusée
 * comme rendant la détention négative.
 *
 * Le snapshot est la détention actuelle, déjà divisée : la transaction est datée de la création de
 * la position, ou du jour de la dernière division appliquée par l'utilisateur si elle est plus
 * récente, afin qu'aucune division ne la multiplie à la lecture.
 */
export const materializeLegacyPositionSnapshotsMigration: Migration = {
  version: 45,
  description: "Transforme les snapshots de positions sans transaction en transaction d'origine",
  appliquer: (db) => {
    db.exec(`
      INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source)
      SELECT p.id, 'buy', p.quantity, p.average_buy_price, 0, p.currency,
             MAX(
               strftime('%Y-%m-%dT%H:%M:%fZ', p.created_at),
               COALESCE((
                 SELECT MAX(s.split_date) || 'T00:00:00.000Z'
                 FROM asset_splits s
                 JOIN assets a ON a.id = s.asset_id
                 JOIN user_split_decisions d ON d.asset_split_id = s.id AND d.user_id = p.user_id AND d.decision = 'apply'
                 WHERE a.symbol = p.symbol
               ), '')
             ),
             'csv'
      FROM positions p
      WHERE p.quantity > 0
        AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.position_id = p.id)
    `);
  }
};
