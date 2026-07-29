import { Router } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { AgentType, AgentModelAssignment } from "@fictia/shared";
import { db, schema } from "../db/index.js";
import { novelService } from "../services/novel.service.js";
import { fileService, summarizeTrace } from "../services/file.service.js";
import { WritingLoopService } from "../services/writing-loop.service.js";
import {
  countChapters,
  checkMilestone,
  runConsistencyCheck,
} from "../services/milestone.service.js";

const router = Router();

/** 读取 per-agent 模型配置（与 pipelines.ts 同逻辑）。 */
function getAgentModels(): Partial<Record<AgentType, AgentModelAssignment>> | undefined {
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

/**
 * POST /novels/:novelId/writing-loop
 *   body: { chapterNumber?: number, maxRounds?: number }
 *
 * 运行单章写作循环（写作 -> prose 检查 -> 审核 -> 修复 -> 最多 maxRounds 轮）。
 * 响应为 SSE：progress 事件 + 最终 result/done 事件。
 * 通过后若到达里程碑（每 5 章），发送 milestone 事件提醒做一致性校验。
 */
router.post("/novels/:novelId/writing-loop", async (req, res) => {
  const { novelId } = req.params;
  const { chapterNumber, maxRounds, incrementalTarget, userDirective, isRedo } = req.body ?? {};

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const agentModels = getAgentModels();
  const svc = new WritingLoopService(novelId, novelDir, agentModels);

  // SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let outputId: string | null = null;
  let traceFilename: string | null = null;
  try {
    let target: number | null = typeof chapterNumber === "number" ? chapterNumber : null;
    if (target === null && typeof incrementalTarget === "string") {
      // 重写已有章节：从 incrementalTarget 文件路径解析章号（chXX）
      const m = incrementalTarget.match(/ch(\d+)/i);
      if (m) target = Number(m[1]);
    }
    if (target === null) target = await svc.findNextChapter();

    if (target === null) {
      send({ type: "done", error: "没有待写的章节" });
      res.end();
      return;
    }

    send({ type: "start", chapterNumber: target });

    // 注入调试任务记录（agent_outputs）+ trace，与 pipeline runStage 对齐
    traceFilename = `chapter-writer-${Date.now()}.trace.json`;
    outputId = uuid();
    db.insert(schema.agentOutputs)
      .values({
        id: outputId,
        novelId,
        chapterId: null,
        agentType: "chapter-writer",
        stageName: "chapters",
        persona: null,
        filename: "",
        modelUsed: "",
        providerUsed: "",
        status: "running",
        traceFilename,
        tokensInput: 0,
        tokensOutput: 0,
        cost: 0,
        createdAt: new Date().toISOString(),
        completedAt: null,
      })
      .run();

    const result = await svc.runChapterLoop(
      target,
      maxRounds ?? 3,
      (p) => send({ type: "progress", ...p }),
      { incrementalTarget, userDirective, isRedo, traceFilename },
    );

    // 回填 agent_outputs（用 trace 汇总 model/轮次/工具数）
    const trace = await fileService.readAgentTrace(novelId, traceFilename);
    db.update(schema.agentOutputs)
      .set({
        status: result.passed ? "completed" : "failed",
        tokensOutput: 0,
        ...summarizeTrace(trace),
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.agentOutputs.id, outputId))
      .run();

    send({ type: "result", result });

    // 通过后检查里程碑（每 5 章提醒一致性校验，不阻塞）
    if (result.passed) {
      const cnt = await countChapters(novelDir);
      const ms = checkMilestone(cnt);
      if (ms) {
        send({
          type: "milestone",
          chapter: ms.chapter,
          message: `已确认 ${ms.chapter} 章，建议做一致性校验`,
        });
      }
    }

    send({ type: "done", passed: result.passed, rounds: result.rounds });
  } catch (err: any) {
    if (outputId) {
      const trace = traceFilename ? await fileService.readAgentTrace(novelId, traceFilename) : null;
      db.update(schema.agentOutputs)
        .set({
          status: "failed",
          ...summarizeTrace(trace),
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.agentOutputs.id, outputId))
        .run();
    }
    send({ type: "error", error: err?.message ?? "写作循环失败" });
  } finally {
    res.end();
  }

  req.on("close", () => {
    // v1 不支持中途取消；连接关闭后循环仍跑完，结果丢弃
  });
});

/**
 * POST /novels/:novelId/consistency-check
 *
 * 运行一致性校验（consistency-checker -> verdict）。SSE 流式进度 + 结果。
 * 失败时返回报告，供用户手动修订章节后重跑。
 */
router.post("/novels/:novelId/consistency-check", async (req, res) => {
  const { novelId } = req.params;
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const agentModels = getAgentModels();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    send({ type: "start" });
    const result = await runConsistencyCheck(novelDir, agentModels, (p) =>
      send({ type: "progress", ...p }),
    );
    send({ type: "result", result });
    send({ type: "done", passed: result.passed });
  } catch (err: any) {
    send({ type: "error", error: err?.message ?? "一致性校验失败" });
  } finally {
    res.end();
  }
});

/**
 * POST /novels/:novelId/autopilot
 *   body: { startChapter?, endChapter?, maxRounds?, stopOnMilestoneFail?, maxConsecutiveFails? }
 *
 * 自动驾驶：连续写多章。SSE 推 chapter_start/done/failed + milestone + done。
 * 停止条件：全部完成 / 连续质量不达标 / 里程碑校验失败 / 达 endChapter。
 */
router.post("/novels/:novelId/autopilot", async (req, res) => {
  const { novelId } = req.params;
  const { startChapter, endChapter, maxRounds, stopOnMilestoneFail, maxConsecutiveFails } = req.body ?? {};
  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const novelDir = fileService.getNovelDir(novelId);
  const agentModels = getAgentModels();
  const svc = new WritingLoopService(novelId, novelDir, agentModels);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (obj: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    send({ type: "start" });
    const result = await svc.runAutopilot(
      { startChapter, endChapter, maxRounds, stopOnMilestoneFail, maxConsecutiveFails },
      (e) => send({ ...e }),
    );
    send({ type: "done", ...result });
  } catch (err: any) {
    send({ type: "error", error: err?.message ?? "自动驾驶失败" });
  } finally {
    res.end();
  }

  req.on("close", () => {
    // v1 不支持中途取消；连接关闭后循环仍跑完，结果丢弃
  });
});

export const writingLoopRoutes = router;
