/**
 * 里程碑一致性校验。
 *
 * 对齐 skill 的「里程碑一致性校验」：每确认 5 章（ch05/ch10/...）提醒做一致性校验，
 * 可跳过、不阻塞新章节写作。立即校验走 consistency-checker + parseConsistencyVerdict。
 *
 * 注：skill 的 2 轮自动修复循环需「按报告修复问题章节 -> 重新审核」，涉及章节级手术，
 * 本版暂为单次校验 + verdict；失败时返回报告供用户手动修订章节后重跑。
 */

import { createAgent } from "../agents/index.js";
import { ConsistencyCheckerAgent } from "../agents/consistency-checker.js";
import { ChapterWriterAgent } from "../agents/chapter-writer.js";
import { parseConsistencyVerdict, judgeVerdict, type Verdict } from "../utils/verdict.js";
import { readFileSafe } from "../utils/file.js";
import { listChapterFiles } from "../utils/chapter-files.js";
import { settingsService } from "./settings.service.js";
import type { AgentType, AgentModelAssignment } from "@fictia/shared";
import * as path from "path";

export interface MilestoneCheck {
  reached: boolean;
  chapter: number;
}

export interface ConsistencyResult {
  reportPath: string;
  verdict: Verdict;
  passed: boolean;
}

export type ConsistencyProgressCb = (p: {
  phase: "checking" | "verdict" | "fixing" | "done";
  message: string;
  verdict?: Verdict;
}) => void;

/**
 * 统计已写作章节数。走 listChapterFiles 统一解析（兼容 chXX 与 chXX_actN-标题
 * 命名）——旧手写正则 / ^ch\d+\.md$/ 在 act 动态命名下恒为 0，导致里程碑
 * 校验从未触发。
 */
export async function countChapters(novelDir: string): Promise<number> {
  try {
    return (await listChapterFiles(novelDir)).length;
  } catch {
    return 0;
  }
}

/**
 * 每 5 章里程碑检查：count > 0 且 count % 5 === 0 时 reached。
 */
export function checkMilestone(count: number): MilestoneCheck | null {
  if (count > 0 && count % 5 === 0) {
    return { reached: true, chapter: count };
  }
  return null;
}

/**
 * 运行一致性校验：consistency-checker -> 解析 verdict。
 * 单次校验（不自动修复）。修复闭环见 runConsistencyLoop。
 */
export async function runConsistencyCheck(
  novelDir: string,
  agentModels?: Partial<Record<AgentType, AgentModelAssignment>>,
  onProgress?: ConsistencyProgressCb,
): Promise<ConsistencyResult> {
  const checker = createAgent(
    "consistency-checker",
    novelDir,
    agentModels,
  ) as ConsistencyCheckerAgent;
  const reportPath = "reviews/consistency-report.md";

  onProgress?.({ phase: "checking", message: "运行一致性校验" });
  await checker.run();

  const reportText = (await readFileSafe(path.join(novelDir, reportPath))) ?? "";
  const verdict = parseConsistencyVerdict(reportText);
  onProgress?.({
    phase: "verdict",
    message: `grade=${verdict.grade ?? "?"} severe=${verdict.severe} normal=${verdict.normal} passed=${verdict.passed}`,
    verdict,
  });

  return { reportPath, verdict, passed: verdict.passed };
}

export interface ConsistencyLoopResult {
  reportPath: string;
  rounds: number;
  passed: boolean;
  /** 三级结果（judgeVerdict）：pass / warn（报告在，交用户复核）/ fail。 */
  outcome: "pass" | "warn" | "fail";
  warnings: string[];
  finalVerdict: Verdict | null;
}

/**
 * 一致性校验 + 修复闭环：check -> 未过则按报告定向修复（chapter-writer，可跨章
 * /设定文档）-> 复检，最多 maxFixRounds 轮修复。
 *
 * 修复后仍未满分时按策略分级（与写作循环同一套 judgeVerdict）：
 * warn 交用户复核（报告与警告透出，不阻塞），fail 交用户处理。
 * 修复 agent 异常不吞掉——向上抛给调用方（autopilot / SSE 端点自行处理）。
 */
export async function runConsistencyLoop(
  novelDir: string,
  agentModels?: Partial<Record<AgentType, AgentModelAssignment>>,
  onProgress?: ConsistencyProgressCb,
  options?: { maxFixRounds?: number },
): Promise<ConsistencyLoopResult> {
  const maxFixRounds = options?.maxFixRounds ?? 1;
  const reportPath = "reviews/consistency-report.md";
  const checker = createAgent(
    "consistency-checker",
    novelDir,
    agentModels,
  ) as ConsistencyCheckerAgent;
  const writer = createAgent("chapter-writer", novelDir, agentModels) as ChapterWriterAgent;

  let verdict: Verdict | null = null;
  let rounds = 0;
  for (;;) {
    onProgress?.({ phase: "checking", message: `运行一致性校验（第 ${rounds + 1} 次）` });
    await checker.run();
    const reportText = (await readFileSafe(path.join(novelDir, reportPath))) ?? "";
    verdict = parseConsistencyVerdict(reportText);
    onProgress?.({
      phase: "verdict",
      message: `grade=${verdict.grade ?? "?"} severe=${verdict.severe} normal=${verdict.normal} passed=${verdict.passed}`,
      verdict,
    });

    if (verdict.passed) {
      onProgress?.({ phase: "done", message: "一致性校验通过", verdict });
      return {
        reportPath,
        rounds,
        passed: true,
        outcome: "pass",
        warnings: [],
        finalVerdict: verdict,
      };
    }

    // 修复轮次用尽：按策略分级交用户
    if (rounds >= maxFixRounds) break;

    // 按报告定向修复（chapter-writer.applyConsistencyFix）
    rounds += 1;
    onProgress?.({
      phase: "fixing",
      message: `按一致性报告修复（severe=${verdict.severe} normal=${verdict.normal}，第 ${rounds}/${maxFixRounds} 轮）`,
    });
    await writer.applyConsistencyFix(reportText);
  }

  const judgement = judgeVerdict(verdict!, settingsService.getReviewPolicy());
  const warnings = [
    `一致性校验未达满分（${rounds} 轮修复后）：${judgement.reason}。`,
    "报告见 reviews/consistency-report.md。可按报告手工修订相关章节/设定后重跑校验。",
  ];
  onProgress?.({
    phase: "done",
    message: `一致性校验${judgement.level === "fail" ? "未通过" : "未达满分"}：${judgement.reason}`,
    verdict: verdict!,
  });
  return {
    reportPath,
    rounds,
    passed: false,
    outcome: judgement.level,
    warnings,
    finalVerdict: verdict,
  };
}
