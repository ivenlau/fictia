/**
 * 编排类工具（F3，orchestrate tier）。
 *
 * 暴露流水线/写作循环的触发能力：查下一章、跑单章写作循环、跑某流水线阶段。
 * 让 chat 助手能"自动驾驶"——触发写章/阶段执行。
 *
 * 注意：run_writing_loop / run_pipeline_stage 会嵌套跑 agent（内层 runAgentSession），
 * 长耗时（数分钟）。建议在 manualConfirm 开启下使用（execute 前需用户确认）。
 * check_milestone 省略——里程碑一致性校验等价于 run_pipeline_stage("consistency")。
 */
import { Type } from "@earendil-works/pi-ai";
import { Orchestrator } from "../core/orchestrator.js";
import { WritingLoopService } from "../services/writing-loop.service.js";
import { settingsService } from "../services/settings.service.js";
import type { StageName } from "@fictia/shared";
import type { FictiaTool, ToolContext } from "./types.js";

export function createOrchestrationTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "find_next_chapter",
      label: "查找下一章",
      tier: "readonly",
      description:
        "查找下一个待写章节号（有大纲但未写正文）。返回章节号或'全部完成'。自动驾驶规划/进度查询用。",
      parameters: Type.Object({}),
      async execute() {
        const loop = new WritingLoopService(ctx.novelId, ctx.novelDir, settingsService.get().agentModels);
        const next = await loop.findNextChapter();
        const text = next === null ? "所有章节已完成，无待写章节" : `下一章待写: 第${next}章`;
        return { content: [{ type: "text", text }], details: { nextChapter: next } };
      },
    },
    {
      name: "run_writing_loop",
      label: "触发写作循环",
      tier: "orchestrate",
      description:
        "触发单章写作循环（写章 + prose 检查 + 编辑审核 + 修复，最多 3 轮）。长耗时（数分钟）。省略 chapter_number 时自动找下一章。写完自动更新实体/伏笔状态 + 生成章摘要。",
      parameters: Type.Object({
        chapter_number: Type.Optional(Type.Number({ description: "章节号。不填则自动找下一章。" })),
        max_rounds: Type.Optional(Type.Number({ description: "最大审核修复轮数（默认 3）" })),
      }),
      async execute(_id, { chapter_number, max_rounds }) {
        const agentModels = settingsService.get().agentModels;
        const loop = new WritingLoopService(ctx.novelId, ctx.novelDir, agentModels);
        const target =
          chapter_number !== undefined ? (chapter_number as number) : await loop.findNextChapter();
        if (target === null) {
          return { content: [{ type: "text", text: "所有章节已完成，无需写作" }], details: { done: true } };
        }
        const result = await loop.runChapterLoop(target, (max_rounds as number) ?? 3);
        const text = `第${target}章写作完成：
- 通过审核: ${result.passed ? "是" : "否"}
- 轮次: ${result.rounds}
- 实体更新: ${result.entitiesUpdated}
- 摘要来源: ${result.summarySource ?? "无"}
- 阻塞性问题残留: ${result.proseBlockingRemaining}`;
        return { content: [{ type: "text", text }], details: { chapter: target, ...result } };
      },
    },
    {
      name: "run_pipeline_stage",
      label: "触发流水线阶段",
      tier: "orchestrate",
      description:
        "触发某个创作流水线阶段。阶段名: genre_analysis/architecture/style/art_design/narrative_weave/world/characters/story/chapters/editor/consistency。返回产物文件清单。",
      parameters: Type.Object({
        stage: Type.String({
          description:
            "阶段名: genre_analysis/architecture/style/art_design/narrative_weave/world/characters/story/chapters/editor/consistency",
        }),
      }),
      async execute(_id, { stage }) {
        const agentModels = settingsService.get().agentModels;
        const orch = new Orchestrator(ctx.novelId, ctx.novelDir, agentModels);
        const result = await orch.runStage(stage as StageName);
        const text = `阶段 ${stage} 完成：
- 成功: ${result.success}
- 产出文件: ${result.filesWritten.join(", ") || "(无)"}${result.error ? `\n- 错误: ${result.error}` : ""}`;
        return {
          content: [{ type: "text", text }],
          details: { stage, success: result.success, filesWritten: result.filesWritten },
        };
      },
    },
  ];
}
