import { Router } from "express";
import { settingsService } from "../services/settings.service.js";

const router = Router();

// GET / - get settings (agentModels / chatPersona / embeddingProvider / manualConfirm)
router.get("/", (_req, res) => {
  res.json(settingsService.get());
});

// PATCH / - update settings
router.patch("/", (req, res) => {
  res.json(settingsService.update(req.body));
});

export const settingsRoutes = router;
