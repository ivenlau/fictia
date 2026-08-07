/**
 * 自定义工具 REST：CRUD + test + generate。
 *
 * 全局资源（不绑 novel），但 test/js 执行需 novel 上下文（novelDir），故 test 在 body 带 novelId。
 * generate（POST /custom-tools/generate）见 tool-generator agent。
 */
import { Router } from "express";
import { customToolService } from "../services/custom-tool-service.js";
import { generateCustomTool } from "../agents/tool-generator.js";
import { fileService } from "../services/file.service.js";
import type { CustomToolDef } from "@fictia/shared";

const router = Router();

/** 工具名/合法性校验错误 → 400。 */
function bad(res: any, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  res.status(400).json({ error: msg });
}

// GET /custom-tools - 列表（含禁用）
router.get("/custom-tools", (_req, res) => {
  res.json(customToolService.list());
});

// GET /custom-tools/:id
router.get("/custom-tools/:id", (req, res) => {
  const def = customToolService.get(req.params.id);
  if (!def) {
    res.status(404).json({ error: "工具不存在" });
    return;
  }
  res.json(def);
});

// POST /custom-tools - 新建
router.post("/custom-tools", (req, res) => {
  try {
    const def = customToolService.create(req.body as Omit<CustomToolDef, "id" | "createdAt" | "updatedAt">);
    res.status(201).json(def);
  } catch (err) {
    bad(res, err);
  }
});

// PATCH /custom-tools/:id - 更新
router.patch("/custom-tools/:id", (req, res) => {
  try {
    const def = customToolService.update(req.params.id, req.body as Partial<CustomToolDef>);
    res.json(def);
  } catch (err) {
    bad(res, err);
  }
});

// DELETE /custom-tools/:id
router.delete("/custom-tools/:id", (req, res) => {
  customToolService.remove(req.params.id);
  res.json({ ok: true });
});

// POST /custom-tools/:id/test - 测试已保存工具。body: { novelId?, params }
router.post("/custom-tools/:id/test", async (req, res) => {
  try {
    const { novelId, params } = req.body ?? {};
    const novelDir = novelId ? fileService.getNovelDir(novelId) : process.cwd();
    const result = await customToolService.testById(
      req.params.id,
      params ?? {},
      { novelId: novelId ?? "", novelDir },
    );
    res.json(result);
  } catch (err) {
    bad(res, err);
  }
});

// POST /custom-tools/test - 测试临时 def（编辑器预览未保存）。body: { novelId?, def, params }
router.post("/custom-tools/test", async (req, res) => {
  try {
    const { novelId, def, params } = req.body ?? {};
    const novelDir = novelId ? fileService.getNovelDir(novelId) : process.cwd();
    const result = await customToolService.testDef(
      def as CustomToolDef,
      params ?? {},
      { novelId: novelId ?? "", novelDir },
    );
    res.json(result);
  } catch (err) {
    bad(res, err);
  }
});

// POST /custom-tools/generate - 自然语言生成工具定义（不落库，前端预览后保存）
router.post("/custom-tools/generate", async (req, res) => {
  try {
    const { description, preferKind } = req.body ?? {};
    if (!description || typeof description !== "string") {
      res.status(400).json({ error: "description 必填" });
      return;
    }
    const def = await generateCustomTool(description, preferKind);
    res.json(def);
  } catch (err) {
    bad(res, err);
  }
});

export const customToolRoutes = router;
