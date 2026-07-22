import { Router } from "express";
import { novelService } from "../services/novel.service.js";
import { settingsService } from "../services/settings.service.js";
import { fileService } from "../services/file.service.js";
import {
  collectionStats,
  queryVectors,
  isCollection,
  getIndexProvider,
} from "../services/vector-store.js";
import { indexAll } from "../services/vector-index.service.js";
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
    res.status(400).json({ error: "collection 必须是 chapters/design/world/outlines/notes/sources" });
    return;
  }

  const provider = settingsService.getEmbeddingProvider();
  const indexedProvider = getIndexProvider(novelId);
  if (indexedProvider && indexedProvider !== provider) {
    res.status(400).json({ error: `索引(provider=${indexedProvider})与当前 embedding(${provider})不一致，请重新索引` });
    return;
  }

  const keys = settingsService.getApiKeys();
  try {
    const queryVec = await embedOne(q, provider, keys.glm);
    const hits = queryVectors(novelId, collection, queryVec, topK);
    res.json({ query: q, collection, hits });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "检索失败" });
  }
});

/**
 * POST /novels/:novelId/vector/index
 * 触发全量索引（chapters/design/world/outlines）。SSE 进度 + 结果。
 */
router.post("/novels/:novelId/vector/index", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const provider = settingsService.getEmbeddingProvider();
  const keys = settingsService.getApiKeys();
  try {
    send({ type: "start" });
    const result = await indexAll(novelId, provider, keys.glm, (msg) =>
      send({ type: "progress", message: msg }),
    );
    send({ type: "result", result });
    send({ type: "done" });
  } catch (err: any) {
    send({ type: "error", error: err?.message ?? "索引失败" });
  } finally {
    res.end();
  }
});

/**
 * GET /novels/:novelId/vector/status
 * 各 collection 已索引条目数。
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
    res.json({ novelId, collections: stats, indexProvider: getIndexProvider(novelId) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "状态查询失败" });
  }
});

export const vectorRoutes = router;
