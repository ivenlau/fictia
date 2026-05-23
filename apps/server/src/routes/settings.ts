import { Router } from "express";
import { settingsService } from "../services/settings.service.js";
import { PROVIDER_CONFIGS } from "../llm/providers.js";
import { PROVIDER_LABELS, DEFAULT_AGENT_MODELS } from "../../../../packages/shared/src/constants.js";

const router = Router();

// GET / - get settings (API keys are masked)
router.get("/", (_req, res) => {
  const settings = settingsService.get();
  res.json(settings);
});

// PATCH / - update settings
router.patch("/", (req, res) => {
  const updated = settingsService.update(req.body);
  res.json(updated);
});

// POST /test-connection - test an API key connection
router.post("/test-connection", async (req, res) => {
  const { provider, apiKey: bodyKey } = req.body;

  if (!provider) {
    res.status(400).json({ error: "provider is required" });
    return;
  }

  // Use key from request body if provided, otherwise read from DB
  let apiKey = bodyKey ?? "";
  if (!apiKey) {
    const keys = settingsService.getApiKeys();
    switch (provider) {
      case "glm": apiKey = keys.glm; break;
      case "minimax": apiKey = keys.minimax; break;
      case "doubao": apiKey = keys.doubao; break;
      default:
        res.status(400).json({ error: `Unknown provider: ${provider}` });
        return;
    }
  }

  if (!apiKey) {
    res.json({
      ok: false,
      provider,
      label: PROVIDER_LABELS[provider] ?? provider,
      error: "API key not configured",
    });
    return;
  }

  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    res.json({ ok: false, provider, error: "Unknown provider config" });
    return;
  }

  // Pick the first model for the provider as test model
  const testModel = DEFAULT_AGENT_MODELS
    ? Object.values(DEFAULT_AGENT_MODELS).find((m) => m.provider === provider)?.model
    : undefined;

  const modelMap: Record<string, string> = {
    glm: "glm-4.7",
    minimax: "MiniMax-M2.5",
    doubao: "doubao-seed-2-0-pro-260215",
  };

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelMap[provider] ?? "test",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
    });

    if (response.ok) {
      res.json({ ok: true, provider, label: PROVIDER_LABELS[provider] ?? provider });
    } else {
      const errBody = await response.text().catch(() => "");
      res.json({
        ok: false,
        provider,
        label: PROVIDER_LABELS[provider] ?? provider,
        error: `HTTP ${response.status}: ${errBody.slice(0, 200)}`,
      });
    }
  } catch (err: any) {
    res.json({
      ok: false,
      provider,
      label: PROVIDER_LABELS[provider] ?? provider,
      error: err?.message ?? "Connection failed",
    });
  }
});

export const settingsRoutes = router;
