import { Router } from "express";
import { novelService } from "../services/novel.service.js";
import { fileService } from "../services/file.service.js";
import {
  getNeighbors,
  listRelations,
  relationStats,
} from "../services/entity-store.js";
import { buildGraph } from "../services/entity.service.js";

const router = Router();

/**
 * POST /novels/:novelId/graph/build
 * 从已有实体（角色 relationships、支线 characters）构建知识图谱三元组。
 */
router.post("/novels/:novelId/graph/build", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  try {
    const result = await buildGraph(novelId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "图谱构建失败" });
  }
});

/**
 * GET /novels/:novelId/graph/neighbors/:entityId?relType=...
 */
router.get("/novels/:novelId/graph/neighbors/:entityId", async (req, res) => {
  const { novelId, entityId } = req.params;
  const relType = req.query.relType as string | undefined;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  const neighbors = getNeighbors(novelId, entityId, relType);
  res.json({ entity_id: entityId, neighbors });
});

/**
 * GET /novels/:novelId/graph/list?entityId=...&relType=...
 */
router.get("/novels/:novelId/graph/list", async (req, res) => {
  const { novelId } = req.params;
  const entityId = req.query.entityId as string | undefined;
  const relType = req.query.relType as string | undefined;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  const relations = listRelations(novelId, entityId, relType);
  res.json({ novelId, relations });
});

/**
 * GET /novels/:novelId/graph/status
 */
router.get("/novels/:novelId/graph/status", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  const stats = relationStats(novelId);
  res.json({ novelId, ...stats });
});

/**
 * GET /novels/:novelId/graph/export
 * 导出 nodes + edges（可视化用）。
 */
router.get("/novels/:novelId/graph/export", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  const relations = listRelations(novelId);
  const nodeIds = new Set<string>();
  const edges = relations.map((r) => {
    nodeIds.add(r.source_id);
    nodeIds.add(r.target_id);
    return {
      source: r.source_id,
      target: r.target_id,
      rel_type: r.rel_type,
      text: r.text,
      chapter: r.chapter,
    };
  });
  const nodes = [...nodeIds].map((id) => ({ id, name: id }));
  res.json({ nodes, edges });
});

export const graphRoutes = router;
