/**
 * 叙事状态查询工具（A 类，只读）。
 * 暴露叙事状态底座的能力：伏笔状态机统计/单伏笔历史、章级摘要链、写作空间。
 * chapter-writer/editor/consistency-checker 写章/审核时主动查，替代"全量塞 + 幻觉"。
 */
import { Type } from "@earendil-works/pi-ai";
import { foreshadowStats, assembleWritingSpace } from "../services/entity.service.js";
import { getChapterSummary } from "../services/summary-chain.service.js";
import { readSummariesBefore } from "../services/chapter-summary-store.js";
import { getEntity } from "../services/entity-store.js";
import type { FictiaTool, ToolContext } from "./types.js";

export function createNarrativeStateTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "get_foreshadowing_stats",
      label: "伏笔统计",
      tier: "readonly",
      description:
        "获取伏笔闭合统计：总数/各状态数/闭合率/未决伏笔清单。审核、写章前查伏笔进度用。",
      parameters: Type.Object({}),
      async execute() {
        const stats = foreshadowStats(ctx.novelId);
        const text = `伏笔统计：
总数: ${stats.total}
已埋设(planted): ${stats.planted}
已强化(strengthened): ${stats.strengthened}
已回收(resolved): ${stats.resolved}
悬置(suspended): ${stats.suspended}
闭合率: ${(stats.closureRate * 100).toFixed(1)}%

未决伏笔:
${stats.open.map((f) => `- [${f.id}] ${f.name} (${f.state})${f.desc ? ": " + f.desc : ""}`).join("\n") || "（无）"}`;
        return { content: [{ type: "text", text }], details: stats };
      },
    },
    {
      name: "get_foreshadow",
      label: "查询单个伏笔",
      tier: "readonly",
      description:
        "查询单个伏笔的当前状态和 per-chapter 历史事件日志。确认某伏笔是否已回收/在哪些章推进过。",
      parameters: Type.Object({
        foreshadow_id: Type.String({ description: "伏笔编号，如 FO-001" }),
      }),
      async execute(_id, { foreshadow_id }) {
        const e = getEntity(ctx.novelId, "foreshadowing", foreshadow_id as string);
        if (!e) throw new Error(`未找到伏笔: ${foreshadow_id}`);
        const history = (e.fields.history as Array<{ ch: string; op: string; state: string; note?: string }>) ?? [];
        const desc = (e.fields.desc as string) ?? (e.fields.description as string) ?? "";
        const text = `伏笔: ${e.name} (${e.id})
当前状态: ${e.state}
描述: ${desc}

历史:
${history.map((h) => `- 第${h.ch}章 ${h.op} -> ${h.state}${h.note ? " | " + h.note : ""}`).join("\n") || "（无历史）"}`;
        return { content: [{ type: "text", text }], details: { state: e.state, history } };
      },
    },
    {
      name: "get_summary_chain",
      label: "前文摘要链",
      tier: "readonly",
      description:
        "获取指定章节之前的章级压缩摘要（跨章骨架，长篇自动滑窗：保留最近20章+第1章，中间省略）。写章/审核时治长篇失忆，避免只看前一章正文。",
      parameters: Type.Object({
        chapter_number: Type.Number({ description: "目标章节号；返回该章之前（不含）的所有摘要" }),
      }),
      async execute(_id, { chapter_number }) {
        const summaries = readSummariesBefore(ctx.novelId, chapter_number as number);
        if (summaries.length === 0) {
          return { content: [{ type: "text", text: `第${chapter_number}章之前暂无摘要` }], details: { count: 0 } };
        }
        const realCount = summaries.filter((s) => !s.omitted).length;
        const text = `前文摘要链（第${chapter_number}章之前，共${realCount}章摘要）:\n\n${summaries
          .map((s) => (s.omitted ? s.summary : `## 第${s.number}章\n${s.summary}`))
          .join("\n\n")}`;
        return { content: [{ type: "text", text }], details: { count: realCount } };
      },
    },
    {
      name: "get_chapter_summary",
      label: "单章摘要",
      tier: "readonly",
      description: "读取指定章节的压缩摘要（章级摘要链中的一章）。",
      parameters: Type.Object({
        chapter_number: Type.Number({ description: "章节号" }),
      }),
      async execute(_id, { chapter_number }) {
        const summary = getChapterSummary(ctx.novelId, chapter_number as number);
        if (!summary) throw new Error(`第${chapter_number}章暂无摘要`);
        return {
          content: [{ type: "text", text: `第${chapter_number}章摘要:\n${summary}` }],
          details: { chapter_number },
        };
      },
    },
    {
      name: "get_writing_space",
      label: "写作空间",
      tier: "readonly",
      description:
        "[已弃用] 一站式获取写章动态写作空间（大纲+风格+世界观+角色态+伏笔）。新流程改用细粒度工具按需拉取，避免上下文膨胀。保留供过渡，稳定后删除。",
      parameters: Type.Object({
        chapter_number: Type.Number({ description: "章节号" }),
      }),
      async execute(_id, { chapter_number }) {
        const space = await assembleWritingSpace(ctx.novelId, chapter_number as number);
        return { content: [{ type: "text", text: space }], details: { chapter_number } };
      },
    },
  ];
}
