import { Router } from "express";
import { novelService } from "../services/novel.service.js";
import { fileService } from "../services/file.service.js";
import {
  ENTITY_COLLECTIONS,
  listEntities,
  getEntity,
  searchEntities,
  entityStats,
} from "../services/entity-store.js";
import { indexAllEntities, assembleWritingSpace } from "../services/entity.service.js";

const router = Router();

const ENTITY_SET = new Set<string>(ENTITY_COLLECTIONS);
function isEntityCollection(name: string): boolean {
  return ENTITY_SET.has(name);
}

/**
 * POST /novels/:novelId/entity/index
 * 全量提取 4 类实体（characters/foreshadowing/storylines/timeline）。
 */
router.post("/novels/:novelId/entity/index", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  try {
    const result = await indexAllEntities(novelId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "实体索引失败" });
  }
});

/**
 * GET /novels/:novelId/entity/list?collection=...
 */
router.get("/novels/:novelId/entity/list", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const collection = req.query.collection as string | undefined;
  if (collection && !isEntityCollection(collection)) {
    res.status(400).json({ error: `未知 collection: ${collection}` });
    return;
  }
  void fileService.getNovelDir(novelId);
  const entities = listEntities(novelId, collection);
  res.json({ novelId, collection: collection ?? "all", entities });
});

/**
 * GET /novels/:novelId/entity/:collection/:id
 */
router.get("/novels/:novelId/entity/:collection/:id", async (req, res) => {
  const { novelId, collection, id } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  if (!isEntityCollection(collection)) {
    res.status(400).json({ error: `未知 collection: ${collection}` });
    return;
  }
  void fileService.getNovelDir(novelId);
  const entity = getEntity(novelId, collection, id);
  if (!entity) {
    res.status(404).json({ error: "实体未找到" });
    return;
  }
  res.json(entity);
});

/**
 * GET /novels/:novelId/entity/search?q=...&collection=...
 */
router.get("/novels/:novelId/entity/search", async (req, res) => {
  const { novelId } = req.params;
  const q = (req.query.q as string) ?? "";
  const collection = req.query.collection as string | undefined;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  if (!q.trim()) {
    res.status(400).json({ error: "q 必填" });
    return;
  }
  if (collection && !isEntityCollection(collection)) {
    res.status(400).json({ error: `未知 collection: ${collection}` });
    return;
  }
  void fileService.getNovelDir(novelId);
  const entities = searchEntities(novelId, q, collection);
  res.json({ query: q, collection: collection ?? "all", entities });
});

/**
 * GET /novels/:novelId/entity/status
 */
router.get("/novels/:novelId/entity/status", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  const stats = entityStats(novelId);
  res.json({ novelId, collections: stats });
});

/**
 * GET /novels/:novelId/writing-space?chapter=N
 * 组装动态写作空间（静态设计 + 必读动态实体 + 按需检索提示）。
 */
router.get("/novels/:novelId/writing-space", async (req, res) => {
  const { novelId } = req.params;
  const chapter = Number(req.query.chapter);
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  if (!Number.isInteger(chapter) || chapter < 1) {
    res.status(400).json({ error: "chapter 必须是正整数" });
    return;
  }
  try {
    const content = await assembleWritingSpace(novelId, chapter);
    res.json({ novelId, chapter, content });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "写作空间组装失败" });
  }
});

export const entityRoutes = router;
