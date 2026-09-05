/**
 * 向量库：sqlite-vec + better-sqlite3 封装。
 *
 * 每个 novel 一个独立 vector.db（<novelDir>/.fictia/vector.db），与主库分离。
 * 4 个 collection：chapters / design / world / outlines（notes / sources 无子系统，
 * 暂不提供，P3 需要时再加回）。每个 collection 两张表：vec_<c>（sqlite-vec 虚表，
 * 存向量）+ meta_<c>（存原文+元数据）。
 *
 * kv 表存两类元数据：
 *   - index_meta   索引配置指纹（provider/modelDir/dtype/切块参数），变更即要求重建
 *   - file_index   每文件指纹 { hash, chunkIds }，增量索引用于跳过未变化文件
 *
 * score 语义：sqlite-vec 默认 L2 距离。embedding 出口保证 L2 归一化，故
 * cos = 1 - d²/2，queryVectors 返回的 score 即余弦相似度（[0,1] 附近）。
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
  // 写入集中在索引/重建事务里，读多写少；WAL 减少读写互斥 + 进程意外退出的恢复风险。
  db.pragma("journal_mode = WAL");
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

/** 删除指定块（增量索引：文件变化/移除时清掉旧块）。 */
export function deleteChunkIds(
  novelId: string,
  collection: VectorCollection,
  chunkIds: string[],
): void {
  if (chunkIds.length === 0) return;
  const db = getDb(novelId);
  const delVec = db.prepare(`DELETE FROM vec_${collection} WHERE id = ?`);
  const delMeta = db.prepare(`DELETE FROM meta_${collection} WHERE id = ?`);
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) {
      delVec.run(id);
      delMeta.run(id);
    }
  });
  tx(chunkIds);
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
        // 单位向量下 L2² = 2 - 2cos → cos = 1 - d²/2，score 即余弦相似度
        score: 1 - (r.distance * r.distance) / 2,
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

// ===== 索引配置指纹（kv.index_meta）=====

export interface VectorIndexMeta {
  /** v2：带切块参数与模型信息的指纹；v1（纯 provider 字符串）视为不匹配 → 重建。 */
  version: 2;
  provider: string;
  modelDir?: string;
  dtype?: string;
  chunkChars: number;
  chunkOverlap: number;
}

function kvGet(db: Database.Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as
    | { value: string | null }
    | undefined;
  return row?.value ?? null;
}

function kvSet(db: Database.Database, key: string, value: string): void {
  db.prepare(`INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)`).run(key, value);
}

export function setIndexMeta(novelId: string, meta: VectorIndexMeta): void {
  kvSet(getDb(novelId), "index_meta", JSON.stringify(meta));
}

export function getIndexMeta(novelId: string): VectorIndexMeta | null {
  const raw = kvGet(getDb(novelId), "index_meta");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VectorIndexMeta;
    if (parsed && parsed.version === 2) return parsed;
  } catch {
    // 旧格式或损坏 → 视为无记录
  }
  return null;
}

/**
 * 索引配置是否与当前期望一致。provider / 模型目录 / 精度 / 切块参数任一变化
 * 都会导致块划分与向量空间不一致，必须全量重建。
 */
export function indexMetaMatches(
  meta: VectorIndexMeta | null,
  expected: VectorIndexMeta,
): boolean {
  if (!meta) return false;
  return (
    meta.provider === expected.provider &&
    (meta.modelDir ?? "") === (expected.modelDir ?? "") &&
    (meta.dtype ?? "") === (expected.dtype ?? "") &&
    meta.chunkChars === expected.chunkChars &&
    meta.chunkOverlap === expected.chunkOverlap
  );
}

/** 兼容旧调用方：只取 provider 字符串。 */
export function getIndexProvider(novelId: string): string | null {
  return getIndexMeta(novelId)?.provider ?? null;
}

// ===== 文件指纹（kv.file_index，增量索引）=====

export interface FileFingerprint {
  /** 文件内容的 sha1（hex）。 */
  hash: string;
  /** 该文件在 collection 内的全部块 id（path#i）。 */
  chunkIds: string[];
}

/** { collection -> { relPath -> FileFingerprint } } */
export type FileIndexMap = Record<string, Record<string, FileFingerprint>>;

export function getFileIndex(novelId: string): FileIndexMap {
  const raw = kvGet(getDb(novelId), "file_index");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as FileIndexMap) : {};
  } catch {
    return {};
  }
}

export function setFileIndex(novelId: string, index: FileIndexMap): void {
  kvSet(getDb(novelId), "file_index", JSON.stringify(index));
}

/** 读取某 collection 的文件指纹表（无则空）。 */
export function getFileIndexFor(
  novelId: string,
  collection: VectorCollection,
): Record<string, FileFingerprint> {
  return getFileIndex(novelId)[collection] ?? {};
}

/** 写回某 collection 的文件指纹表（保留其他 collection）。 */
export function setFileIndexFor(
  novelId: string,
  collection: VectorCollection,
  files: Record<string, FileFingerprint>,
): void {
  const all = getFileIndex(novelId);
  all[collection] = files;
  setFileIndex(novelId, all);
}

/** 清空某 collection 的指纹（force 重建前）。 */
export function clearFileIndexFor(novelId: string, collection: VectorCollection): void {
  setFileIndexFor(novelId, collection, {});
}
