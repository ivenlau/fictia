import { Router } from "express";
import { novelService } from "../services/novel.service.js";
import { fileService } from "../services/file.service.js";
import {
  ENTITY_COLLECTIONS,
  listEntities,
  getEntity,
  searchEntities,
  entityStats,
  upsertEntities,
} from "../services/entity-store.js";
import {
  transitionForeshadow,
  type ForeshadowState,
  type ForeshadowHistoryEntry,
} from "@fictia/shared";
import {
  indexAllEntities,
  assembleWritingSpace,
  assembleDynamicContext,
  foreshadowStats,
} from "../services/entity.service.js";
import { readAllSummaries } from "../services/chapter-summary-store.js";

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

/**
 * GET /novels/:novelId/foreshadowing/stats
 * 伏笔闭合统计：各态计数 + closureRate + open 未闭合列表。
 */
router.get("/novels/:novelId/foreshadowing/stats", (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  res.json(foreshadowStats(novelId));
});

/**
 * POST /novels/:novelId/foreshadowing/:foreshadowId/state
 * 手动推进伏笔状态机。body: { op, chapter, note? }
 * op: 埋设/推进/强化/回收/悬置。走状态机校验，禁止回退。
 */
router.post("/novels/:novelId/foreshadowing/:foreshadowId/state", (req, res) => {
  const { novelId, foreshadowId } = req.params;
  const { op, chapter, note } = req.body as { op: string; chapter: number; note?: string };
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const e = getEntity(novelId, "foreshadowing", foreshadowId);
  if (!e) {
    res.status(404).json({ error: "伏笔不存在" });
    return;
  }
  const cur = (e.state as ForeshadowState) || "planted";
  const next = transitionForeshadow(cur, op);
  if (!next) {
    res.status(400).json({ error: `状态机拒绝: 当前 ${cur},操作 ${op}` });
    return;
  }
  const chTag = `ch${String(chapter).padStart(2, "0")}`;
  const history = Array.isArray(e.fields.history)
    ? [...(e.fields.history as ForeshadowHistoryEntry[])]
    : [];
  const entry: ForeshadowHistoryEntry = { ch: chTag, op, state: next };
  if (note) entry.note = note;
  history.push(entry);
  const fields: Record<string, unknown> = { ...e.fields, history };
  if (next === "planted" && !fields.plantedCh) fields.plantedCh = chTag;
  if (next === "strengthened") {
    const arr = Array.isArray(fields.strengthenChs) ? [...(fields.strengthenChs as string[])] : [];
    if (!arr.includes(chTag)) arr.push(chTag);
    fields.strengthenChs = arr;
  }
  if (next === "resolved") fields.resolvedCh = chTag;
  upsertEntities(novelId, [{ ...e, state: next, fields }]);
  res.json({ ...e, state: next, fields, from: cur, to: next });
});

/**
 * GET /novels/:novelId/chapter-summaries
 * 返回摘要链全量映射 { "1": "...", "2": "..." }（key = 章节号）。
 */
router.get("/novels/:novelId/chapter-summaries", (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  void fileService.getNovelDir(novelId);
  res.json({ novelId, summaries: readAllSummaries(novelId) });
});

/**
 * GET /novels/:novelId/context-preview?chapter=N
 * 把 assembleDynamicContext（前文摘要链 + 角色状态 + 本章伏笔指令）拆成 section，
 * 供前端注入预览（与 materials/injection-preview 同形状）。
 */
router.get("/novels/:novelId/context-preview", (req, res) => {
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
  void fileService.getNovelDir(novelId);
  const content = assembleDynamicContext(novelId, chapter);
  res.json({ novelId, chapter, sections: parseContextSections(content), raw: content });
});

/** 把组装好的动态上下文按 `## ` 标题拆成 section（镜像注入预览形状）。 */
function parseContextSections(content: string) {
  if (!content.trim()) return [];
  const blocks = content
    .split(/\n(?=## )/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.map((b, i) => {
    const m = b.match(/^##\s+(.+?)(\n[\s\S]*)?$/);
    const title = m ? m[1].trim() : `段${i + 1}`;
    const body = m && m[2] ? m[2].trim() : m ? "" : b;
    return {
      key: title,
      title,
      present: body.length > 0,
      charCount: body.length,
      detail: body.slice(0, 500),
    };
  });
}

export const entityRoutes = router;
