import { Router } from "express";
import { novelService } from "../services/novel.service.js";
import { materialService, type CatalogType } from "../services/material.service.js";
import type { UserMaterialType } from "../utils/user-materials.js";

const router = Router();

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
function isUserType(t: string): t is UserMaterialType {
  return t === "genre-card" || t === "craft" || t === "prompt-snippet";
}

/**
 * GET /materials/catalog?type=genre-card|craft
 * 内置素材目录（只读）：8 张体裁卡 或 20 篇写作技法。
 */
router.get("/materials/catalog", async (req, res) => {
  const type = ((req.query.type as string) ?? "genre-card") as CatalogType;
  if (type !== "genre-card" && type !== "craft") {
    res.status(400).json({ error: "type 必须是 genre-card 或 craft" });
    return;
  }
  const entries = await materialService.getCatalog(type);
  res.json({ type, entries });
});

/**
 * GET /materials/agents
 * 内置 agent 清单（注入预览的选择器用）。
 */
router.get("/materials/agents", async (_req, res) => {
  const agents = await materialService.listAgentNames();
  res.json({ agents });
});

/**
 * GET /novels/:novelId/materials/injection-preview?agent=chapter-writer
 * 注入预览：当前启用素材如何拼进该 agent 的 system prompt。
 */
router.get("/novels/:novelId/materials/injection-preview", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const agent = (req.query.agent as string) ?? "chapter-writer";
  const preview = await materialService.getInjectionPreview(novelId, agent);
  res.json(preview);
});

// ==================== 用户素材 CRUD（块 2） ====================

/** GET /novels/:novelId/materials?type=genre-card|craft — 列出本作自定义素材。 */
router.get("/novels/:novelId/materials", async (req, res) => {
  const { novelId } = req.params;
  if (!novelService.getById(novelId)) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const type = (req.query.type as string) ?? "craft";
  if (!isUserType(type)) {
    res.status(400).json({ error: "type 必须是 genre-card 或 craft" });
    return;
  }
  const entries = await materialService.listUserMaterials(novelId, type);
  res.json({ type, entries });
});

/** POST /novels/:novelId/materials — 新建/更新自定义素材。body: { type, key, name?, description?, content?, enabled?, agents? } */
router.post("/novels/:novelId/materials", async (req, res) => {
  const { novelId } = req.params;
  if (!novelService.getById(novelId)) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const { type, key, ...data } = req.body ?? {};
  if (!isUserType(type) || typeof key !== "string" || !KEY_RE.test(key)) {
    res.status(400).json({ error: "type 必须是 genre-card/craft；key 须匹配 /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/" });
    return;
  }
  const entry = await materialService.upsertUserMaterial(novelId, type, key, data);
  res.status(201).json(entry);
});

/** POST /novels/:novelId/materials/clone — 克隆内置体裁卡为本作自定义卡。body: { type, key } */
router.post("/novels/:novelId/materials/clone", async (req, res) => {
  const { novelId } = req.params;
  if (!novelService.getById(novelId)) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const { type, key } = req.body ?? {};
  if (!isUserType(type) || typeof key !== "string" || !KEY_RE.test(key)) {
    res.status(400).json({ error: "type/key 非法" });
    return;
  }
  try {
    const entry = await materialService.cloneBuiltin(novelId, type, key);
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(404).json({ error: err?.message ?? "克隆失败" });
  }
});

/** GET /novels/:novelId/materials/preferences — C1 创作偏好。 */
router.get("/novels/:novelId/materials/preferences", async (req, res) => {
  const { novelId } = req.params;
  if (!novelService.getById(novelId)) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const prefs = await materialService.getPreferences(novelId);
  res.json(prefs ?? { enabled: false, content: "" });
});

/** PATCH /novels/:novelId/materials/preferences — 更新 C1 创作偏好。body: { enabled, content } */
router.patch("/novels/:novelId/materials/preferences", async (req, res) => {
  const { novelId } = req.params;
  if (!novelService.getById(novelId)) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const { enabled, content } = req.body ?? {};
  if (typeof enabled !== "boolean" || typeof content !== "string") {
    res.status(400).json({ error: "enabled(boolean) 与 content(string) 必填" });
    return;
  }
  const prefs = await materialService.setPreferences(novelId, enabled, content);
  res.json(prefs);
});

/** GET /novels/:novelId/materials/:type/:key — 取单个自定义素材。 */
router.get("/novels/:novelId/materials/:type/:key", async (req, res) => {
  const { novelId, type, key } = req.params;
  if (!novelService.getById(novelId)) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  if (!isUserType(type) || !KEY_RE.test(key)) {
    res.status(400).json({ error: "type/key 非法" });
    return;
  }
  const entry = await materialService.getUserMaterial(novelId, type, key);
  if (!entry) {
    res.status(404).json({ error: "素材不存在" });
    return;
  }
  res.json(entry);
});

/** PATCH /novels/:novelId/materials/:type/:key — 更新自定义素材。 */
router.patch("/novels/:novelId/materials/:type/:key", async (req, res) => {
  const { novelId, type, key } = req.params;
  if (!novelService.getById(novelId)) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  if (!isUserType(type) || !KEY_RE.test(key)) {
    res.status(400).json({ error: "type/key 非法" });
    return;
  }
  const entry = await materialService.upsertUserMaterial(novelId, type, key, req.body ?? {});
  res.json(entry);
});

/** DELETE /novels/:novelId/materials/:type/:key — 删除自定义素材。 */
router.delete("/novels/:novelId/materials/:type/:key", async (req, res) => {
  const { novelId, type, key } = req.params;
  if (!novelService.getById(novelId)) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  if (!isUserType(type) || !KEY_RE.test(key)) {
    res.status(400).json({ error: "type/key 非法" });
    return;
  }
  await materialService.deleteUserMaterial(novelId, type, key);
  res.status(204).end();
});

export const materialRoutes = router;
