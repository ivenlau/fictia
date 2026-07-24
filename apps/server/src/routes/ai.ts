import { Router } from "express";
import { complete, type Context } from "@earendil-works/pi-ai";
import type { AiGenerateKind, AiGenerateTextRequest } from "@fictia/shared";
import { settingsService } from "../services/settings.service.js";
import { providerService } from "../services/provider.service.js";
import { buildModel } from "../llm/providers.js";

const router = Router();

const VALID_KINDS: AiGenerateKind[] = [
  "novel-description",
  "craft",
  "genre-card",
  "prompt-snippet",
  "preferences",
];

const KIND_LABEL: Record<AiGenerateKind, string> = {
  "novel-description": "小说简介",
  craft: "写作技法",
  "genre-card": "体裁卡",
  "prompt-snippet": "提示词片段",
  preferences: "创作偏好",
};

const SYSTEM_PROMPTS: Record<AiGenerateKind, string> = {
  "novel-description":
    "你是一位资深小说策划。根据用户提供的信息，撰写一段吸引人的小说简介（约150-300字）。直接输出简介正文，不要加标题、不要解释、不要使用 Markdown 标记。若提供了现有简介，在其基础上更新或扩展，保留用户想保留的要素。",
  craft:
    "你是一位写作技法专家。根据用户提供的信息，撰写一篇「写作技法」正文（Markdown 格式，结构清晰，可含小标题与要点）。直接输出正文，不要解释。若提供了现有正文，在其基础上更新或扩展。",
  "genre-card":
    "你是一位网文体裁策划。根据用户提供的信息，撰写「体裁卡」正文（Markdown 格式），覆盖：开场抓手、冲突发动机、核心爽点、节奏建议、常见套路与反套路。直接输出正文，不要解释。若提供了现有正文，在其基础上更新或扩展。",
  "prompt-snippet":
    "你是一位提示词工程师。根据用户提供的信息，撰写一段可复用的「提示词片段」正文，用于追加到 AI 对话输入框。直接输出片段正文，不要解释、不要包裹代码块。",
  preferences:
    "你是一位创作偏好顾问。根据用户提供的信息，撰写「创作偏好」正文（Markdown 列表），作为作者常驻指令，例如节奏、句式、人称、禁忌等。直接输出正文，不要解释。若提供了现有正文，在其基础上更新或扩展。",
};

/**
 * POST /generate-text
 *   body: { kind, fields, current? }
 * 用 AI 助手模型（settings.chatModel）生成「主体文字」，一次性返回。
 */
router.post("/generate-text", async (req, res) => {
  const { kind, fields, current } = req.body as AiGenerateTextRequest;

  if (!kind || !VALID_KINDS.includes(kind)) {
    res.status(400).json({ error: `kind 必须是 ${VALID_KINDS.join("/")} 之一` });
    return;
  }
  if (!fields || typeof fields !== "object") {
    res.status(400).json({ error: "fields 必须是对象" });
    return;
  }

  // 解析模型：用 AI 助手模型（settings.chatModel），含 model 级回落
  const { chatModel } = settingsService.get();
  const resolved = providerService.resolveModel(chatModel.providerId, chatModel.modelId);
  if (!resolved) {
    res.status(400).json({ error: `对话模型未配置: ${chatModel.providerId}/${chatModel.modelId}，请到设置重新选择` });
    return;
  }
  const apiKey = resolved.provider.apiKey ?? "";
  if (!apiKey) {
    res.status(400).json({ error: `未配置 API Key：${resolved.provider.name}` });
    return;
  }

  // 拼 user prompt
  const fieldLines = Object.entries(fields)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const hasCurrent = typeof current === "string" && current.trim().length > 0;
  const userMessage = [
    `请根据以下信息生成${KIND_LABEL[kind]}正文。`,
    "",
    "已填信息：",
    fieldLines || "- (无)",
    "",
    hasCurrent ? `现有正文（在其基础上更新/扩展，不要丢弃用户想保留的要素）：\n${current}` : "",
  ]
    .filter((line) => line.length > 0 || fieldLines)
    .join("\n");

  const ctx: Context = {
    systemPrompt: SYSTEM_PROMPTS[kind],
    messages: [{ role: "user", content: userMessage, timestamp: Date.now() }],
  };

  try {
    const model = buildModel(resolved.provider, resolved.model);
    const response = await complete(model, ctx, { apiKey });

    if (response.errorMessage) {
      res.status(500).json({ error: `LLM error: ${response.errorMessage}` });
      return;
    }

    const textParts: string[] = [];
    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
      }
    }
    const content = textParts.join("").trim();
    if (!content) {
      res.status(500).json({ error: "模型返回空内容，请重试或更换模型" });
      return;
    }
    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "生成失败" });
  }
});

export const aiRoutes = router;
