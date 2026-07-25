/**
 * 向量索引：扫描 novel 文件，分块嵌入，写入向量库。
 *
 * 分块策略（P2-1 最小版）：一个文件 = 一个 chunk（id = 相对路径）。
 * chapters / design / world / outlines 四个 collection。
 * notes / sources 暂不索引（无 notes 子系统；source 工作流在 P3）。
 */

import { embed, type EmbeddingProvider } from "../utils/embedding.js";
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

interface FileChunk {
  id: string;
  text: string;
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
  chunks: FileChunk[],
  provider: EmbeddingProvider,
  apiKey: string,
): Promise<number> {
  if (chunks.length === 0) return 0;
  clearCollection(novelId, collection);
  const vectors = await embed(
    chunks.map((c) => c.text.slice(0, 8000)),
    provider,
    apiKey,
  );
  const items: VectorItem[] = chunks.map((c, i) => ({
    id: c.id,
    text: c.text,
    metadata: { path: c.id },
    vector: vectors[i],
  }));
  upsertVectors(novelId, collection, items);
  return chunks.length;
}

export async function indexAll(
  novelId: string,
  provider: EmbeddingProvider,
  apiKey: string,
  onProgress?: (msg: string) => void,
): Promise<{ indexed: Record<string, number> }> {
  const novelDir = fileService.getNovelDir(novelId);
  const indexed: Record<string, number> = {};

  if (provider === "bge-m3") {
    onProgress?.("加载本地 bge-m3 模型（首次需下载约 2.2GB，请耐心等待）");
  }

  onProgress?.("索引 chapters");
  indexed.chapters = await indexChunks(
    novelId,
    "chapters",
    await collectFiles(novelDir, path.join(novelDir, "chapters"), /^ch\d+\.md$/),
    provider,
    apiKey,
  );

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
  indexed.design = await indexChunks(novelId, "design", designChunks, provider, apiKey);

  onProgress?.("索引 world");
  indexed.world = await indexChunks(
    novelId,
    "world",
    await collectFiles(novelDir, path.join(novelDir, "world"), /\.md$/),
    provider,
    apiKey,
  );

  onProgress?.("索引 outlines");
  indexed.outlines = await indexChunks(
    novelId,
    "outlines",
    await collectFiles(novelDir, path.join(novelDir, "outline"), /\.md$/),
    provider,
    apiKey,
  );

  setIndexProvider(novelId, provider);
  return { indexed };
}
