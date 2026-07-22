/**
 * 实体存储：每 novel 独立 entities.db，通用实体表（collection/id/name/state/fields）。
 * 8 类 collection（characters/foreshadowing/storylines/timeline/locations/items/events/easter_eggs）。
 * scoped P2-2：仅提取前 4 类；store 通用，后续可扩展。
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { fileService } from "./file.service.js";

export const ENTITY_COLLECTIONS = [
  "characters",
  "foreshadowing",
  "storylines",
  "timeline",
  "locations",
  "items",
  "events",
  "easter_eggs",
] as const;
export type EntityCollection = (typeof ENTITY_COLLECTIONS)[number];

const dbCache = new Map<string, Database.Database>();

function getDb(novelId: string): Database.Database {
  const cached = dbCache.get(novelId);
  if (cached) return cached;
  const novelDir = fileService.getNovelDir(novelId);
  fs.mkdirSync(path.join(novelDir, ".fictia"), { recursive: true });
  const db = new Database(path.join(novelDir, ".fictia", "entities.db"));
  db.exec(
    `CREATE TABLE IF NOT EXISTS entities (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT,
      state TEXT,
      fields TEXT,
      PRIMARY KEY (collection, id)
    )`,
  );
  dbCache.set(novelId, db);
  return db;
}

export interface Entity {
  collection: string;
  id: string;
  name: string;
  state: string;
  fields: Record<string, unknown>;
}

function rowToEntity(row: { collection: string; id: string; name: string | null; state: string | null; fields: string | null }): Entity {
  let fields: Record<string, unknown> = {};
  try {
    fields = row.fields ? JSON.parse(row.fields) : {};
  } catch {
    fields = {};
  }
  return {
    collection: row.collection,
    id: row.id,
    name: row.name ?? "",
    state: row.state ?? "",
    fields,
  };
}

export function upsertEntities(novelId: string, entities: Entity[]): void {
  const db = getDb(novelId);
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO entities(collection, id, name, state, fields) VALUES (?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction((es: Entity[]) => {
    for (const e of es) {
      stmt.run(e.collection, e.id, e.name, e.state, JSON.stringify(e.fields));
    }
  });
  tx(entities);
}

export function clearEntities(novelId: string, collection?: string): void {
  const db = getDb(novelId);
  if (collection) {
    db.prepare(`DELETE FROM entities WHERE collection = ?`).run(collection);
  } else {
    db.exec(`DELETE FROM entities`);
  }
}

export function listEntities(novelId: string, collection?: string): Entity[] {
  const db = getDb(novelId);
  const rows = collection
    ? db.prepare(`SELECT * FROM entities WHERE collection = ? ORDER BY id`).all(collection)
    : db.prepare(`SELECT * FROM entities ORDER BY collection, id`).all();
  return (rows as any[]).map(rowToEntity);
}

export function getEntity(novelId: string, collection: string, id: string): Entity | null {
  const db = getDb(novelId);
  const row = db
    .prepare(`SELECT * FROM entities WHERE collection = ? AND id = ?`)
    .get(collection, id) as any | undefined;
  return row ? rowToEntity(row) : null;
}

export function searchEntities(
  novelId: string,
  query: string,
  collection?: string,
): Entity[] {
  const db = getDb(novelId);
  const like = `%${query}%`;
  const rows = collection
    ? db
        .prepare(`SELECT * FROM entities WHERE collection = ? AND (name LIKE ? OR fields LIKE ?)`)
        .all(collection, like, like)
    : db
        .prepare(`SELECT * FROM entities WHERE name LIKE ? OR fields LIKE ?`)
        .all(like, like);
  return (rows as any[]).map(rowToEntity);
}

export function entityStats(novelId: string): Record<string, number> {
  const db = getDb(novelId);
  const stats: Record<string, number> = {};
  for (const c of ENTITY_COLLECTIONS) {
    const row = db
      .prepare(`SELECT COUNT(*) as n FROM entities WHERE collection = ?`)
      .get(c) as { n: number };
    stats[c] = row.n;
  }
  return stats;
}
