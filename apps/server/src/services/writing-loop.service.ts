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
import { checkProse } from "../utils/prose-check.js";
import { parseReviewVerdict, judgeVerdict, type Verdict } from "../utils/verdict.js";
import { readFileSafe, listFiles } from "../utils/file.js";
import { findChapterFile } from "../utils/chapter-files.js";
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
import { settingsService } from "./settings.service.js";
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
  /** 三级结果：pass=完全通过；warn=产物成立但审核未满分（流程继续，交用户复核）；fail=真失败。 */
  outcome: "pass" | "warn" | "fail";
  /** warn 时的警告明细（verdict 摘要 / 轮次跑满提示等）。 */
  warnings: string[];
  finalVerdict: Verdict | null;
  proseBlockingRemaining: number;
  proseAdvisory: number;
  entitiesUpdated: number;
  /** 本章摘要链生成结果：llm=LLM 蒸馏，fallback=确定性兜底，null=未生成/失败。 */
  summarySource?: "llm" | "fallback" | null;
}

export type ProgressCb = (p: LoopProgress) => void;

/** 自动驾驶停止原因。warning_streak = 连续多章仅警告通过，暂停请用户抽查质量。 */
export type AutopilotStopReason = "completed" | "quality" | "warning_streak" | "milestone" | "range" | "aborted";

export interface AutopilotOptions {
  startChapter?: number;
  endChapter?: number;
  maxRounds?: number;
  /** 里程碑一致性校验失败时暂停（默认 true）。 */
  stopOnMilestoneFail?: boolean;
  /** 连续真失败（产物不成立）章数上限，达此暂停（默认 2）。 */
  maxConsecutiveFails?: number;
  /** 连续警告通过（审核未满分但产物成立）章数上限，达此暂停（默认 3，0=不暂停）。 */
  warningStreakLimit?: number;
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
        const m = path.basename(f).match(/^ch(\d+)/);
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
    // 多段 trace：所有段共享 baseTs 前缀（便于关联/清理）。各段文件名
    // chapter-writer-<baseTs>-s<seq>-<type>.trace.json，由 runSegment 逐段设给 writer.traceFilename，
    // 并同步更新 agent_outputs.trace_filename 指向当前段（让 SSE 实时跟进活动段）。
    const baseTs = `${Date.now()}`;
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
        traceFilename: `chapter-writer-${baseTs}-s0-draft.trace.json`,
        tokensInput: 0,
        tokensOutput: 0,
        cost: 0,
        createdAt: new Date().toISOString(),
        completedAt: null,
      })
      .run();
    let passed = false;
    /** 流程完成（完全通过或警告通过）：agent_outputs 状态回填用。 */
    let finished = false;
    let finalOutcome: "pass" | "warn" | "fail" = "fail";
    /** 任一段（draft/prose-fix/review-fix）触达轮次上限：warnings 提示用。 */
    let hitLimitAnySegment = false;
    let segSeq = 0;
    /** 段化一次 writeChapter/applyReviewFix：独立 trace 文件 + 写 agent_trace_segments 行，
     *  并把 agent_outputs.trace_filename 指向当前段（让 SSE 实时跟进活动段）。 */
    const runSegment = async <T>(
      type: "draft" | "prose-fix" | "review-fix",
      fn: () => Promise<T>,
    ): Promise<T> => {
      const seq = segSeq++;
      const segTrace = `chapter-writer-${baseTs}-s${seq}-${type}.trace.json`;
      writer.traceFilename = segTrace;
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
      if (writer.lastRunHitTurnLimit) hitLimitAnySegment = true;
      const sum = summarizeTrace(writer.lastTrace);
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

    const chapterPath = await this.resolveChapterPath(chapterNumber);
    // reviewPath 对齐 editor.ts 命名（基于章节文件 basename），保证 editor 写 / 本处读一致。
    const chapterBasename =
      chapterPath.split("/").pop()?.replace(/\.md$/, "") ??
      `ch${String(chapterNumber).padStart(2, "0")}`;
    const reviewPath = `reviews/${chapterBasename}-review.md`;
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
    const writeResult = await runSegment("draft", () => writer.writeChapter(chapterNumber, options));
    if (!writeResult.success) {
      // 真失败（产物未落盘）：不进 editor 审核循环，让 runAutopilot 的 consecutiveFails
      // 累计触发停止（避免死循环重写同一章）。
      const reason = writeResult.error ?? "agent 未 write_file 落盘";
      if (hitLimitAnySegment) {
        emit({ phase: "aborted", round: 0, message: `写作未产出（轮次跑满被切断）：${reason}` });
      } else {
        emit({ phase: "aborted", round: 0, message: `写作未产出：${reason}` });
      }
      finalOutcome = "fail";
      return {
        chapterNumber, chapterPath, reviewPath,
        rounds: 0, passed: false, outcome: "fail", warnings: [], finalVerdict: null,
        proseBlockingRemaining: 0, proseAdvisory: 0, entitiesUpdated: 0,
      };
    }

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
      await runSegment("prose-fix", () => writer.applyProseFix(chapterNumber, prose));
    }

    // 审核一次（轻量 editor），返回 verdict + 报告全文。
    const doReview = async (
      reviewRound: number,
    ): Promise<{ verdict: Verdict; reviewText: string }> => {
      emit({ phase: "reviewing", round: reviewRound, message: `第 ${reviewRound} 轮编辑审核` });
      // light=true：用 system-light 模板（不注入 craft/参考/style-guide、输出精简），写作循环内审核。
      // 用 editor 返回的报告全文（agent 产出）作主源，避免报告文件命名不一致读空；文件兜底。
      const reviewResult = await editor.reviewChapter(chapterPath, undefined, true);
      const rText =
        reviewResult.output?.trim() ||
        (await readFileSafe(path.join(this.novelDir, reviewPath))) ||
        "";
      const v = parseReviewVerdict(rText);
      emit({
        phase: "reviewing",
        round: reviewRound,
        message: `verdict: grade=${v.grade ?? "?"} severe=${v.severe} normal=${v.normal} passed=${v.passed}`,
        verdict: v,
      });
      return { verdict: v, reviewText: rText };
    };

    // 审核通过（或警告通过）后的收尾：实体更新 + 摘要探测 + confirmStage，返回对应 LoopResult。
    const finalizePass = async (
      reviewRound: number,
      v: Verdict,
      level: "pass" | "warn" = "pass",
      warnings: string[] = [],
    ): Promise<LoopResult> => {
      let entitiesUpdated = 0;
      try {
        const r = await updateEntitiesFromChapterNotes(this.novelId, chapterNumber);
        entitiesUpdated = r.updated;
      } catch {
        // 状态更新失败不阻塞
      }
      let summarySource: "llm" | "fallback" | null = null;
      try {
        if (getSummary(this.novelId, chapterNumber)) summarySource = "llm";
      } catch {
        // 探测失败不阻塞
      }
      emit({
        phase: "done",
        round: reviewRound,
        message: level === "pass"
          ? `第 ${chapterNumber} 章通过（${reviewRound} 轮审核），实体状态更新 ${entitiesUpdated} 条，摘要=${summarySource ?? "无"}`
          : `第 ${chapterNumber} 章警告通过（${reviewRound} 轮审核未满分），实体状态更新 ${entitiesUpdated} 条——建议人工复核`,
      });
      // 写完自动索引本章向量（semantic_search 保持覆盖最新内容）；失败不阻塞
      try {
        const { indexChapterAfterWrite } = await import("./vector-index.service.js");
        await indexChapterAfterWrite(this.novelId, chapterNumber);
      } catch {
        // 自动索引失败不阻塞写作
      }
      try {
        const orch = getOrCreateOrchestrator(this.novelId, this.novelDir);
        await orch.init();
        await orch.confirmStage("chapters");
      } catch {
        // 状态同步失败不阻塞写作
      }
      passed = level === "pass";
      finished = true;
      finalOutcome = level;
      return {
        chapterNumber,
        chapterPath,
        reviewPath,
        rounds: reviewRound,
        passed: level === "pass",
        outcome: level,
        warnings,
        finalVerdict: v,
        proseBlockingRemaining,
        proseAdvisory,
        entitiesUpdated,
        summarySource,
      };
    };

    // 阶段 2：审核-修复循环（最多 maxRounds 轮）
    let verdict: Verdict | null = null;
    let reviewText = "";
    let round = 0;
    for (round = 1; round <= maxRounds; round++) {
      ({ verdict, reviewText } = await doReview(round));
      if (verdict.passed) return await finalizePass(round, verdict, "pass");

      emit({
        phase: "review-fix",
        round,
        message: `按审核报告定向修复（severe=${verdict.severe} normal=${verdict.normal}）`,
      });
      await runSegment("review-fix", () => writer.applyReviewFix(chapterNumber, reviewText));
      // review-fix 后确定性 prose 兜底：修掉 review-fix 改写可能引入的禁用词/硬规，
      // 避免下一轮 editor 再为禁用词判 severe、review-fix 改 A 引入 B 的死循环。
      const proseAfterFix = checkProse(
        (await readFileSafe(path.join(this.novelDir, chapterPath))) ?? "",
      );
      if (proseAfterFix.blocking.length > 0) {
        emit({
          phase: "prose-fix",
          round,
          message: `review-fix 后确定性兜底：修 ${proseAfterFix.blocking.length} 条 blocking`,
        });
        await runSegment("prose-fix", () => writer.applyProseFix(chapterNumber, proseAfterFix));
      }
    }

    // 最后一轮修复后补一次最终审核验证（避免最后一轮修复被浪费）。
    ({ verdict, reviewText } = await doReview(maxRounds + 1));
    if (verdict.passed) return await finalizePass(maxRounds + 1, verdict, "pass");

    // 最终审核仍未通过：按策略三级判定。产物（章节正文）已成立，只有策略判 fail
    // （D 级 / 严重问题达上限 / 报告无评级）才中止；warn 则警告通过、交用户复核。
    const judgement = judgeVerdict(verdict!, settingsService.getReviewPolicy());
    if (judgement.level !== "fail") {
      const warnings = [
        `${maxRounds} 轮审核-修复未达满分：${judgement.reason}。`,
        "已按当前版本继续（产物已确认）。可在编辑器手工修改后，对本章重跑编辑审核。",
      ];
      if (proseBlockingRemaining > 0) {
        warnings.push(`仍有 ${proseBlockingRemaining} 条确定性 prose 问题未修完（见章内标记）。`);
      }
      if (hitLimitAnySegment) {
        warnings.push("写作/修复阶段触达工具轮次上限被切断，产出可能不完整，建议通读检查。");
      }
      return await finalizePass(maxRounds + 1, verdict!, "warn", warnings);
    }

    emit({
      phase: "aborted",
      round: maxRounds + 1,
      message: `${maxRounds} 轮修复 + 最终审核未通过：${judgement.reason}。交用户处理`,
    });
    finalOutcome = "fail";
    return {
      chapterNumber,
      chapterPath,
      reviewPath,
      rounds: maxRounds + 1,
      passed: false,
      outcome: "fail",
      warnings: [judgement.reason],
      finalVerdict: verdict,
      proseBlockingRemaining,
      proseAdvisory,
      entitiesUpdated: 0,
    };
    } finally {
      // 回填 agent_outputs：轮次/工具数按所有段累加（不再只看最后一段 writer.lastTrace）。
      // 警告通过（finished=true, passed=false）仍记 completed——流程已完成，警告经 SSE/结果透出。
      try {
        const lastSum = summarizeTrace(writer.lastTrace);
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
            status: finished ? "completed" : "failed",
            tokensOutput: 0,
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

  /**
   * 自动驾驶：连续写多章，直到完成/质量不达标/里程碑校验失败/达到 endChapter。
   * 每章走 runChapterLoop（含实体更新 + 摘要生成）；每 5 章触发 runConsistencyCheck。
   */
  async runAutopilot(
    options: AutopilotOptions = {},
    onProgress?: (e: AutopilotEvent) => void,
  ): Promise<AutopilotResult> {
    const maxRounds = options.maxRounds ?? settingsService.getReviewFixRounds();
    const maxFails = options.maxConsecutiveFails ?? 2;
    const warnStreakLimit = options.warningStreakLimit ?? 3;
    let chaptersWritten = 0;
    let lastChapter: number | null = null;
    let consecutiveFails = 0;
    let consecutiveWarns = 0;
    let next = options.startChapter ?? await this.findNextChapter();

    while (next !== null) {
      if (options.endChapter && next > options.endChapter) {
        return { chaptersWritten, lastChapter, stopped: "range" };
      }
      onProgress?.({ type: "chapter_start", chapter: next });
      try {
        const result = await this.runChapterLoop(next, maxRounds);
        if (result.outcome === "fail") {
          // 真失败（产物不成立）：计入连续失败，达上限停车。
          consecutiveFails++;
          consecutiveWarns = 0;
          onProgress?.({ type: "chapter_failed", chapter: next, result, message: result.warnings[0] ?? "写作未产出" });
          if (consecutiveFails >= maxFails) {
            return { chaptersWritten, lastChapter, stopped: "quality" };
          }
        } else {
          chaptersWritten++;
          lastChapter = next;
          consecutiveFails = 0;
          if (result.outcome === "warn") {
            // 警告通过：审核未满分但产物成立，继续写下一章；累计触发质量抽查暂停。
            consecutiveWarns++;
            onProgress?.({
              type: "chapter_done",
              chapter: next,
              result,
              message: `第 ${next} 章警告通过：${result.warnings[0] ?? "审核未满分"}（可在编辑器修改后重跑审核）`,
            });
            if (warnStreakLimit > 0 && consecutiveWarns >= warnStreakLimit) {
              return { chaptersWritten, lastChapter, stopped: "warning_streak" };
            }
          } else {
            consecutiveWarns = 0;
            onProgress?.({ type: "chapter_done", chapter: next, result });
          }
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
        }
      } catch (e: any) {
        consecutiveFails++;
        consecutiveWarns = 0;
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
    // 用 findChapterFile 按章号正则匹配（兼容 chXX / chXX_actN-标题 等 act 动态命名）。
    // 旧逻辑 basename === chXX.md 精确匹配，act 动态化后文件名变 chXX_actN-标题.md，
    // 匹配失败会回退到不存在的默认路径，导致 editor 读不到正文 + 报告命名错乱。
    const found = await findChapterFile(this.novelDir, chapterNumber);
    if (found) {
      return path.relative(this.novelDir, found).replace(/\\/g, "/");
    }
    const num = String(chapterNumber).padStart(2, "0");
    const act = chapterNumber <= 7 ? 1 : chapterNumber <= 14 ? 2 : 3;
    return `chapters/act-${act}/ch${num}.md`;
  }
}

