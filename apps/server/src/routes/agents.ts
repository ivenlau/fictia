import { Router } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, schema } from "../db/index.js";
import { novelService } from "../services/novel.service.js";
import { fileService, summarizeTrace } from "../services/file.service.js";
import { runAgent } from "../agents/index.js";
import { AGENT_FILE_MAP } from "@fictia/shared";
import type { AgentType } from "@fictia/shared";

const router = Router();
const now = () => new Date().toISOString();

function buildNovelContext(novel: any): string {
  return novelService.buildMetaContext(novel);
}

async function executeAgent(
  outputId: string,
  agentType: AgentType,
  novelId: string,
  chapterId: string | null,
  persona?: string,
) {
  // 单一时间戳：content(.md) 与 trace(.trace.json) 共用前缀，便于配对与清理
  const ts = Date.now();
  const traceFilename = `${agentType}-${ts}.trace.json`;
  const contentFilename = `${agentType}-${ts}.md`;

  // 立即置 running 并记录 traceFilename，让 SSE 能尽早下发 trace（agent 自行增量写文件）
  db.update(schema.agentOutputs)
    .set({ status: "running", traceFilename })
    .where(eq(schema.agentOutputs.id, outputId))
    .run();

  try {
    const novel = novelService.getById(novelId);
    if (!novel) throw new Error("Novel not found");

    const agentModelsRaw = (() => {
      const row = db.select().from(schema.settings).where(eq(schema.settings.key, "agentModels")).get();
      if (row?.value) {
        try {
          return JSON.parse(row.value);
        } catch {
          return null;
        }
      }
      return null;
    })();

    const novelDir = fileService.getNovelDir(novelId);

    const result = await runAgent(
      agentType,
      novelDir,
      { extraContext: buildNovelContext(novel), traceFilename },
      agentModelsRaw,
    );

    // Save result to workspace file
    const workspacePath = AGENT_FILE_MAP[agentType];
    if (workspacePath && result.output) {
      await fileService.writeWorkspaceFile(novelId, workspacePath, result.output);
    }

    // Save agent output to file
    await fileService.writeAgentOutput(novelId, contentFilename, result.output);

    // Update agent output record（用 trace 汇总回填 model/轮次/工具数）
    db.update(schema.agentOutputs)
      .set({
        filename: contentFilename,
        traceFilename,
        ...summarizeTrace(result.trace),
        status: result.success ? "completed" : "failed",
        tokensOutput: result.output?.length ?? 0,
        completedAt: now(),
      })
      .where(eq(schema.agentOutputs.id, outputId))
      .run();
  } catch (err: any) {
    // 失败：读回 agent 已增量写入的 trace（若有），补 errorMessage 后落盘，便于诊断
    const partial = await fileService.readAgentTrace(novelId, traceFilename);
    if (partial) {
      await fileService
        .writeAgentTrace(novelId, traceFilename, {
          ...partial,
          completedAt: now(),
          errorMessage: err?.message ?? "Unknown error",
        })
        .catch(() => {});
    }
    const errFile = `error-${Date.now()}.md`;
    db.update(schema.agentOutputs)
      .set({
        status: "failed",
        filename: errFile,
        traceFilename: partial ? traceFilename : "",
        ...summarizeTrace(partial),
        completedAt: now(),
      })
      .where(eq(schema.agentOutputs.id, outputId))
      .run();

    // Write error to file
    await fileService.writeAgentOutput(
      novelId,
      errFile,
      `Error: ${err?.message ?? "Unknown error"}`,
    );
  }
}

// POST /novels/:novelId/agents/:type/trigger - trigger agent for a novel
router.post("/novels/:novelId/agents/:type/trigger", (req, res) => {
  const { novelId, type } = req.params;
  const { persona } = req.body;

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const id = uuid();
  const timestamp = now();

  db.insert(schema.agentOutputs)
    .values({
      id,
      novelId,
      chapterId: null,
      agentType: type,
      persona: persona ?? null,
      filename: "",
      modelUsed: "",
      providerUsed: "",
      status: "pending",
      tokensInput: 0,
      tokensOutput: 0,
      cost: 0,
      createdAt: timestamp,
      completedAt: null,
    })
    .run();

  // Execute agent asynchronously
  executeAgent(id, type as AgentType, novelId, null, persona);

  res.status(201).json({ outputId: id });
});

// POST /chapters/:chapterId/agents/:type/trigger - trigger agent for a chapter
router.post("/chapters/:chapterId/agents/:type/trigger", (req, res) => {
  const { chapterId, type } = req.params;
  const { persona } = req.body;

  const chapter = db
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .get();

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  const id = uuid();
  const timestamp = now();

  db.insert(schema.agentOutputs)
    .values({
      id,
      novelId: chapter.novelId,
      chapterId,
      agentType: type,
      persona: persona ?? null,
      filename: "",
      modelUsed: "",
      providerUsed: "",
      status: "pending",
      tokensInput: 0,
      tokensOutput: 0,
      cost: 0,
      createdAt: timestamp,
      completedAt: null,
    })
    .run();

  // Execute agent asynchronously
  executeAgent(id, type as AgentType, chapter.novelId, chapterId, persona);

  res.status(201).json({ outputId: id });
});

// GET /agents/:outputId/status - get agent output status
router.get("/agents/:outputId/status", async (req, res) => {
  const output = db
    .select()
    .from(schema.agentOutputs)
    .where(eq(schema.agentOutputs.id, req.params.outputId))
    .get();

  if (!output) {
    res.status(404).json({ error: "Agent output not found" });
    return;
  }

  // Load content from file
  let content = "";
  if (output.filename) {
    content = await fileService.readAgentOutput(output.novelId, output.filename);
  }

  res.json({ ...output, content });
});

// GET /agents/:outputId/stream - SSE endpoint for streaming agent output + debug trace
router.get("/agents/:outputId/stream", (req, res) => {
  const output = db
    .select()
    .from(schema.agentOutputs)
    .where(eq(schema.agentOutputs.id, req.params.outputId))
    .get();

  if (!output) {
    res.status(404).json({ error: "Agent output not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const isTerminal = (s: string | null | undefined) =>
    s === "completed" || s === "failed" || s === "cancelled";

  // 每个 tick 同时下发 status + content + trace（trace 可能为 null）
  const sendState = async (row: typeof output) => {
    let content = "";
    if (row.filename) {
      content = await fileService.readAgentOutput(row.novelId, row.filename);
    }
    const trace = row.traceFilename
      ? await fileService.readAgentTrace(row.novelId, row.traceFilename)
      : null;
    return { type: "status", status: row.status, content, trace };
  };

  sendState(output).then((data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);

    if (isTerminal(output.status)) {
      res.write(`data: ${JSON.stringify({ type: "done", status: output.status })}\n\n`);
      res.end();
      return;
    }

    const interval = setInterval(async () => {
      const current = db
        .select()
        .from(schema.agentOutputs)
        .where(eq(schema.agentOutputs.id, req.params.outputId))
        .get();

      if (!current) {
        clearInterval(interval);
        res.end();
        return;
      }

      const state = await sendState(current);
      res.write(`data: ${JSON.stringify(state)}\n\n`);

      if (isTerminal(current.status)) {
        res.write(`data: ${JSON.stringify({ type: "done", status: current.status })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    }, 1000);

    req.on("close", () => {
      clearInterval(interval);
    });
  });
});

// GET /agents/:outputId/trace - 读取一次完整调试 trace
router.get("/agents/:outputId/trace", async (req, res) => {
  const output = db
    .select()
    .from(schema.agentOutputs)
    .where(eq(schema.agentOutputs.id, req.params.outputId))
    .get();

  if (!output) {
    res.status(404).json({ error: "Agent output not found" });
    return;
  }

  // 支持读取指定段 trace（?file=<traceFilename>）；不传则读 agent_outputs.trace_filename（最新活动段，兼容现状）。
  const file =
    typeof req.query.file === "string" && req.query.file ? req.query.file : output.traceFilename;
  const trace = file ? await fileService.readAgentTrace(output.novelId, file) : null;
  if (!trace) {
    res.status(404).json({ error: "No trace available" });
    return;
  }
  res.json(trace);
});

// GET /agents/:outputId/segments - 列出该任务的所有 trace 段（多段写作：初稿/prose-fix/review-fix，按 seq 排序）
router.get("/agents/:outputId/segments", (req, res) => {
  const segs = db
    .select()
    .from(schema.agentTraceSegments)
    .where(eq(schema.agentTraceSegments.agentOutputId, req.params.outputId))
    .all()
    .sort((a, b) => a.seq - b.seq);
  res.json(segs);
});

// DELETE /agents/:outputId - 删除单条任务记录（DB row + .md + .trace.json；级联删 review_feedback）
router.delete("/agents/:outputId", (req, res) => {
  const output = db
    .select()
    .from(schema.agentOutputs)
    .where(eq(schema.agentOutputs.id, req.params.outputId))
    .get();

  if (!output) {
    res.status(404).json({ error: "Agent output not found" });
    return;
  }

  // 收集所有段 trace 文件（多段写作）+ content 文件一并清理；DB 行删除级联清 segments 行。
  const segs = db
    .select()
    .from(schema.agentTraceSegments)
    .where(eq(schema.agentTraceSegments.agentOutputId, output.id))
    .all();
  const traceFiles = Array.from(
    new Set(
      segs
        .map((s) => s.traceFilename)
        .concat(output.traceFilename ? [output.traceFilename] : []),
    ),
  );
  fileService
    .deleteAgentOutputFiles(output.novelId, output.filename, null)
    .catch((e) => console.error(`[agent-outputs] delete content failed for ${output.id}`, e));
  fileService
    .deleteAgentTraceFiles(output.novelId, traceFiles)
    .catch((e) => console.error(`[agent-outputs] delete trace files failed for ${output.id}`, e));
  db.delete(schema.agentOutputs).where(eq(schema.agentOutputs.id, req.params.outputId)).run();
  res.json({ ok: true });
});

// POST /agents/:outputId/cancel - cancel an agent
router.post("/agents/:outputId/cancel", (req, res) => {
  const output = db
    .select()
    .from(schema.agentOutputs)
    .where(eq(schema.agentOutputs.id, req.params.outputId))
    .get();

  if (!output) {
    res.status(404).json({ error: "Agent output not found" });
    return;
  }

  if (output.status !== "running") {
    res.status(400).json({ error: "Agent is not running" });
    return;
  }

  db.update(schema.agentOutputs)
    .set({ status: "cancelled", completedAt: now() })
    .where(eq(schema.agentOutputs.id, req.params.outputId))
    .run();

  res.json({ status: "cancelled" });
});

// GET /novels/:novelId/agent-outputs - list all agent outputs for a novel
router.get("/novels/:novelId/agent-outputs", async (req, res) => {
  const novel = novelService.getById(req.params.novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const outputs = db
    .select()
    .from(schema.agentOutputs)
    .where(eq(schema.agentOutputs.novelId, req.params.novelId))
    .all();

  // Load content for each output
  const results = [];
  for (const output of outputs) {
    let content = "";
    if (output.filename) {
      content = await fileService.readAgentOutput(output.novelId, output.filename);
    }
    const segmentCount = db
      .select()
      .from(schema.agentTraceSegments)
      .where(eq(schema.agentTraceSegments.agentOutputId, output.id))
      .all().length;
    results.push({ ...output, content, segmentCount });
  }

  res.json(results);
});

// DELETE /novels/:novelId/agent-outputs - 清空该小说全部任务记录（DB rows + 文件）
router.delete("/novels/:novelId/agent-outputs", async (req, res) => {
  const novel = novelService.getById(req.params.novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const outputs = db
    .select()
    .from(schema.agentOutputs)
    .where(eq(schema.agentOutputs.novelId, req.params.novelId))
    .all();

  await Promise.all(
    outputs.map(async (o) => {
      const segs = db
        .select()
        .from(schema.agentTraceSegments)
        .where(eq(schema.agentTraceSegments.agentOutputId, o.id))
        .all();
      const traceFiles = Array.from(
        new Set(
          segs
            .map((s) => s.traceFilename)
            .concat(o.traceFilename ? [o.traceFilename] : []),
        ),
      );
      await fileService.deleteAgentOutputFiles(o.novelId, o.filename, null);
      await fileService.deleteAgentTraceFiles(o.novelId, traceFiles);
    }),
  );
  db.delete(schema.agentOutputs)
    .where(eq(schema.agentOutputs.novelId, req.params.novelId))
    .run();

  res.json({ ok: true, deleted: outputs.length });
});

// POST /chapters/:chapterId/rewrite - local rewrite using edit tools
router.post("/chapters/:chapterId/rewrite", async (req, res) => {
  const { chapterId } = req.params;
  const { selectedText, instruction, context: surroundingContext } = req.body as {
    selectedText?: string;
    instruction: string;
    context?: string;
  };

  if (!instruction) {
    res.status(400).json({ error: "instruction is required" });
    return;
  }

  const chapter = db
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .get();

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  if (!chapter.filename) {
    res.status(400).json({ error: "Chapter has no content file" });
    return;
  }

  const novel = novelService.getById(chapter.novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  try {
    const agentModelsRaw = (() => {
      const row = db.select().from(schema.settings).where(eq(schema.settings.key, "agentModels")).get();
      if (row?.value) { try { return JSON.parse(row.value); } catch { return null; } }
      return null;
    })();

    const novelContext = buildNovelContext(novel);
    const novelDir = fileService.getNovelDir(chapter.novelId);

    // Build the rewrite prompt
    const promptSections = [
      `## 小说背景\n${novelContext}`,
      `## 改写任务`,
      `文件路径: chapters/${chapter.filename}`,
    ];

    if (selectedText) {
      promptSections.push(`## 用户选中的文本\n"${selectedText}"`);
    }

    if (surroundingContext) {
      promptSections.push(`## 上下文（选中文本的前后内容）\n${surroundingContext}`);
    }

    promptSections.push(`## 用户指令\n${instruction}`);

    // Use chapter-writer agent for rewrite
    const result = await runAgent(
      "chapter-writer" as AgentType,
      novelDir,
      { userDirective: promptSections.join("\n\n") },
      agentModelsRaw,
    );

    // Re-read the file after edits
    const updatedContent = await fileService.readChapter(chapter.novelId, chapter.filename);

    res.json({
      response: result.output,
      toolCalls: [],
      updatedContent,
    });
  } catch (err: any) {
    console.error("[Rewrite] Failed:", err);
    res.status(500).json({ error: err?.message ?? "Rewrite failed" });
  }
});

// POST /novels/:novelId/file-rewrite - file-based rewrite (no DB chapter required)
router.post("/novels/:novelId/file-rewrite", async (req, res) => {
  const { novelId } = req.params;
  const { filePath, selectedText, instruction } = req.body as {
    filePath?: string;
    selectedText?: string;
    instruction: string;
  };

  if (!instruction) {
    res.status(400).json({ error: "instruction is required" });
    return;
  }

  if (!filePath) {
    res.status(400).json({ error: "filePath is required" });
    return;
  }

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  try {
    const agentModelsRaw = (() => {
      const row = db.select().from(schema.settings).where(eq(schema.settings.key, "agentModels")).get();
      if (row?.value) { try { return JSON.parse(row.value); } catch { return null; } }
      return null;
    })();

    const novelContext = buildNovelContext(novel);
    const novelDir = fileService.getNovelDir(novelId);

    const promptSections = [
      `## 小说背景\n${novelContext}`,
      `## 改写任务`,
      `文件路径: ${filePath}`,
    ];

    if (selectedText) {
      promptSections.push(`## 用户选中的文本\n"${selectedText}"`);
    }

    promptSections.push(`## 用户指令\n${instruction}`);

    await runAgent(
      "chapter-writer" as AgentType,
      novelDir,
      { userDirective: promptSections.join("\n\n"), incrementalTarget: filePath },
      agentModelsRaw,
    );

    const updatedContent = await fileService.readWorkspaceFile(novelId, filePath);

    res.json({ updatedContent });
  } catch (err: any) {
    console.error("[FileRewrite] Failed:", err);
    res.status(500).json({ error: err?.message ?? "Rewrite failed" });
  }
});

export const agentRoutes = router;
