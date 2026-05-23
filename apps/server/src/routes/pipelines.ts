import { Router } from "express";
import { eq } from "drizzle-orm";
import type { StageName, AgentType } from "@fictia/shared";
import { STAGE_LABELS, AGENT_FILE_MAP } from "@fictia/shared";
import { db, schema } from "../db/index.js";
import { novelService } from "../services/novel.service.js";
import { settingsService } from "../services/settings.service.js";
import {
  getOrCreateOrchestrator,
  writeAgentOutput,
} from "../services/pipeline.service.js";
import { getStageDefinition } from "../core/pipeline.js";
import { StateTracker } from "../core/state-tracker.js";
import { fileService } from "../services/file.service.js";

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
  });
});

// POST /novels/:novelId/pipeline/start - start pipeline from first pending stage
router.post("/novels/:novelId/pipeline/start", async (req, res) => {
  const { novelId } = req.params;
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
    const result = await orch.start();
    if (!result) {
      res.json({ status: "complete", message: "所有阶段已完成" });
      return;
    }

    const nextStage = new StateTracker(novelId);
    await nextStage.load();
    const inProgress = nextStage.getInProgressStage();

    // Write agent output to filesystem
    if (result.success) {
      await writeAgentOutput(novelDir, result);
    }

    res.json({
      status: result.success ? "completed" : "failed",
      stage: inProgress,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Pipeline start failed" });
  }
});

// POST /novels/:novelId/pipeline/stages/:stage - run a specific stage
router.post("/novels/:novelId/pipeline/stages/:stage", async (req, res) => {
  const { novelId, stage } = req.params;
  const { userDirective, isRedo, incrementalTarget } = req.body ?? {};

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
    const result = await orch.runStage(stage as StageName, {
      userDirective,
      isRedo,
      incrementalTarget,
    });

    if (result.success) {
      await writeAgentOutput(novelDir, result);
    }

    res.json({
      status: result.success ? "completed" : "failed",
      stage,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? `阶段 "${STAGE_LABELS[stage as StageName]}" 执行失败` });
  }
});

// POST /novels/:novelId/pipeline/stages/:stage/confirm - confirm a stage's output
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
