import { Router } from "express";
import { novelService } from "../services/novel.service.js";
import { settingsService } from "../services/settings.service.js";
import { fileService } from "../services/file.service.js";
import {
  collectionStats,
  queryVectors,
  isCollection,
  getIndexMeta,
  indexMetaMatches,
  type VectorIndexMeta,
} from "../services/vector-store.js";
import {
  indexAll,
  isIndexRunning,
  IndexInProgressError,
} from "../services/vector-index.service.js";
import { embedOne } from "../utils/embedding.js";

const router = Router();

/**
 * GET /novels/:novelId/search?q=...&collection=...&topK=...
 * 语义检索。collection 不指定则默认 chapters。
 */
router.get("/novels/:novelId/search", async (req, res) => {
  const { novelId } = req.params;
  const q = (req.query.q as string) ?? "";
  const collection = (req.query.collection as string) ?? "chapters";
  const topK = Number(req.query.topK ?? 5);

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  if (!q.trim()) {
    res.status(400).json({ error: "q 必填" });
    return;
  }
  if (!isCollection(collection)) {
    res.status(400).json({ error: "collection 必须是 chapters/design/world/outlines" });
    return;
  }

  const provider = settingsService.getEmbeddingProvider();
  const modelDir = settingsService.getEmbeddingModelDir() || undefined;
  const dtype = (process.env.EMBEDDING_DTYPE as string | undefined) ?? "fp32";
  const expectedMeta: VectorIndexMeta = {
    version: 2,
    provider,
    modelDir,
    dtype,
    chunkChars: settingsService.getEmbeddingChunkChars(),
    chunkOverlap: settingsService.getEmbeddingChunkOverlap(),
  };
  if (!indexMetaMatches(getIndexMeta(novelId), expectedMeta)) {
    res.status(400).json({ error: "索引配置与当前 embedding 设置不一致，请重新建立索引" });
    return;
  }

  const glmKey = settingsService.getEmbeddingGlmKey();
  try {
    const queryVec = await embedOne(q, provider, glmKey, modelDir);
    const hits = queryVectors(novelId, collection, queryVec, topK);
    res.json({ query: q, collection, hits });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "检索失败" });
  }
});

/**
 * POST /novels/:novelId/vector/index
 * 触发索引（默认增量：内容未变的文件跳过嵌入；body.force=true 或配置变化时全量重建）。
 * SSE 进度 + 结果。并发触发返回 409。
 */
router.post("/novels/:novelId/vector/index", async (req, res) => {
  const { novelId } = req.params;
  const { force } = req.body ?? {};
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  if (isIndexRunning(novelId)) {
    res.status(409).json({ error: "该小说正在建立索引，请等待当前任务完成" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    send({ type: "start", fullRebuild: !!force });
    const result = await indexAll(novelId, { force: !!force, onProgress: (msg) =>
      send({ type: "progress", message: msg }),
    });
    send({ type: "result", result });
    send({ type: "done" });
  } catch (err: any) {
    if (err instanceof IndexInProgressError) {
      send({ type: "error", error: err.message, code: "index_in_progress" });
    } else {
      send({ type: "error", error: err?.message ?? "索引失败" });
    }
  } finally {
    res.end();
  }
});

/**
 * GET /novels/:novelId/vector/status
 * 各 collection 已索引条目数 + 索引配置指纹。
 */
router.get("/novels/:novelId/vector/status", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  try {
    const stats = collectionStats(novelId);
    res.json({ novelId, collections: stats, indexMeta: getIndexMeta(novelId) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "状态查询失败" });
  }
});

export const vectorRoutes = router;
