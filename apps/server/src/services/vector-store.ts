/**
 * 向量库：sqlite-vec + better-sqlite3 封装。
 *
 * 每个 novel 一个独立 vector.db（<novelDir>/.fictia/vector.db），与主库分离。
 * 6 个 collection：chapters / design / world / outlines / notes / sources。
 * 每个 collection 两张表：vec_<c>（sqlite-vec 虚表，存向量）+ meta_<c>（存原文+元数据）。
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as fs from "fs";
import * as path from "path";
import { fileService } from "./file.service.js";
import { EMBED_DIM } from "../utils/embedding.js";

export const VECTOR_COLLECTIONS = [
  "chapters",
  "design",
  "world",
  "outlines",
  "notes",
  "sources",
] as const;
export type VectorCollection = (typeof VECTOR_COLLECTIONS)[number];

const dbCache = new Map<string, Database.Database>();

function getDb(novelId: string): Database.Database {
  const cached = dbCache.get(novelId);
  if (cached) return cached;

  const novelDir = fileService.getNovelDir(novelId);
  const vecDir = path.join(novelDir, ".fictia");
  fs.mkdirSync(vecDir, { recursive: true });
  const dbPath = path.join(vecDir, "vector.db");

  const db = new Database(dbPath);
  sqliteVec.load(db);

  for (const c of VECTOR_COLLECTIONS) {
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS vec_${c} USING vec0(id TEXT PRIMARY KEY, embedding float[${EMBED_DIM}])`,
    );
    db.exec(
      `CREATE TABLE IF NOT EXISTS meta_${c} (id TEXT PRIMARY KEY, text TEXT, metadata TEXT)`,
    );
  }

  db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)`);

  dbCache.set(novelId, db);
  return db;
}

export interface VectorItem {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  vector: number[];
}

export function isCollection(name: string): name is VectorCollection {
  return (VECTOR_COLLECTIONS as readonly string[]).includes(name);
}

export function upsertVectors(
  novelId: string,
  collection: VectorCollection,
  items: VectorItem[],
): void {
  const db = getDb(novelId);
  const delVec = db.prepare(`DELETE FROM vec_${collection} WHERE id = ?`);
  const insVec = db.prepare(
    `INSERT INTO vec_${collection}(id, embedding) VALUES (?, ?)`,
  );
  const insMeta = db.prepare(
    `INSERT OR REPLACE INTO meta_${collection}(id, text, metadata) VALUES (?, ?, ?)`,
  );
  const tx = db.transaction((its: VectorItem[]) => {
    for (const it of its) {
      delVec.run(it.id);
      insVec.run(it.id, JSON.stringify(it.vector));
      insMeta.run(it.id, it.text, JSON.stringify(it.metadata ?? {}));
    }
  });
  tx(items);
}

export interface SearchHit {
  id: string;
  score: number;
  text: string;
  metadata: Record<string, unknown>;
}

export function queryVectors(
  novelId: string,
  collection: VectorCollection,
  queryVec: number[],
  topK = 5,
): SearchHit[] {
  const db = getDb(novelId);
  const rows = db
    .prepare(
      `SELECT id, distance FROM vec_${collection} WHERE embedding MATCH ? AND k = ? ORDER BY distance`,
    )
    .all(JSON.stringify(queryVec), topK) as { id: string; distance: number }[];

  const hits: SearchHit[] = [];
  const getMeta = db.prepare(
    `SELECT text, metadata FROM meta_${collection} WHERE id = ?`,
  );
  for (const r of rows) {
    const meta = getMeta.get(r.id) as
      | { text: string; metadata: string | null }
      | undefined;
    if (meta) {
      hits.push({
        id: r.id,
        score: 1 - r.distance,
        text: meta.text,
        metadata: meta.metadata ? JSON.parse(meta.metadata) : {},
      });
    }
  }
  return hits;
}

export function clearCollection(novelId: string, collection: VectorCollection): void {
  const db = getDb(novelId);
  db.exec(`DELETE FROM vec_${collection}`);
  db.exec(`DELETE FROM meta_${collection}`);
}

export function collectionStats(novelId: string): Record<string, number> {
  const db = getDb(novelId);
  const stats: Record<string, number> = {};
  for (const c of VECTOR_COLLECTIONS) {
    const row = db.prepare(`SELECT COUNT(*) as n FROM meta_${c}`).get() as { n: number };
    stats[c] = row.n;
  }
  return stats;
}

/** 记录当前向量库是用哪个 embedding provider 索引的（查询时校验一致性）。 */
export function setIndexProvider(novelId: string, provider: string): void {
  const db = getDb(novelId);
  db.prepare(`INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)`).run(
    "index_provider",
    provider,
  );
}

export function getIndexProvider(novelId: string): string | null {
  const db = getDb(novelId);
  const row = db
    .prepare(`SELECT value FROM kv WHERE key = ?`)
    .get("index_provider") as { value: string | null } | undefined;
  return row?.value ?? null;
}
