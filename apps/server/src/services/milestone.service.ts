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
import { parseConsistencyVerdict, type Verdict } from "../utils/verdict.js";
import { readFileSafe, listFiles } from "../utils/file.js";
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
  phase: "checking" | "verdict";
  message: string;
  verdict?: Verdict;
}) => void;

/**
 * 统计已写作章节数（chapters/act-N/chNN.md 文件数）。
 */
export async function countChapters(novelDir: string): Promise<number> {
  try {
    const files = await listFiles(path.join(novelDir, "chapters"), {
      recursive: true,
      extensions: [".md"],
    });
    return files.filter((f) => /^ch\d+\.md$/.test(path.basename(f))).length;
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
 * 单次校验（auto-fix 章节 + 复查的 2 轮循环暂未实现）。
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
