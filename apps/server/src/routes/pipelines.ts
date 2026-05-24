import { Router } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { StageName, AgentType } from "@fictia/shared";
import { STAGE_LABELS, AGENT_FILE_MAP } from "@fictia/shared";
import { db, schema } from "../db/index.js";
import { novelService } from "../services/novel.service.js";
import { settingsService } from "../services/settings.service.js";
import {
  getOrCreateOrchestrator,
  getOrCreateRunner,
  getRunnerState,
  writeAgentOutput,
} from "../services/pipeline.service.js";
import { getStageDefinition } from "../core/pipeline.js";
import { StateTracker } from "../core/state-tracker.js";
import { fileService } from "../services/file.service.js";

const now = () => new Date().toISOString();

const router = Router();
const VALID_STAGES = Object.keys(STAGE_LABELS) as StageName[];

function validateStage(stage: string): stage is StageName {
  return VALID_STAGES.includes(stage as StageName);
}

function getAgentModels(): Record<AgentType, { provider: string; model: string }> | undefined {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "agentModels"))
    .get();
  if (row?.value) {
    try {
      return JSON.parse(row.value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// GET /novels/:novelId/pipeline/status - get pipeline status
router.get("/novels/:novelId/pipeline/status", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const keys = settingsService.getApiKeys();
  const orch = getOrCreateOrchestrator(novelId, novelDir, keys);
  await orch.init();

  const tracker = orch.getStateTracker();
  const progress = tracker.getProgress();
  const runnerState = getRunnerState(novelId);

  const stages = VALID_STAGES.map((stageName) => {
    const def = getStageDefinition(stageName)!;
    const state = tracker.getState(stageName);
    return {
      name: stageName,
      label: def.label,
      agentType: def.agentType,
      dependsOn: def.dependsOn,
      canRunIncremental: def.canRunIncremental,
      status: state.status,
      reason: state.reason,
      confirmedAt: state.confirmedAt,
    };
  });

  res.json({
    novelId,
    progress,
    stages,
    isRunning: runnerState.isRunning,
    isPaused: runnerState.isPaused,
  });
});

// POST /novels/:novelId/pipeline/start - start pipeline async
router.post("/novels/:novelId/pipeline/start", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const runnerState = getRunnerState(novelId);
  if (runnerState.isRunning) {
    res.status(409).json({ error: "Pipeline is already running" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const keys = settingsService.getApiKeys();
  const agentModels = getAgentModels();
  const orch = getOrCreateOrchestrator(novelId, novelDir, keys, agentModels as any);
  await orch.init();

  const runner = getOrCreateRunner(novelId, orch, novelDir);

  // Start in background — do NOT await
  runner.start().catch((err) => {
    console.error(`[Pipeline] Runner failed for ${novelId}:`, err);
  });

  res.json({ status: "started", novelId, message: "Pipeline started" });
});

// POST /novels/:novelId/pipeline/pause
router.post("/novels/:novelId/pipeline/pause", async (req, res) => {
  const { novelId } = req.params;
  const runnerState = getRunnerState(novelId);
  if (!runnerState.isRunning) {
    res.status(400).json({ error: "Pipeline is not running" });
    return;
  }
  const { getRunner } = await import("../services/pipeline.service.js");
  const runner = getRunner(novelId);
  runner?.pause();
  res.json({ status: "paused", novelId });
});

// POST /novels/:novelId/pipeline/resume
router.post("/novels/:novelId/pipeline/resume", async (req, res) => {
  const { novelId } = req.params;
  const runnerState = getRunnerState(novelId);
  if (!runnerState.isRunning) {
    res.status(400).json({ error: "Pipeline is not running" });
    return;
  }
  const { getRunner } = await import("../services/pipeline.service.js");
  const runner = getRunner(novelId);
  runner?.resume();
  res.json({ status: "resumed", novelId });
});

// POST /novels/:novelId/pipeline/stages/:stage - run a specific stage
router.post("/novels/:novelId/pipeline/stages/:stage", async (req, res) => {
  const { novelId, stage } = req.params;
  const { userDirective, isRedo, incrementalTarget } = req.body ?? {};

  if (!validateStage(stage)) {
    res.status(400).json({ error: `无效的阶段: ${stage}` });
    return;
  }

  // Block if auto-pipeline is running
  const runnerState = getRunnerState(novelId);
  if (runnerState.isRunning) {
    res.status(409).json({ error: "Pipeline is running automatically. Pause it first." });
    return;
  }

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const keys = settingsService.getApiKeys();
  const agentModels = getAgentModels();
  const orch = getOrCreateOrchestrator(novelId, novelDir, keys, agentModels as any);
  await orch.init();

  // Create agent_outputs record before execution
  const def = getStageDefinition(stage as StageName);
  const outputId = uuid();
  if (def) {
    db.insert(schema.agentOutputs)
      .values({
        id: outputId,
        novelId,
        chapterId: null,
        agentType: def.agentType,
        stageName: stage,
        persona: userDirective ?? null,
        filename: "",
        modelUsed: "",
        providerUsed: "",
        status: "running",
        tokensInput: 0,
        tokensOutput: 0,
        cost: 0,
        createdAt: now(),
        completedAt: null,
      })
      .run();
  }

  try {
    const result = await orch.runStage(stage as StageName, {
      userDirective,
      isRedo,
      incrementalTarget,
    });

    if (result.success) {
      await writeAgentOutput(novelDir, result);
      // Propagate downstream when re-running
      if (isRedo) {
        await orch.onStageModified(stage as StageName);
      }
    }

    // Update agent_outputs record
    if (def) {
      db.update(schema.agentOutputs)
        .set({
          status: result.success ? "completed" : "failed",
          tokensOutput: result.output?.length ?? 0,
          completedAt: now(),
        })
        .where(eq(schema.agentOutputs.id, outputId))
        .run();
    }

    res.json({
      status: result.success ? "completed" : "failed",
      stage,
      result,
    });
  } catch (err: any) {
    // Mark output as failed
    if (def) {
      db.update(schema.agentOutputs)
        .set({ status: "failed", completedAt: now() })
        .where(eq(schema.agentOutputs.id, outputId))
        .run();
    }
    res.status(500).json({ error: err?.message ?? `阶段 "${STAGE_LABELS[stage as StageName]}" 执行失败` });
  }
});

// POST /novels/:novelId/pipeline/stages/:stage/confirm - kept for compatibility
router.post("/novels/:novelId/pipeline/stages/:stage/confirm", async (req, res) => {
  const { novelId, stage } = req.params;

  if (!validateStage(stage)) {
    res.status(400).json({ error: `无效的阶段: ${stage}` });
    return;
  }

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const keys = settingsService.getApiKeys();
  const agentModels = getAgentModels();
  const orch = getOrCreateOrchestrator(novelId, novelDir, keys, agentModels as any);
  await orch.init();

  try {
    const hasMore = await orch.confirmStage(stage as StageName);

    res.json({
      status: "confirmed",
      stage,
      hasMoreWork: hasMore,
      message: hasMore
        ? `阶段 "${STAGE_LABELS[stage as StageName]}" 还有更多工作，继续执行`
        : `阶段 "${STAGE_LABELS[stage as StageName]}" 已确认`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "确认失败" });
  }
});

// POST /novels/:novelId/pipeline/stages/:stage/modify - modify stage output and propagate
router.post("/novels/:novelId/pipeline/stages/:stage/modify", async (req, res) => {
  const { novelId, stage } = req.params;
  const { content } = req.body ?? {};

  if (!validateStage(stage)) {
    res.status(400).json({ error: `无效的阶段: ${stage}` });
    return;
  }

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const keys = settingsService.getApiKeys();
  const agentModels = getAgentModels();
  const orch = getOrCreateOrchestrator(novelId, novelDir, keys, agentModels as any);
  await orch.init();

  try {
    // If new content provided, write it to the stage's output files
    if (content) {
      const def = getStageDefinition(stage as StageName);
      if (def) {
        const outputPath = AGENT_FILE_MAP[def.agentType];
        if (outputPath) {
          await fileService.writeWorkspaceFile(novelId, outputPath, content);
        }
      }
    }

    // Propagate changes to downstream stages
    const affected = await orch.onStageModified(stage as StageName);

    res.json({
      status: "modified",
      stage,
      affectedStages: affected,
      message:
        affected.length > 0
          ? `已修改阶段 "${STAGE_LABELS[stage as StageName]}"，以下阶段需要更新: ${affected.map((s) => STAGE_LABELS[s]).join(", ")}`
          : `已修改阶段 "${STAGE_LABELS[stage as StageName]}"，无下游阶段受影响`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "修改失败" });
  }
});

// GET /novels/:novelId/pipeline/stages/:stage/output - get stage output content
router.get("/novels/:novelId/pipeline/stages/:stage/output", async (req, res) => {
  const { novelId, stage } = req.params;

  if (!validateStage(stage)) {
    res.status(400).json({ error: `无效的阶段: ${stage}` });
    return;
  }

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const def = getStageDefinition(stage as StageName);
  if (!def) {
    res.status(404).json({ error: "阶段定义未找到" });
    return;
  }

  // Read the agent's output file
  const outputPath = AGENT_FILE_MAP[def.agentType];
  let content = "";

  if (outputPath) {
    content = await fileService.readWorkspaceFile(novelId, outputPath);
  }

  res.json({
    stage,
    label: def.label,
    content,
    hasContent: content.length > 0,
  });
});

// GET /novels/:novelId/pipeline/stages/:stage/stream - SSE for stage execution
router.get("/novels/:novelId/pipeline/stages/:stage/stream", async (req, res) => {
  const { novelId, stage } = req.params;

  if (!validateStage(stage)) {
    res.status(400).json({ error: `无效的阶段: ${stage}` });
    return;
  }

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const novelDir = fileService.getNovelDir(novelId);
  const keys = settingsService.getApiKeys();
  const agentModels = getAgentModels();
  const orch = getOrCreateOrchestrator(novelId, novelDir, keys, agentModels as any);
  await orch.init();

  const tracker = orch.getStateTracker();

  // Send initial state
  const state = tracker.getState(stage as StageName);
  res.write(`data: ${JSON.stringify({ type: "status", stage, status: state.status })}\n\n`);

  // Listen for orchestrator events
  const onStageStart = (s: StageName) => {
    if (s === stage) {
      res.write(`data: ${JSON.stringify({ type: "status", stage, status: "in_progress" })}\n\n`);
    }
  };

  const onStageOutput = (s: StageName, result: any) => {
    if (s === stage) {
      res.write(
        `data: ${JSON.stringify({ type: "output", stage, output: result.output?.slice(0, 500), success: result.success })}\n\n`,
      );
    }
  };

  const onStageConfirmed = (s: StageName) => {
    if (s === stage) {
      res.write(`data: ${JSON.stringify({ type: "status", stage, status: "confirmed" })}\n\n`);
      cleanup();
      res.write(`data: ${JSON.stringify({ type: "done", stage, status: "confirmed" })}\n\n`);
      res.end();
    }
  };

  const onStageFailed = (s: StageName, error: string) => {
    if (s === stage) {
      res.write(`data: ${JSON.stringify({ type: "error", stage, error })}\n\n`);
      cleanup();
      res.write(`data: ${JSON.stringify({ type: "done", stage, status: "failed" })}\n\n`);
      res.end();
    }
  };

  const cleanup = () => {
    orch.off("stage:start", onStageStart);
    orch.off("stage:output", onStageOutput);
    orch.off("stage:confirmed", onStageConfirmed);
    orch.off("stage:failed", onStageFailed);
  };

  orch.on("stage:start", onStageStart);
  orch.on("stage:output", onStageOutput);
  orch.on("stage:confirmed", onStageConfirmed);
  orch.on("stage:failed", onStageFailed);

  // If already in a terminal state, close immediately
  if (state.status === "confirmed" || state.status === "not_started") {
    res.write(`data: ${JSON.stringify({ type: "done", stage, status: state.status })}\n\n`);
    cleanup();
    res.end();
  }

  req.on("close", () => {
    cleanup();
  });
});

// POST /novels/:novelId/pipeline/reset - reset pipeline state
router.post("/novels/:novelId/pipeline/reset", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  db.delete(schema.pipelineState).where(eq(schema.pipelineState.novelId, novelId)).run();

  res.json({ status: "reset", message: "Pipeline 状态已重置" });
});

export const pipelineRoutes = router;
