/**
 * 实体存储 + 关系（知识图谱）存储：每 novel 独立 entities.db。
 * entities 表（collection/id/name/state/fields）+ relations 表（source_id/rel_type/target_id/text/chapter）。
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
  db.pragma("journal_mode = WAL");
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
  db.exec(
    `CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      rel_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      text TEXT,
      chapter INTEGER
    )`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id)`);
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

export interface Relation {
  source_id: string;
  rel_type: string;
  target_id: string;
  text: string;
  chapter?: number | null;
}

function rowToEntity(row: {
  collection: string;
  id: string;
  name: string | null;
  state: string | null;
  fields: string | null;
}): Entity {
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

// ---------- entities ----------

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

// ---------- relations (knowledge graph) ----------

export function upsertRelations(novelId: string, rels: Relation[]): void {
  const db = getDb(novelId);
  const stmt = db.prepare(
    `INSERT INTO relations(source_id, rel_type, target_id, text, chapter) VALUES (?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction((rs: Relation[]) => {
    for (const r of rs) {
      stmt.run(r.source_id, r.rel_type, r.target_id, r.text, r.chapter ?? null);
    }
  });
  tx(rels);
}

export function clearRelations(novelId: string): void {
  const db = getDb(novelId);
  db.exec(`DELETE FROM relations`);
}

export function listRelations(
  novelId: string,
  entityId?: string,
  relType?: string,
): (Relation & { id: number })[] {
  const db = getDb(novelId);
  let sql = `SELECT * FROM relations WHERE 1=1`;
  const params: any[] = [];
  if (entityId) {
    sql += ` AND (source_id = ? OR target_id = ?)`;
    params.push(entityId, entityId);
  }
  if (relType) {
    sql += ` AND rel_type = ?`;
    params.push(relType);
  }
  sql += ` ORDER BY id`;
  return (db.prepare(sql).all(...params) as any[]).map((r) => ({
    id: r.id,
    source_id: r.source_id,
    rel_type: r.rel_type,
    target_id: r.target_id,
    text: r.text ?? "",
    chapter: r.chapter,
  }));
}

export interface Neighbor {
  relation_id: number;
  entity_id: string;
  rel_type: string;
  direction: "out" | "in";
  text: string;
  chapter?: number | null;
}

export function getNeighbors(
  novelId: string,
  entityId: string,
  relType?: string,
): Neighbor[] {
  const rels = listRelations(novelId, entityId, relType);
  const out: Neighbor[] = [];
  for (const r of rels) {
    if (r.source_id === entityId) {
      out.push({
        relation_id: r.id,
        entity_id: r.target_id,
        rel_type: r.rel_type,
        direction: "out",
        text: r.text,
        chapter: r.chapter,
      });
    }
    if (r.target_id === entityId) {
      out.push({
        relation_id: r.id,
        entity_id: r.source_id,
        rel_type: r.rel_type,
        direction: "in",
        text: r.text,
        chapter: r.chapter,
      });
    }
  }
  return out;
}

export function relationStats(
  novelId: string,
): { relations: number; types: Record<string, number> } {
  const db = getDb(novelId);
  const total = (db.prepare(`SELECT COUNT(*) as n FROM relations`).get() as { n: number }).n;
  const typeRows = db
    .prepare(`SELECT rel_type, COUNT(*) as n FROM relations GROUP BY rel_type`)
    .all() as { rel_type: string; n: number }[];
  const types: Record<string, number> = {};
  for (const r of typeRows) types[r.rel_type] = r.n;
  return { relations: total, types };
}
