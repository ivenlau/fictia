import { Router } from "express";
import { novelService } from "../services/novel.service.js";
import { referenceService } from "../services/reference.service.js";
import type { SourceFormat } from "../utils/reference-works.js";

const router = Router();

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function isValidSourceFormat(f: unknown): f is SourceFormat {
  return f === "paste" || f === "txt" || f === "markdown" || f === "epub";
}

function novel404(novelId: string, res: any): boolean {
  if (!novelService.getById(novelId)) {
    res.status(404).json({ error: "Novel not found" });
    return false;
  }
  return true;
}

/** GET /novels/:novelId/references — 列出本作所有参考作品元数据。 */
router.get("/novels/:novelId/references", async (req, res) => {
  const { novelId } = req.params;
  if (!novel404(novelId, res)) return;
  const entries = await referenceService.list(novelId);
  res.json({ entries });
});

/** GET /novels/:novelId/references/:key — 单个参考作品详情（含 fingerprint）。 */
router.get("/novels/:novelId/references/:key", async (req, res) => {
  const { novelId, key } = req.params;
  if (!novel404(novelId, res)) return;
  if (!KEY_RE.test(key)) {
    res.status(400).json({ error: "key 非法" });
    return;
  }
  const work = await referenceService.get(novelId, key);
  if (!work) {
    res.status(404).json({ error: "参考作品不存在" });
    return;
  }
  res.json(work);
});

/**
 * POST /novels/:novelId/references — 新建参考作品并同步解析。
 * body: { key, name?, sourceText, sourceFormat?, description? }
 * 返回 { work, parse }（含 fingerprint）。
 */
router.post("/novels/:novelId/references", async (req, res) => {
  const { novelId } = req.params;
  if (!novel404(novelId, res)) return;
  const { key, name, sourceText, sourceFormat, description } = req.body ?? {};
  if (typeof key !== "string" || !KEY_RE.test(key)) {
    res.status(400).json({ error: "key 须匹配 /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/" });
    return;
  }
  if (typeof sourceText !== "string" || !sourceText.trim()) {
    res.status(400).json({ error: "sourceText 必填（参考作品原文）" });
    return;
  }
  const fmt = isValidSourceFormat(sourceFormat) ? sourceFormat : "paste";
  try {
    await referenceService.create(novelId, key, {
      name: typeof name === "string" && name ? name : key,
      sourceText,
      sourceFormat: fmt,
      description: typeof description === "string" ? description : undefined,
    });
    const result = await referenceService.parse(novelId, key);
    res.status(201).json(result);
  } catch (err: any) {
    console.error(`[references] create+parse 失败 ${key}:`, err?.message);
    res.status(500).json({ error: err?.message ?? "解析失败" });
  }
});

/** POST /novels/:novelId/references/:key/parse — 重新解析（覆盖 fingerprint）。 */
router.post("/novels/:novelId/references/:key/parse", async (req, res) => {
  const { novelId, key } = req.params;
  if (!novel404(novelId, res)) return;
  if (!KEY_RE.test(key)) {
    res.status(400).json({ error: "key 非法" });
    return;
  }
  if (!(await referenceService.get(novelId, key))) {
    res.status(404).json({ error: "参考作品不存在" });
    return;
  }
  try {
    const result = await referenceService.parse(novelId, key);
    res.json(result);
  } catch (err: any) {
    console.error(`[references] reparse 失败 ${key}:`, err?.message);
    res.status(500).json({ error: err?.message ?? "解析失败" });
  }
});

/** POST /novels/:novelId/references/:key/adopt-genre — 把体裁卡产出 clone 为本作自定义体裁卡。 */
router.post("/novels/:novelId/references/:key/adopt-genre", async (req, res) => {
  const { novelId, key } = req.params;
  if (!novel404(novelId, res)) return;
  if (!KEY_RE.test(key)) {
    res.status(400).json({ error: "key 非法" });
    return;
  }
  try {
    const entry = await referenceService.adoptGenre(novelId, key);
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(404).json({ error: err?.message ?? "采用失败" });
  }
});

/** PATCH /novels/:novelId/references/:key — 更新 enabled / name / description。 */
router.patch("/novels/:novelId/references/:key", async (req, res) => {
  const { novelId, key } = req.params;
  if (!novel404(novelId, res)) return;
  if (!KEY_RE.test(key)) {
    res.status(400).json({ error: "key 非法" });
    return;
  }
  const { name, description, enabled } = req.body ?? {};
  const data: { name?: string; description?: string; enabled?: boolean } = {};
  if (typeof name === "string") data.name = name;
  if (typeof description === "string") data.description = description;
  if (typeof enabled === "boolean") data.enabled = enabled;
  const entry = await referenceService.update(novelId, key, data);
  if (!entry) {
    res.status(404).json({ error: "参考作品不存在" });
    return;
  }
  res.json(entry);
});

/** DELETE /novels/:novelId/references/:key — 删除整本参考作品（递归清理）。 */
router.delete("/novels/:novelId/references/:key", async (req, res) => {
  const { novelId, key } = req.params;
  if (!novel404(novelId, res)) return;
  if (!KEY_RE.test(key)) {
    res.status(400).json({ error: "key 非法" });
    return;
  }
  await referenceService.remove(novelId, key);
  res.status(204).end();
});

export const referenceRoutes = router;
