/**
 * 向量索引：扫描 novel 文件，滑窗切块后嵌入，写入向量库。
 *
 * 分块策略：每个文件按字符滑窗切成多块（句子边界对齐、带 overlap），每块独立
 * 嵌入为一条向量（id = 相对路径#块号）。召回粒度从「整章」细化到「段落级」，
 * 同时避免单条过长撑爆 attention。切块参数见 utils/chunker.ts。
 * chapters / design / world / outlines 四个 collection。
 * notes / sources 暂不索引（无 notes 子系统；source 工作流在 P3）。
 */

import { embed, type EmbeddingProvider } from "../utils/embedding.js";
import { chunkText } from "../utils/chunker.js";
import {
  upsertVectors,
  clearCollection,
  setIndexProvider,
  type VectorItem,
  type VectorCollection,
} from "./vector-store.js";
import { fileService } from "./file.service.js";
import { listFiles, readFileSafe } from "../utils/file.js";
import * as path from "path";

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

/** 把一个文件切成多块，每块打上 path#index 的 id 与定位元数据。 */
function expandFile(fc: FileChunk): ExpandedChunk[] {
  return chunkText(fc.text).map((c) => ({
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
  pattern: RegExp,
): Promise<FileChunk[]> {
  let files: string[] = [];
  try {
    files = await listFiles(dir, { recursive: true, extensions: [".md"] });
  } catch {
    return [];
  }

  const chunks: FileChunk[] = [];
  for (const f of files) {
    if (!pattern.test(path.basename(f))) continue;
    const text = await readFileSafe(f);
    if (!text || !text.trim()) continue;
    const rel = path.relative(novelDir, f).replace(/\\/g, "/");
    chunks.push({ id: rel, text });
  }
  return chunks;
}

async function indexChunks(
  novelId: string,
  collection: VectorCollection,
  files: FileChunk[],
  provider: EmbeddingProvider,
  apiKey: string,
  modelDir?: string,
): Promise<number> {
  if (files.length === 0) return 0;
  clearCollection(novelId, collection);
  const expanded = files.flatMap(expandFile);
  if (expanded.length === 0) return 0;
  const vectors = await embed(
    expanded.map((c) => c.text),
    provider,
    apiKey,
    modelDir,
  );
  const items: VectorItem[] = expanded.map((c, i) => ({
    id: c.id,
    text: c.text,
    metadata: {
      path: c.path,
      chunkIndex: c.chunkIndex,
      charStart: c.charStart,
      charEnd: c.charEnd,
    },
    vector: vectors[i],
  }));
  upsertVectors(novelId, collection, items);
  return expanded.length;
}

export async function indexAll(
  novelId: string,
  provider: EmbeddingProvider,
  apiKey: string,
  modelDir?: string,
  onProgress?: (msg: string) => void,
): Promise<{ indexed: Record<string, number> }> {
  const novelDir = fileService.getNovelDir(novelId);
  const indexed: Record<string, number> = {};

  if (provider === "bge-m3") {
    onProgress?.(
      modelDir
        ? `从本地目录加载 bge-m3 模型：${modelDir}`
        : "加载本地 bge-m3 模型（首次需下载约 2.2GB，请耐心等待）",
    );
  }

  onProgress?.("索引 chapters");
  const chapterFiles = await collectFiles(
    novelDir,
    path.join(novelDir, "chapters"),
    /^ch\d+\.md$/,
  );
  indexed.chapters = await indexChunks(novelId, "chapters", chapterFiles, provider, apiKey, modelDir);
  onProgress?.(`  chapters：${chapterFiles.length} 文件 → ${indexed.chapters} 块`);

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
  designChunks.push(
    ...(await collectFiles(novelDir, path.join(novelDir, "characters"), /\.md$/)),
  );
  indexed.design = await indexChunks(novelId, "design", designChunks, provider, apiKey, modelDir);
  onProgress?.(`  design：${designChunks.length} 文件 → ${indexed.design} 块`);

  onProgress?.("索引 world");
  const worldFiles = await collectFiles(novelDir, path.join(novelDir, "world"), /\.md$/);
  indexed.world = await indexChunks(novelId, "world", worldFiles, provider, apiKey, modelDir);
  onProgress?.(`  world：${worldFiles.length} 文件 → ${indexed.world} 块`);

  onProgress?.("索引 outlines");
  const outlineFiles = await collectFiles(novelDir, path.join(novelDir, "outline"), /\.md$/);
  indexed.outlines = await indexChunks(novelId, "outlines", outlineFiles, provider, apiKey, modelDir);
  onProgress?.(`  outlines：${outlineFiles.length} 文件 → ${indexed.outlines} 块`);

  setIndexProvider(novelId, provider);
  return { indexed };
}
