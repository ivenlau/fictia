import { Router } from "express";
import { providerService } from "../services/provider.service.js";

const router = Router();

// GET / - list all providers (api key masked)
router.get("/", (_req, res) => {
  res.json(providerService.list());
});

// GET /usable - enabled providers with enabled models (for model pickers)
router.get("/usable", (_req, res) => {
  res.json(providerService.listUsable());
});

// POST / - create a custom provider
router.post("/", (req, res) => {
  const { name, baseUrl, apiFormat, apiKey, enabled } = req.body ?? {};
  if (!name || !baseUrl) {
    res.status(400).json({ error: "name 和 baseUrl 必填" });
    return;
  }
  res.json(providerService.create({ name, baseUrl, apiFormat, apiKey, enabled }));
});

// PATCH /:id - update provider (masked api keys are skipped)
router.patch("/:id", (req, res) => {
  const updated = providerService.update(req.params.id, req.body ?? {});
  if (!updated) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  res.json(updated);
});

// DELETE /:id - delete a custom provider (preset providers are rejected)
router.delete("/:id", (req, res) => {
  const ok = providerService.remove(req.params.id);
  if (!ok) {
    res.status(400).json({ error: "无法删除（预置 provider 不可删除，或不存在）" });
    return;
  }
  res.json({ ok: true });
});

// POST /:id/test - test connection (optionally with an override key)
router.post("/:id/test", async (req, res) => {
  const { apiKey } = req.body ?? {};
  const result = await providerService.testConnection(req.params.id, apiKey);
  res.json(result);
});

// POST /:id/models - add a model to a provider
router.post("/:id/models", (req, res) => {
  const { id, name, contextWindow, maxTokens, reasoning, enabled } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: "name 必填" });
    return;
  }
  const model = providerService.addModel(req.params.id, { id, name, contextWindow, maxTokens, reasoning, enabled });
  if (!model) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  res.json(model);
});

// PATCH /:id/models/:modelId - update a model (incl. enable/disable)
router.patch("/:id/models/:modelId", (req, res) => {
  const model = providerService.updateModel(req.params.id, req.params.modelId, req.body ?? {});
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }
  res.json(model);
});

// DELETE /:id/models/:modelId - remove a model (preset models are soft-disabled)
router.delete("/:id/models/:modelId", (req, res) => {
  const ok = providerService.removeModel(req.params.id, req.params.modelId);
  if (!ok) {
    res.status(404).json({ error: "Model not found" });
    return;
  }
  res.json({ ok: true });
});

// POST /:id/reset-models - restore a preset provider's model list
router.post("/:id/reset-models", (req, res) => {
  const updated = providerService.resetPresetModels(req.params.id);
  if (!updated) {
    res.status(400).json({ error: "无法重置（仅预置 provider 支持）" });
    return;
  }
  res.json(updated);
});

export const providerRoutes = router;
