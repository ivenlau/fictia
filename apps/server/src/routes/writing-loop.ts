import { Router } from "express";
import { eq } from "drizzle-orm";
import type { AgentType } from "@fictia/shared";
import { db, schema } from "../db/index.js";
import { novelService } from "../services/novel.service.js";
import { settingsService } from "../services/settings.service.js";
import { fileService } from "../services/file.service.js";
import { WritingLoopService } from "../services/writing-loop.service.js";
import {
  countChapters,
  checkMilestone,
  runConsistencyCheck,
} from "../services/milestone.service.js";

const router = Router();

/** 读取 per-agent 模型配置（与 pipelines.ts 同逻辑）。 */
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
  const { chapterNumber, maxRounds } = req.body ?? {};

  const novel = novelService.getById(novelId);
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  const novelDir = fileService.getNovelDir(novelId);
  const keys = settingsService.getApiKeys();
  const agentModels = getAgentModels();
  const svc = new WritingLoopService(novelDir, keys, agentModels);

  // SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const target =
      typeof chapterNumber === "number"
        ? chapterNumber
        : await svc.findNextChapter();

    if (target === null) {
      send({ type: "done", error: "没有待写的章节" });
      res.end();
      return;
    }

    send({ type: "start", chapterNumber: target });

    const result = await svc.runChapterLoop(target, maxRounds ?? 3, (p) =>
      send({ type: "progress", ...p }),
    );

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
  const keys = settingsService.getApiKeys();
  const agentModels = getAgentModels();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    send({ type: "start" });
    const result = await runConsistencyCheck(novelDir, keys, agentModels, (p) =>
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

export const writingLoopRoutes = router;
