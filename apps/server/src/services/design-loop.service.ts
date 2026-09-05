/**
 * 设计阶段 review-fix 循环（B 层 LLM 审核）。
 *
 * 结构对标 writing-loop.service.ts:runChapterLoop（产出 -> 审核 -> review-fix），
 * 把 chapter-writer 换成 design agent、editor 换成 design-reviewer：
 *   design agent 产出 -> design-reviewer 审核 -> parseReviewVerdict
 *   -> 通过则 confirmStage；不通过则按审核报告 review-fix 重做 -> 最多 maxRounds 轮
 *
 * agent_outputs + trace 注入与 writing-loop 对齐（service 层下沉，覆盖所有调用方）。
 * 通过条件复用 parseReviewVerdict：grade A + severe 0 + normal 0。
 */
import { createAgent } from "../agents/index.js";
import { DesignReviewerAgent } from "../agents/design-reviewer.js";
import { parseReviewVerdict, judgeVerdict, type Verdict } from "../utils/verdict.js";
import { readFileSafe } from "../utils/file.js";
import type { AgentType, StageName, AgentModelAssignment } from "@fictia/shared";
import { STAGE_TO_AGENT } from "@fictia/shared";
import { getOrCreateOrchestrator } from "./pipeline.service.js";
import { settingsService } from "./settings.service.js";
import { summarizeTrace } from "./file.service.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, schema } from "../db/index.js";
import * as path from "path";

export interface DesignLoopProgress {
  phase: string;
  round: number;
  message: string;
  verdict?: Verdict;
}

export interface DesignLoopResult {
  stageName: string;
  rounds: number;
  passed: boolean;
  /** 三级结果：pass=完全通过；warn=产物成立但审核未满分（已 confirm，交用户复核）；fail=未通过。 */
  outcome: "pass" | "warn" | "fail";
  /** warn 时的警告明细。 */
  warnings: string[];
  finalVerdict: Verdict | null;
}

/** 可走 design-loop 的设计 stage。 */
const DESIGN_STAGES: StageName[] = [
  "genre_analysis",
  "architecture",
  "style",
  "art_design",
  "narrative_weave",
  "world",
  "characters",
];

export class DesignLoopService {
  constructor(
    private readonly novelId: string,
    private readonly novelDir: string,
    private readonly agentModels?: Partial<Record<AgentType, AgentModelAssignment>>,
  ) {}

  async runDesignLoop(
    stageName: string,
    maxRounds?: number,
    onProgress?: (p: DesignLoopProgress) => void,
  ): Promise<DesignLoopResult> {
    const designAgentType = STAGE_TO_AGENT[stageName as StageName];
    if (!designAgentType || !DESIGN_STAGES.includes(stageName as StageName)) {
      return { stageName, rounds: 0, passed: false, outcome: "fail", warnings: [], finalVerdict: null };
    }
    const roundsLimit = maxRounds ?? settingsService.getReviewFixRounds();
    const designAgent = createAgent(designAgentType, this.novelDir, this.agentModels);
    const reviewer = createAgent("design-reviewer", this.novelDir, this.agentModels) as DesignReviewerAgent;
    const emit = (p: DesignLoopProgress) => onProgress?.(p);

    // 多段 trace：所有段共享 baseTs 前缀，由 runSegment 逐段设给 designAgent.traceFilename。
    const baseTs = `${Date.now()}`;
    const outputId = uuid();
    db.insert(schema.agentOutputs)
      .values({
        id: outputId,
        novelId: this.novelId,
        chapterId: null,
        agentType: designAgentType,
        stageName: stageName as StageName,
        persona: null,
        filename: "",
        modelUsed: "",
        providerUsed: "",
        status: "running",
        traceFilename: `${designAgentType}-${baseTs}-s0-draft.trace.json`,
        tokensInput: 0,
        tokensOutput: 0,
        cost: 0,
        createdAt: new Date().toISOString(),
        completedAt: null,
      })
      .run();

    let passed = false;
    let finalOutcome: "pass" | "warn" | "fail" = "fail";
    let warnings: string[] = [];
    let verdict: Verdict | null = null;
    let rounds = 0;
    let segSeq = 0;
    /** 段化一次 designAgent.run：独立 trace 文件 + 写 agent_trace_segments 行，
     *  并把 agent_outputs.trace_filename 指向当前段（让 SSE 实时跟进活动段）。 */
    const runSegment = async <T>(
      type: "draft" | "review-fix",
      fn: () => Promise<T>,
    ): Promise<T> => {
      const seq = segSeq++;
      const segTrace = `${designAgentType}-${baseTs}-s${seq}-${type}.trace.json`;
      designAgent.traceFilename = segTrace;
      try {
        db.update(schema.agentOutputs)
          .set({ traceFilename: segTrace })
          .where(eq(schema.agentOutputs.id, outputId))
          .run();
      } catch {
        // trace_filename 更新失败不阻塞
      }
      const startedAt = new Date().toISOString();
      const res = await fn();
      const sum = summarizeTrace(designAgent.lastTrace);
      try {
        db.insert(schema.agentTraceSegments)
          .values({
            id: uuid(),
            agentOutputId: outputId,
            segmentType: type,
            seq,
            traceFilename: segTrace,
            turnCount: sum.turnCount,
            toolCallCount: sum.toolCallCount,
            modelUsed: sum.modelUsed,
            startedAt,
            completedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          })
          .run();
      } catch {
        // 段记录失败不阻塞主流程
      }
      return res;
    };
    try {
      // 第 0 轮：design 产出。产物未落盘（假完成/轮次跑满中断）直接 fail，不进审核循环。
      emit({ phase: "design", round: 0, message: `${stageName} 设计产出` });
      const draftResult = await runSegment("draft", () => designAgent.run({}));
      if (!draftResult.success) {
        const reason = draftResult.error ?? "design agent 未产出核心文件";
        finalOutcome = "fail";
        warnings = [reason];
        emit({
          phase: "aborted",
          round: 0,
          message: `${stageName} 设计产出失败：${reason}${designAgent.lastRunHitTurnLimit ? "（轮次跑满被切断，可在设置调大 agentMaxTurns 重试）" : ""}`,
        });
        return { stageName, rounds: 0, passed: false, outcome: "fail", warnings, finalVerdict: null };
      }

      // review-fix 循环
      for (rounds = 1; rounds <= roundsLimit; rounds++) {
        emit({ phase: "review", round: rounds, message: `第 ${rounds} 轮设计审核` });
        await reviewer.reviewDesign(stageName);
        const reviewPath = path.join(this.novelDir, "reviews", `${stageName}-design-review.md`);
        const reviewText = (await readFileSafe(reviewPath)) ?? "";
        verdict = parseReviewVerdict(reviewText);
        emit({
          phase: "review",
          round: rounds,
          message: `verdict: grade=${verdict.grade ?? "?"} severe=${verdict.severe} normal=${verdict.normal} passed=${verdict.passed}`,
          verdict,
        });

        if (verdict.passed) {
          passed = true;
          break;
        }
        // review-fix：按审核报告重做
        emit({
          phase: "review-fix",
          round: rounds,
          message: `按审核报告修复（severe=${verdict.severe} normal=${verdict.normal}）`,
        });
        const grade = verdict?.grade ?? "?";
        const severe = verdict?.severe ?? 0;
        const normal = verdict?.normal ?? 0;
        await runSegment("review-fix", () =>
          designAgent.run({
            userDirective:
              `设计审核未通过（评分 ${grade}，严重 ${severe}，一般 ${normal}）。` +
              `请按审核报告逐条修复严重/一般问题，重新输出完整设计：\n\n${reviewText}`,
          }),
        );
      }

      // 通过/警告通过则确认 stage（与 writing-loop confirmStage 对齐）。
      // 设计产物（design/*.md 等）已落盘成立：只有策略判 fail 才不 confirm，
      // warn 时照常 confirm 让流程继续，警告交用户复核。
      let confirmed = false;
      if (verdict) {
        const judgement = judgeVerdict(verdict, settingsService.getReviewPolicy());
        if (judgement.level === "pass") {
          passed = true;
          finalOutcome = "pass";
          confirmed = true;
        } else if (judgement.level === "warn") {
          finalOutcome = "warn";
          warnings = [
            `${roundsLimit} 轮设计审核未达满分：${judgement.reason}。`,
            "已按当前版本确认阶段（产物成立）。可人工修改设计文档后重跑本阶段或设计审核。",
          ];
          if (designAgent.lastRunHitTurnLimit) {
            warnings.push("设计阶段触达工具轮次上限被切断，产出可能不完整，建议通读检查。");
          }
          confirmed = true;
        } else {
          finalOutcome = "fail";
          warnings = [judgement.reason];
        }
      }
      if (confirmed) {
        try {
          const orch = getOrCreateOrchestrator(this.novelId, this.novelDir);
          await orch.init();
          await orch.confirmStage(stageName as StageName);
        } catch {
          // 状态同步失败不阻塞
        }
      }
      emit({
        phase: finalOutcome === "fail" ? "aborted" : "done",
        round: rounds,
        message: finalOutcome === "pass"
          ? `${stageName} 审核通过`
          : finalOutcome === "warn"
            ? `${stageName} 警告通过（审核未满分），已确认——建议人工复核`
            : `${stageName} 审核未通过：${warnings[0] ?? "交用户决定"}`,
      });
      return { stageName, rounds, passed, outcome: finalOutcome, warnings, finalVerdict: verdict };
    } finally {
      // 回填 agent_outputs：轮次/工具数按所有段累加
      try {
        const lastSum = summarizeTrace(designAgent.lastTrace);
        const segs = db
          .select()
          .from(schema.agentTraceSegments)
          .where(eq(schema.agentTraceSegments.agentOutputId, outputId))
          .all();
        const totalTurns = segs.reduce((n, s) => n + (s.turnCount ?? 0), 0);
        const totalTools = segs.reduce((n, s) => n + (s.toolCallCount ?? 0), 0);
        const lastSegModel = segs.length > 0 ? segs[segs.length - 1].modelUsed ?? "" : "";
        db.update(schema.agentOutputs)
          .set({
            status: finalOutcome !== "fail" ? "completed" : "failed",
            modelUsed: lastSegModel || lastSum.modelUsed,
            providerUsed: lastSum.providerUsed,
            turnCount: totalTurns,
            toolCallCount: totalTools,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.agentOutputs.id, outputId))
          .run();
      } catch {
        // 回填失败不阻塞
      }
    }
  }
}
