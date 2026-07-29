/**
 * 章节写作循环服务（review-fix 循环门 + 动态写作空间注入）。
 *
 * 流程（对齐 skill 章节写作流程）：
 *   确保实体索引 -> 组装动态上下文(角色状态+本章伏笔)注入 chapter-writer
 *   -> 写作 -> 确定性 prose 检查（blocking 先修）-> 编辑审核 -> verdict
 *   -> 未过则定向修复 -> 重新审核 -> 最多 maxRounds 轮 -> 通过则确认 + 更新实体状态
 *
 * 通过条件（与 skill 一致）：grade === "A" && severe === 0 && normal === 0。
 */

import { createAgent } from "../agents/index.js";
import { ChapterWriterAgent } from "../agents/chapter-writer.js";
import { EditorAgent } from "../agents/editor.js";
import { checkProse, type ProseReport } from "../utils/prose-check.js";
import { parseReviewVerdict, type Verdict } from "../utils/verdict.js";
import { readFileSafe, listFiles } from "../utils/file.js";
import type { AgentType, AgentModelAssignment } from "@fictia/shared";
import * as path from "path";
import { entityStats } from "./entity-store.js";
import {
  indexAllEntities,
  updateEntitiesFromChapterNotes,
} from "./entity.service.js";
import { getSummary } from "./chapter-summary-store.js";
import { runConsistencyCheck, checkMilestone, countChapters } from "./milestone.service.js";
import { getOrCreateOrchestrator } from "./pipeline.service.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, schema } from "../db/index.js";
import { summarizeTrace } from "./file.service.js";

export type LoopPhase =
  | "writing"
  | "prose-check"
  | "prose-fix"
  | "reviewing"
  | "review-fix"
  | "done"
  | "aborted";

export interface LoopProgress {
  phase: LoopPhase;
  round: number;
  message: string;
  prose?: { blocking: number; advisory: number };
  verdict?: Verdict;
}

export interface LoopResult {
  chapterNumber: number;
  chapterPath: string;
  reviewPath: string;
  rounds: number;
  passed: boolean;
  finalVerdict: Verdict | null;
  proseBlockingRemaining: number;
  proseAdvisory: number;
  entitiesUpdated: number;
  /** 本章摘要链生成结果：llm=LLM 蒸馏，fallback=确定性兜底，null=未生成/失败。 */
  summarySource?: "llm" | "fallback" | null;
}

export type ProgressCb = (p: LoopProgress) => void;

/** 自动驾驶停止原因。 */
export type AutopilotStopReason = "completed" | "quality" | "milestone" | "range" | "aborted";

export interface AutopilotOptions {
  startChapter?: number;
  endChapter?: number;
  maxRounds?: number;
  /** 里程碑一致性校验失败时暂停（默认 true）。 */
  stopOnMilestoneFail?: boolean;
  /** 连续未通过章数上限，达此暂停（默认 2）。 */
  maxConsecutiveFails?: number;
}

export interface AutopilotEvent {
  type: "chapter_start" | "chapter_done" | "chapter_failed" | "milestone_start" | "milestone_done" | "autopilot_done";
  chapter?: number;
  result?: LoopResult;
  consistencyPassed?: boolean;
  chaptersWritten?: number;
  message?: string;
}

export interface AutopilotResult {
  chaptersWritten: number;
  lastChapter: number | null;
  stopped: AutopilotStopReason;
}

export class WritingLoopService {
  constructor(
    private readonly novelId: string,
    private readonly novelDir: string,
    private readonly agentModels?: Partial<Record<AgentType, AgentModelAssignment>>,
  ) {}

  /**
   * 找下一个待写章节号（outline 中有、chapters/ 中无）。无则 null。
   */
  async findNextChapter(): Promise<number | null> {
    const outlineDir = path.join(this.novelDir, "outline", "chapters");
    const outlineFiles = await listFiles(outlineDir, { extensions: [".md"] });
    if (outlineFiles.length === 0) return null;
    const total = outlineFiles.length;

    const written = new Set<number>();
    try {
      const acts = await listFiles(path.join(this.novelDir, "chapters"), {
        recursive: true,
        extensions: [".md"],
      });
      for (const f of acts) {
        const m = path.basename(f).match(/^ch(\d+)\.md$/);
        if (m) written.add(Number(m[1]));
      }
    } catch {
      // chapters/ 不存在
    }

    for (let i = 1; i <= total; i++) {
      if (!written.has(i)) return i;
    }
    return null;
  }

  /**
   * 运行单章完整循环。
   */
  async runChapterLoop(
    chapterNumber: number,
    maxRounds = 3,
    onProgress?: ProgressCb,
    options?: { incrementalTarget?: string; userDirective?: string; isRedo?: boolean; traceFilename?: string },
  ): Promise<LoopResult> {
    const writer = createAgent("chapter-writer", this.novelDir, this.agentModels) as ChapterWriterAgent;
    const editor = createAgent("editor", this.novelDir, this.agentModels) as EditorAgent;
    // 注入调试 trace + agent_outputs 记录（与 pipeline runStage 对齐）。下沉到 service 层，
    // 让 runChapterLoop 的所有调用方（端点直调 / autopilot 内部）都自动落 trace + 调试任务。
    const traceFilename = options?.traceFilename ?? `chapter-writer-${Date.now()}.trace.json`;
    writer.traceFilename = traceFilename;
    const outputId = uuid();
    db.insert(schema.agentOutputs)
      .values({
        id: outputId,
        novelId: this.novelId,
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
    let passed = false;
    try {

    const chapterPath = await this.resolveChapterPath(chapterNumber);
    const reviewPath = `reviews/ch${String(chapterNumber).padStart(2, "0")}-review.md`;
    const emit = (p: LoopProgress) => onProgress?.(p);

    // 确保实体已索引（首次）。上下文改由 chapter-writer 推→拉（todoGuidance 引导
    // get_summary_chain/get_character/get_foreshadow 自取），不再注入 extraContext。
    const stats = entityStats(this.novelId);
    if (stats.characters === 0) {
      try {
        await indexAllEntities(this.novelId);
      } catch {
        // 索引失败不阻塞写作
      }
    }

    // 第 0 轮：写作（options 透传：支持重写已有章节 incrementalTarget/userDirective）
    emit({ phase: "writing", round: 0, message: `写作第 ${chapterNumber} 章` });
    await writer.writeChapter(chapterNumber, options);

    // 阶段 1a：确定性 prose 检查（blocking 必须先修，不消耗审核轮次，最多 3 次内部修复）
    let proseBlockingRemaining = 0;
    let proseAdvisory = 0;
    for (let i = 0; i < 3; i++) {
      const chapterText = (await readFileSafe(path.join(this.novelDir, chapterPath))) ?? "";
      const prose = checkProse(chapterText);
      proseAdvisory = prose.advisory.length;
      proseBlockingRemaining = prose.blocking.length;
      emit({
        phase: "prose-check",
        round: i + 1,
        message: `确定性检测：blocking=${prose.blocking.length} advisory=${prose.advisory.length}`,
        prose: { blocking: prose.blocking.length, advisory: prose.advisory.length },
      });
      if (prose.blocking.length === 0) break;
      emit({
        phase: "prose-fix",
        round: i + 1,
        message: `修复 ${prose.blocking.length} 条 blocking prose 问题`,
      });
      await writer.writeChapter(chapterNumber, { userDirective: proseFixDirective(prose) });
    }

    // 阶段 2：审核-修复循环（最多 maxRounds 轮）
    let verdict: Verdict | null = null;
    let round = 0;
    for (round = 1; round <= maxRounds; round++) {
      emit({ phase: "reviewing", round, message: `第 ${round} 轮编辑审核` });
      await editor.reviewChapter(chapterPath);

      const reviewText = (await readFileSafe(path.join(this.novelDir, reviewPath))) ?? "";
      verdict = parseReviewVerdict(reviewText);
      emit({
        phase: "reviewing",
        round,
        message: `verdict: grade=${verdict.grade ?? "?"} severe=${verdict.severe} normal=${verdict.normal} passed=${verdict.passed}`,
        verdict,
      });

      if (verdict.passed) {
        // 通过：更新实体状态（从本章写作备注），供下一章动态上下文使用
        let entitiesUpdated = 0;
        try {
          const r = await updateEntitiesFromChapterNotes(this.novelId, chapterNumber);
          entitiesUpdated = r.updated;
        } catch {
          // 状态更新失败不阻塞
        }
        // 摘要现由 chapter-writer.run 统一生成（手动触发也覆盖）；此处仅探测是否成功，
        // 不再重复调 LLM，避免与 chapter-writer.run 双重生成。
        let summarySource: "llm" | "fallback" | null = null;
        try {
          if (getSummary(this.novelId, chapterNumber)) summarySource = "llm";
        } catch {
          // 探测失败不阻塞
        }
        emit({
          phase: "done",
          round,
          message: `第 ${chapterNumber} 章通过（${round} 轮），实体状态更新 ${entitiesUpdated} 条，摘要=${summarySource ?? "无"}`,
        });
        // 补同步：写通过后确认 chapters stage（pipelineStatus 按字段判定、不按文件推算，
        // 故需显式 confirm，否则 chapters stage 状态不推进）。chapters 是增量 stage，每写一章
        // confirm 一次不阻碍下一章。
        try {
          const orch = getOrCreateOrchestrator(this.novelId, this.novelDir);
          await orch.init();
          await orch.confirmStage("chapters");
        } catch {
          // 状态同步失败不阻塞写作
        }
        passed = true;
        return {
          chapterNumber,
          chapterPath,
          reviewPath,
          rounds: round,
          passed: true,
          finalVerdict: verdict,
          proseBlockingRemaining,
          proseAdvisory,
          entitiesUpdated,
          summarySource,
        };
      }

      emit({
        phase: "review-fix",
        round,
        message: `按审核报告修复（severe=${verdict.severe} normal=${verdict.normal}）`,
      });
      await writer.writeChapter(chapterNumber, {
        userDirective: reviewFixDirective(verdict, reviewText),
      });
    }

    // maxRounds 仍未通过：中止，交用户决定
    emit({ phase: "aborted", round: maxRounds, message: `${maxRounds} 轮未通过，交用户决定` });
    return {
      chapterNumber,
      chapterPath,
      reviewPath,
      rounds: maxRounds,
      passed: false,
      finalVerdict: verdict,
      proseBlockingRemaining,
      proseAdvisory,
      entitiesUpdated: 0,
    };
    } finally {
      // 回填 agent_outputs（用 chapter-writer 的 trace 汇总 model/轮次/工具数）
      try {
        db.update(schema.agentOutputs)
          .set({
            status: passed ? "completed" : "failed",
            tokensOutput: 0,
            ...summarizeTrace(writer.lastTrace),
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.agentOutputs.id, outputId))
          .run();
      } catch {
        // 回填失败不阻塞
      }
    }
  }

  /**
   * 自动驾驶：连续写多章，直到完成/质量不达标/里程碑校验失败/达到 endChapter。
   * 每章走 runChapterLoop（含实体更新 + 摘要生成）；每 5 章触发 runConsistencyCheck。
   */
  async runAutopilot(
    options: AutopilotOptions = {},
    onProgress?: (e: AutopilotEvent) => void,
  ): Promise<AutopilotResult> {
    const maxRounds = options.maxRounds ?? 3;
    const maxFails = options.maxConsecutiveFails ?? 2;
    let chaptersWritten = 0;
    let lastChapter: number | null = null;
    let consecutiveFails = 0;
    let next = options.startChapter ?? await this.findNextChapter();

    while (next !== null) {
      if (options.endChapter && next > options.endChapter) {
        return { chaptersWritten, lastChapter, stopped: "range" };
      }
      onProgress?.({ type: "chapter_start", chapter: next });
      try {
        const result = await this.runChapterLoop(next, maxRounds);
        if (result.passed) {
          onProgress?.({ type: "chapter_done", chapter: next, result });
          chaptersWritten++;
          lastChapter = next;
          consecutiveFails = 0;
          // 里程碑一致性校验（每 5 章）
          const cnt = await countChapters(this.novelDir);
          const ms = checkMilestone(cnt);
          if (ms?.reached) {
            onProgress?.({ type: "milestone_start", chapter: next, message: `第${next}章里程碑，运行一致性校验` });
            const cr = await runConsistencyCheck(this.novelDir, this.agentModels, () => {});
            onProgress?.({ type: "milestone_done", chapter: next, consistencyPassed: cr.passed });
            if (!cr.passed && options.stopOnMilestoneFail !== false) {
              return { chaptersWritten, lastChapter, stopped: "milestone" };
            }
          }
        } else {
          consecutiveFails++;
          onProgress?.({ type: "chapter_failed", chapter: next, result, message: "未通过审核" });
          if (consecutiveFails >= maxFails) {
            return { chaptersWritten, lastChapter, stopped: "quality" };
          }
        }
      } catch (e: any) {
        consecutiveFails++;
        onProgress?.({ type: "chapter_failed", chapter: next, message: e?.message ?? "写作异常" });
        if (consecutiveFails >= maxFails) {
          return { chaptersWritten, lastChapter, stopped: "quality" };
        }
      }
      next = await this.findNextChapter();
    }
    onProgress?.({ type: "autopilot_done", chaptersWritten });
    return { chaptersWritten, lastChapter, stopped: "completed" };
  }

  /**
   * 解析章节文件相对路径：优先在现有 act 目录中找；找不到（尚未写作）用默认 act。
   */
  private async resolveChapterPath(chapterNumber: number): Promise<string> {
    const num = String(chapterNumber).padStart(2, "0");
    try {
      const files = await listFiles(path.join(this.novelDir, "chapters"), {
        recursive: true,
        extensions: [".md"],
      });
      const match = files.find((f) => path.basename(f) === `ch${num}.md`);
      if (match) {
        return path.relative(this.novelDir, match).replace(/\\/g, "/");
      }
    } catch {
      // chapters/ 不存在
    }
    const act = chapterNumber <= 7 ? 1 : chapterNumber <= 14 ? 2 : 3;
    return `chapters/act-${act}/ch${num}.md`;
  }
}

/**
 * 把 blocking prose findings 转成给写手的修复指令。
 */
function proseFixDirective(prose: ProseReport): string {
  const lines = prose.blocking.map(
    (f, i) =>
      `${i + 1}. [${f.type}] 第${f.line}行：${f.message}\n   原文片段：${f.excerpt}`,
  );
  return [
    "确定性 AI 味检测发现以下必须修复的 blocking 问题，请逐条改写。",
    "要求：不新增情节，不改变人物行为和事件，只调整表达方式消除 AI 腔。",
    "",
    ...lines,
  ].join("\n");
}

/**
 * 把审核 verdict + 报告转成给写手的修复指令。
 */
function reviewFixDirective(verdict: Verdict, reviewText: string): string {
  return [
    `编辑审核未通过（评分 ${verdict.grade ?? "?"}，严重 ${verdict.severe}，一般 ${verdict.normal}）。`,
    "请按审核报告中的问题逐条修复：",
    "- 严重问题和一般问题必须全部解决",
    "- 严格遵循 style-guide.md，不要自由发挥风格",
    "- 不要新增或删减核心情节，只针对问题改写",
    "",
    "审核报告：",
    "",
    reviewText,
  ].join("\n");
}
