import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db, schema } from "../db/index.js";
import { providerService } from "../services/provider.service.js";
import { buildModel } from "../llm/providers.js";
import { runChatAgent } from "../agents/chat.agent.js";
import type { ChatRequest } from "@fictia/shared";
import { DEFAULT_CHAT_PERSONA } from "@fictia/shared";
import { eq, desc, isNull } from "drizzle-orm";

const router = Router();

const now = () => new Date().toISOString();

// GET /history — get chat history
router.get("/history", (req, res) => {
  const novelId = req.query.novelId as string | undefined;

  let query = db.select().from(schema.chatMessages);

  if (novelId) {
    query = query.where(eq(schema.chatMessages.novelId, novelId)) as any;
  }

  const messages = query.orderBy(desc(schema.chatMessages.createdAt)).limit(100).all().reverse();
  res.json(messages);
});

// DELETE /history — clear chat history
router.delete("/history", (req, res) => {
  const novelId = req.query.novelId as string | undefined;
  if (novelId) {
    db.delete(schema.chatMessages).where(eq(schema.chatMessages.novelId, novelId)).run();
  } else {
    db.delete(schema.chatMessages).where(isNull(schema.chatMessages.novelId)).run();
  }
  res.json({ ok: true });
});

// POST / — SSE streaming chat
router.post("/", async (req, res) => {
  const { message, novelId, providerId, modelId, history } = req.body as ChatRequest;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // Resolve provider + model from DB
  const resolved = providerService.resolveModel(providerId, modelId);
  if (!resolved) {
    res.status(400).json({ error: `Provider/model 未配置: ${providerId}/${modelId}` });
    return;
  }
  const apiKey = resolved.provider.apiKey ?? "";
  if (!apiKey) {
    res.status(400).json({ error: `未配置 API Key：${resolved.provider.name}` });
    return;
  }

  // Get persona from settings
  const personaRow = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "chatPersona"))
    .get();
  const persona = personaRow?.value || DEFAULT_CHAT_PERSONA;

  // Create model
  const llmModel = buildModel(resolved.provider, resolved.model);

  // Save user message to DB
  const userMsgId = uuid();
  db.insert(schema.chatMessages)
    .values({
      id: userMsgId,
      novelId: novelId ?? null,
      role: "user",
      content: message,
      createdAt: now(),
    })
    .run();

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const fullResponse = await runChatAgent(
      llmModel,
      apiKey,
      persona,
      message,
      history ?? [],
      novelId ?? null,
      {
        onDelta: (delta) => {
          sendEvent({ type: "text_delta", delta });
        },
        onToolCall: (tool, input) => sendEvent({ type: "tool_call", tool, input }),
        onToolResult: (tool, input, result) => sendEvent({ type: "tool_result", tool, input, result }),
      },
    );

    // Save assistant message to DB
    const assistantMsgId = uuid();
    db.insert(schema.chatMessages)
      .values({
        id: assistantMsgId,
        novelId: novelId ?? null,
        role: "assistant",
        content: fullResponse,
        modelUsed: modelId,
        providerUsed: providerId,
        createdAt: now(),
      })
      .run();

    sendEvent({ type: "done", id: assistantMsgId });
  } catch (err: any) {
    sendEvent({ type: "error", error: err.message ?? "Unknown error" });
  } finally {
    res.end();
  }
});

export const chatRoutes = router;
