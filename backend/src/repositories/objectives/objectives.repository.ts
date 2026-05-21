import type { ObjectiveAssumptions, ObjectiveConfig, ObjectiveProjection, ObjectiveType } from "@pea/shared";
import { db } from "../../db.js";

export interface ObjectiveRow {
  id: number;
  user_id: number;
  title: string;
  type: ObjectiveType;
  active: number;
  config_json: string;
  assumptions_json: string;
  created_at: string;
  updated_at: string;
  projection_json?: string | null;
  last_updated_at?: string | null;
  next_update_at?: string | null;
}

export interface ObjectiveInsert {
  userId: number;
  title: string;
  type: ObjectiveType;
  active: boolean;
  config: ObjectiveConfig;
  assumptions: ObjectiveAssumptions;
}

export class ObjectivesRepository {
  list(userId: number): ObjectiveRow[] {
    return db.prepare(`
      SELECT o.*, c.projection_json, c.last_updated_at, c.next_update_at
      FROM financial_objectives o
      LEFT JOIN objective_projection_cache c ON c.objective_id = o.id
      WHERE o.user_id = ?
      ORDER BY o.active DESC, o.updated_at DESC, o.id DESC
    `).all(userId) as ObjectiveRow[];
  }

  listActive(): ObjectiveRow[] {
    return db.prepare(`
      SELECT o.*, c.projection_json, c.last_updated_at, c.next_update_at
      FROM financial_objectives o
      LEFT JOIN objective_projection_cache c ON c.objective_id = o.id
      WHERE o.active = 1
      ORDER BY o.updated_at DESC
    `).all() as ObjectiveRow[];
  }

  listActiveForUser(userId: number): ObjectiveRow[] {
    return db.prepare(`
      SELECT o.*, c.projection_json, c.last_updated_at, c.next_update_at
      FROM financial_objectives o
      LEFT JOIN objective_projection_cache c ON c.objective_id = o.id
      WHERE o.user_id = ? AND o.active = 1
      ORDER BY o.updated_at DESC
    `).all(userId) as ObjectiveRow[];
  }

  find(userId: number, objectiveId: number): ObjectiveRow | undefined {
    return db.prepare(`
      SELECT o.*, c.projection_json, c.last_updated_at, c.next_update_at
      FROM financial_objectives o
      LEFT JOIN objective_projection_cache c ON c.objective_id = o.id
      WHERE o.user_id = ? AND o.id = ?
    `).get(userId, objectiveId) as ObjectiveRow | undefined;
  }

  create(input: ObjectiveInsert): ObjectiveRow {
    db.prepare(`
      INSERT INTO financial_objectives (user_id, title, type, active, config_json, assumptions_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.userId,
      input.title,
      input.type,
      input.active ? 1 : 0,
      JSON.stringify(input.config),
      JSON.stringify(input.assumptions)
    );
    const row = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
    return this.find(input.userId, row.id)!;
  }

  update(userId: number, objectiveId: number, input: Omit<ObjectiveInsert, "userId">): ObjectiveRow | undefined {
    db.prepare(`
      UPDATE financial_objectives
      SET title = ?, type = ?, active = ?, config_json = ?, assumptions_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND id = ?
    `).run(
      input.title,
      input.type,
      input.active ? 1 : 0,
      JSON.stringify(input.config),
      JSON.stringify(input.assumptions),
      userId,
      objectiveId
    );
    return this.find(userId, objectiveId);
  }

  delete(userId: number, objectiveId: number): boolean {
    return db.prepare("DELETE FROM financial_objectives WHERE user_id = ? AND id = ?").run(userId, objectiveId) > 0;
  }

  upsertProjection(userId: number, objectiveId: number, projection: ObjectiveProjection, lastUpdatedAt: string, nextUpdateAt: string): void {
    db.prepare(`
      INSERT INTO objective_projection_cache (objective_id, user_id, projection_json, last_updated_at, next_update_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(objective_id) DO UPDATE SET
        projection_json = excluded.projection_json,
        last_updated_at = excluded.last_updated_at,
        next_update_at = excluded.next_update_at,
        user_id = excluded.user_id
    `).run(objectiveId, userId, JSON.stringify(projection), lastUpdatedAt, nextUpdateAt);
  }
}

export const objectivesRepository = new ObjectivesRepository();
