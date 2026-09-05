/**
 * 向量索引：扫描 novel 文件，滑窗切块后嵌入，写入向量库。
 *
 * 增量机制（v2）：
 *   - 每文件指纹（sha1）存向量库 kv.file_index，内容未变的文件直接跳过嵌入；
 *   - 变化/新增文件：先嵌入成功，再删旧块、写新块（失败时库保持原样，无损）；
 *   - 移除文件：删除其全部旧块；
 *   - 索引配置指纹（provider/modelDir/dtype/切块参数）存 kv.index_meta，任一变化
 *     自动触发全量重建。
 *
 * 并发：per-novel 互斥锁，重复触发抛 IndexInProgressError（route 转 409）。
 *
 * 分块策略：字符滑窗（句子边界对齐、带 overlap），每块独立嵌入，
 * id = 相对路径#块号。切块参数来自设置（embeddingChunkChars/embeddingChunkOverlap）。
 */

import { createHash } from "crypto";
import { parseChapterNumber, parseActNumber } from "@fictia/shared";
import { embed, type EmbeddingProvider } from "../utils/embedding.js";
import { chunkText } from "../utils/chunker.js";
import { settingsService } from "./settings.service.js";
import {
  upsertVectors,
  deleteChunkIds,
  clearCollection,
  setIndexMeta,
  getIndexMeta,
  indexMetaMatches,
  getFileIndexFor,
  setFileIndexFor,
  clearFileIndexFor,
  type VectorItem,
  type VectorCollection,
  type VectorIndexMeta,
  type FileFingerprint,
} from "./vector-store.js";
import { fileService } from "./file.service.js";
import { listFiles, readFileSafe } from "../utils/file.js";
import * as path from "path";

// ===== 并发锁 =====

export class IndexInProgressError extends Error {}

const indexLocks = new Map<string, Promise<unknown>>();

/** 该小说是否有索引任务进行中。 */
export function isIndexRunning(novelId: string): boolean {
  return indexLocks.has(novelId);
}

async function withIndexLock<T>(novelId: string, fn: () => Promise<T>): Promise<T> {
  if (indexLocks.has(novelId)) {
    throw new IndexInProgressError("该小说正在建立索引，请等待当前任务完成");
  }
  const task = (async () => fn())().finally(() => indexLocks.delete(novelId));
  indexLocks.set(novelId, task);
  try {
    return await task;
  } finally {
    // task 内部抛错时 finally 已清理；这里不重复处理
  }
}

// ===== 文件收集 =====

/** 文件级条目：一个文件 = 一条（待切块）。id = 相对路径。 */
interface FileChunk {
  id: string;
  text: string;
}

/** 切块后的条目：一个文件 = 多条。id = 相对路径#块号。 */
interface ExpandedChunk {
  id: string;
  text: string;
  path: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
}

function sha1(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

/** 把一个文件切成多块，每块打上 path#index 的 id 与定位元数据。 */
function expandFile(fc: FileChunk, chunkChars: number, chunkOverlap: number): ExpandedChunk[] {
  return chunkText(fc.text, { maxChars: chunkChars, overlap: chunkOverlap }).map((c) => ({
    id: `${fc.id}#${c.index}`,
    text: c.text,
    path: fc.id,
    chunkIndex: c.index,
    charStart: c.charStart,
    charEnd: c.charEnd,
  }));
}

async function collectFiles(
  novelDir: string,
  dir: string,
  keep: (basename: string) => boolean,
): Promise<FileChunk[]> {
  let files: string[] = [];
  try {
    files = await listFiles(dir, { recursive: true, extensions: [".md"] });
  } catch {
    return [];
  }

  const chunks: FileChunk[] = [];
  for (const f of files) {
    if (!keep(path.basename(f))) continue;
    const text = await readFileSafe(f);
    if (!text || !text.trim()) continue;
    const rel = path.relative(novelDir, f).replace(/\\/g, "/");
    chunks.push({ id: rel, text });
  }
  return chunks;
}

/**
 * 章节文件收集：act 动态命名（ch01_act1-标题.md）+ 旧扁平命名（ch01.md）都识别，
 * 同章号多 act 版本只取 act 最大的（与 findChapterFile 的取舍一致）。
 */
async function collectChapterFiles(novelDir: string): Promise<FileChunk[]> {
  let files: string[] = [];
  try {
    files = await listFiles(path.join(novelDir, "chapters"), {
      recursive: true,
      extensions: [".md"],
    });
  } catch {
    return [];
  }

  // chapterNumber -> 文件（同号取 act 最大者，无 act 视为 0）
  const byChapter = new Map<number, { file: string; act: number }>();
  for (const f of files) {
    const num = parseChapterNumber(path.basename(f));
    if (num === null) continue;
    const act = parseActNumber(path.basename(f)) ?? 0;
    const cur = byChapter.get(num);
    if (!cur || act > cur.act) byChapter.set(num, { file: f, act });
  }

  const chunks: FileChunk[] = [];
  for (const num of [...byChapter.keys()].sort((a, b) => a - b)) {
    const { file } = byChapter.get(num)!;
    const text = await readFileSafe(file);
    if (!text || !text.trim()) continue;
    const rel = path.relative(novelDir, file).replace(/\\/g, "/");
    chunks.push({ id: rel, text });
  }
  return chunks;
}

// ===== 增量索引核心 =====

interface EmbedBlocksResult {
  items: VectorItem[];
  chunkIds: string[];
}

/** 切块 + 嵌入（可能耗时/失败——失败抛错，调用方保持库原样）。 */
async function embedBlocks(
  novelId: string,
  fc: FileChunk,
  chunkChars: number,
  chunkOverlap: number,
  provider: EmbeddingProvider,
  glmKey: string,
  modelDir?: string,
): Promise<EmbedBlocksResult> {
  const expanded = expandFile(fc, chunkChars, chunkOverlap);
  if (expanded.length === 0) return { items: [], chunkIds: [] };
  const vectors = await embed(
    expanded.map((c) => c.text),
    provider,
    glmKey,
    modelDir,
  );
  return {
    items: expanded.map((c, i) => ({
      id: c.id,
      text: c.text,
      metadata: {
        path: c.path,
        chunkIndex: c.chunkIndex,
        charStart: c.charStart,
        charEnd: c.charEnd,
      },
      vector: vectors[i],
    })),
    chunkIds: expanded.map((c) => c.id),
  };
}

/**
 * 对单个 collection 做增量同步：unchanged 跳过、changed 删旧插新、removed 清块。
 * 返回 { embedded, skipped }（块数/文件数）。
 */
async function syncCollection(
  novelId: string,
  collection: VectorCollection,
  files: FileChunk[],
  meta: { chunkChars: number; chunkOverlap: number; provider: EmbeddingProvider; glmKey: string; modelDir?: string },
): Promise<{ embedded: number; skipped: number }> {
  const oldIndex = getFileIndexFor(novelId, collection);
  const newIndex: Record<string, FileFingerprint> = {};
  let embedded = 0;
  let skipped = 0;

  for (const fc of files) {
    const hash = sha1(fc.text);
    const old = oldIndex[fc.id];
    if (old && old.hash === hash) {
      newIndex[fc.id] = old; // 未变化：块与指纹都保留
      skipped++;
      continue;
    }
    // 变化/新增：先嵌入（失败抛错，库与指纹保持原样），成功后删旧插新
    const { items, chunkIds } = await embedBlocks(
      novelId, fc, meta.chunkChars, meta.chunkOverlap, meta.provider, meta.glmKey, meta.modelDir,
    );
    if (old) deleteChunkIds(novelId, collection, old.chunkIds);
    if (items.length > 0) upsertVectors(novelId, collection, items);
    newIndex[fc.id] = { hash, chunkIds };
    embedded += items.length;
  }

  // 已删除的文件：清块 + 清指纹
  const currentIds = new Set(files.map((f) => f.id));
  for (const [p, old] of Object.entries(oldIndex)) {
    if (!currentIds.has(p)) {
      deleteChunkIds(novelId, collection, old.chunkIds);
    }
  }

  setFileIndexFor(novelId, collection, newIndex);
  return { embedded, skipped };
}

/** 全量重建单个 collection：先嵌入全部块，成功后才 clear + upsert（失败库保持原样）。 */
async function rebuildCollection(
  novelId: string,
  collection: VectorCollection,
  files: FileChunk[],
  meta: { chunkChars: number; chunkOverlap: number; provider: EmbeddingProvider; glmKey: string; modelDir?: string },
): Promise<number> {
  if (files.length === 0) {
    clearCollection(novelId, collection);
    clearFileIndexFor(novelId, collection);
    return 0;
  }
  const items: VectorItem[] = [];
  const chunkIds: string[] = [];
  for (const fc of files) {
    const r = await embedBlocks(
      novelId, fc, meta.chunkChars, meta.chunkOverlap, meta.provider, meta.glmKey, meta.modelDir,
    );
    items.push(...r.items);
    chunkIds.push(...r.chunkIds);
  }
  // 全部嵌入成功后才替换：避免中途失败把可用索引清空
  clearCollection(novelId, collection);
  upsertVectors(novelId, collection, items);
  const index: Record<string, FileFingerprint> = {};
  for (const fc of files) {
    index[fc.id] = {
      hash: sha1(fc.text),
      chunkIds: chunkIds.filter((id) => id.startsWith(`${fc.id}#`)),
    };
  }
  setFileIndexFor(novelId, collection, index);
  return items.length;
}

// ===== 对外 API =====

export interface IndexAllResult {
  indexed: Record<string, number>;
  skipped: Record<string, number>;
  /** 是否走了全量重建（配置指纹变化或调用方强制）。 */
  fullRebuild: boolean;
}

export interface IndexOptions {
  /** 跳过指纹对比强制全量重建（默认 false；配置指纹变化时自动全量）。 */
  force?: boolean;
  onProgress?: (msg: string) => void;
}

/**
 * 全量/增量索引 chapters / design / world / outlines 四个 collection。
 * provider / 模型配置 / 切块参数全部取自 settings。
 */
export async function indexAll(
  novelId: string,
  options: IndexOptions = {},
): Promise<IndexAllResult> {
  const { onProgress, force = false } = options;
  return withIndexLock(novelId, async () => {
    const novelDir = fileService.getNovelDir(novelId);
    const provider = settingsService.getEmbeddingProvider();
    const glmKey = settingsService.getEmbeddingGlmKey();
    const modelDir = settingsService.getEmbeddingModelDir() || undefined;
    const chunkChars = settingsService.getEmbeddingChunkChars();
    const chunkOverlap = settingsService.getEmbeddingChunkOverlap();
    const dtype = (process.env.EMBEDDING_DTYPE as string | undefined) ?? "fp32";

    const expectedMeta: VectorIndexMeta = {
      version: 2,
      provider,
      modelDir,
      dtype,
      chunkChars,
      chunkOverlap,
    };
    // 配置指纹变化（或首次 v2 索引）→ 自动全量重建
    const fullRebuild = force || !indexMetaMatches(getIndexMeta(novelId), expectedMeta);
    const embedMeta = { chunkChars, chunkOverlap, provider, glmKey, modelDir };

    if (provider === "bge-m3") {
      onProgress?.(
        modelDir
          ? `从本地目录加载 bge-m3 模型：${modelDir}`
          : "加载本地 bge-m3 模型（首次需下载约 2.2GB，请耐心等待）",
      );
    }
    onProgress?.(fullRebuild ? "全量重建（配置指纹变化或手动强制）" : "增量索引（跳过未变化文件）");

    const indexed: Record<string, number> = {};
    const skipped: Record<string, number> = {};

    // chapters：act 动态命名 + 同号取最大 act
    onProgress?.("索引 chapters");
    const chapterFiles = await collectChapterFiles(novelDir);
    if (fullRebuild) {
      indexed.chapters = await rebuildCollection(novelId, "chapters", chapterFiles, embedMeta);
      skipped.chapters = 0;
    } else {
      const r = await syncCollection(novelId, "chapters", chapterFiles, embedMeta);
      indexed.chapters = r.embedded;
      skipped.chapters = r.skipped;
    }
    onProgress?.(`  chapters：${chapterFiles.length} 文件 → ${indexed.chapters} 块（跳过 ${skipped.chapters}）`);

    // design：5 个固定设计文档 + characters/
    onProgress?.("索引 design");
    const designChunks: FileChunk[] = [];
    for (const name of [
      "design/genre-analysis.md",
      "design/blueprint.md",
      "design/style-guide.md",
      "design/art-design.md",
      "design/narrative-weave.md",
    ]) {
      const text = await readFileSafe(path.join(novelDir, name));
      if (text && text.trim()) designChunks.push({ id: name, text });
    }
    designChunks.push(...(await collectFiles(novelDir, path.join(novelDir, "characters"), () => true)));
    if (fullRebuild) {
      indexed.design = await rebuildCollection(novelId, "design", designChunks, embedMeta);
      skipped.design = 0;
    } else {
      const r = await syncCollection(novelId, "design", designChunks, embedMeta);
      indexed.design = r.embedded;
      skipped.design = r.skipped;
    }
    onProgress?.(`  design：${designChunks.length} 文件 → ${indexed.design} 块（跳过 ${skipped.design}）`);

    // world
    onProgress?.("索引 world");
    const worldFiles = await collectFiles(novelDir, path.join(novelDir, "world"), () => true);
    if (fullRebuild) {
      indexed.world = await rebuildCollection(novelId, "world", worldFiles, embedMeta);
      skipped.world = 0;
    } else {
      const r = await syncCollection(novelId, "world", worldFiles, embedMeta);
      indexed.world = r.embedded;
      skipped.world = r.skipped;
    }
    onProgress?.(`  world：${worldFiles.length} 文件 → ${indexed.world} 块（跳过 ${skipped.world}）`);

    // outlines
    onProgress?.("索引 outlines");
    const outlineFiles = await collectFiles(novelDir, path.join(novelDir, "outline"), () => true);
    if (fullRebuild) {
      indexed.outlines = await rebuildCollection(novelId, "outlines", outlineFiles, embedMeta);
      skipped.outlines = 0;
    } else {
      const r = await syncCollection(novelId, "outlines", outlineFiles, embedMeta);
      indexed.outlines = r.embedded;
      skipped.outlines = r.skipped;
    }
    onProgress?.(`  outlines：${outlineFiles.length} 文件 → ${indexed.outlines} 块（跳过 ${skipped.outlines}）`);

    setIndexMeta(novelId, expectedMeta);
    return { indexed, skipped, fullRebuild };
  });
}

/** 相对路径 → 所属 collection（单文件索引用）。不属于任何集合返回 null。 */
function resolveCollection(rel: string): VectorCollection | null {
  const norm = rel.replace(/\\/g, "/");
  if (norm.startsWith("chapters/")) return "chapters";
  if (norm.startsWith("design/") || norm.startsWith("characters/")) return "design";
  if (norm.startsWith("world/")) return "world";
  if (norm.startsWith("outline/")) return "outlines";
  return null;
}

/**
 * 单文件增量索引：写完一章 / 改完设定后调用，保持 semantic_search 覆盖最新内容。
 * 内容未变化则跳过；索引配置与上次不一致时抛错（需全量重建）。
 * 返回写入块数；跳过返回 0。
 */
export async function indexSingleFile(
  novelId: string,
  absPath: string,
): Promise<{ indexed: number; skipped: boolean }> {
  return withIndexLock(novelId, async () => {
    const novelDir = fileService.getNovelDir(novelId);
    const rel = path.relative(novelDir, absPath).replace(/\\/g, "/");
    const collection = resolveCollection(rel);
    if (!collection) {
      throw new Error(`文件不在可索引目录内：${rel}（仅支持 chapters/design/characters/world/outline）`);
    }

    const provider = settingsService.getEmbeddingProvider();
    const glmKey = settingsService.getEmbeddingGlmKey();
    const modelDir = settingsService.getEmbeddingModelDir() || undefined;
    const chunkChars = settingsService.getEmbeddingChunkChars();
    const chunkOverlap = settingsService.getEmbeddingChunkOverlap();
    const dtype = (process.env.EMBEDDING_DTYPE as string | undefined) ?? "fp32";
    const expectedMeta: VectorIndexMeta = { version: 2, provider, modelDir, dtype, chunkChars, chunkOverlap };
    if (!indexMetaMatches(getIndexMeta(novelId), expectedMeta)) {
      throw new Error("索引配置与当前设置不一致（provider/模型/切块参数已变化），请先在前端全量重建索引");
    }

    const text = await readFileSafe(absPath);
    if (!text || !text.trim()) return { indexed: 0, skipped: true };
    const fc: FileChunk = { id: rel, text };

    const hash = sha1(text);
    const old = getFileIndexFor(novelId, collection)[rel];
    if (old && old.hash === hash) return { indexed: 0, skipped: true };

    const { items, chunkIds } = await embedBlocks(
      novelId, fc, chunkChars, chunkOverlap, provider, glmKey, modelDir,
    );
    if (old) deleteChunkIds(novelId, collection, old.chunkIds);
    if (items.length > 0) upsertVectors(novelId, collection, items);
    const idx = getFileIndexFor(novelId, collection);
    idx[rel] = { hash, chunkIds };
    setFileIndexFor(novelId, collection, idx);
    return { indexed: items.length, skipped: false };
  });
}

/**
 * 写完章节后自动索引该章（writing-loop finalizePass 调用）。
 * 失败仅告警不阻塞写作流程——向量索引可随后手动重建。
 */
export async function indexChapterAfterWrite(
  novelId: string,
  chapterNumber: number,
): Promise<void> {
  try {
    const { findChapterFile } = await import("../utils/chapter-files.js");
    const novelDir = fileService.getNovelDir(novelId);
    const file = await findChapterFile(novelDir, chapterNumber);
    if (!file) return;
    const r = await indexSingleFile(novelId, file);
    if (!r.skipped) {
      console.log(`[vector] 第 ${chapterNumber} 章已自动索引（${r.indexed} 块）`);
    }
  } catch (e) {
    console.warn(`[vector] 第 ${chapterNumber} 章自动索引失败（不阻塞）:`, e);
  }
}
