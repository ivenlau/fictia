/**
 * 触发类工具（F2，write tier）。
 *
 * 暴露现有"自动/手动触发"的原子能力：章级摘要生成、实体提取、向量索引重建。
 * 让 AI/editor/chat 主动触发，不依赖前端手动点。
 * generate_chapter_summary 含 LLM 调用；index_vectors 含 embedding（bge-m3 首次加载慢）。
 */
import { Type } from "@earendil-works/pi-ai";
import { generateChapterSummary } from "../services/summary-chain.service.js";
import { indexAllEntities } from "../services/entity.service.js";
import { entityStats } from "../services/entity-store.js";
import { indexAll } from "../services/vector-index.service.js";
import { settingsService } from "../services/settings.service.js";
import type { FictiaTool, ToolContext } from "./types.js";

export function createTriggerTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "generate_chapter_summary",
      label: "生成章节摘要",
      tier: "write",
      description:
        "为指定章节生成/覆盖章级压缩摘要（写入摘要链）。用于补齐缺失摘要或重新生成。含 LLM 调用，失败回退确定性摘要。",
      parameters: Type.Object({
        chapter_number: Type.Number({ description: "章节号" }),
      }),
      async execute(_id, { chapter_number }) {
        const result = await generateChapterSummary(ctx.novelId, chapter_number as number);
        if (!result) throw new Error(`第${chapter_number}章无法生成摘要（可能无章节文件）`);
        return {
          content: [{ type: "text", text: `第${chapter_number}章摘要已生成（来源: ${result.source}）:\n${result.summary}` }],
          details: { chapter_number, source: result.source },
        };
      },
    },
    {
      name: "index_entities",
      label: "重建实体索引",
      tier: "write",
      description:
        "全量提取小说文件中的实体（角色/伏笔/支线/时间线）写入 entities.db。新增/修改设定文件后调用以刷新索引。",
      parameters: Type.Object({}),
      async execute() {
        await indexAllEntities(ctx.novelId);
        const stats = entityStats(ctx.novelId);
        const text = `实体索引重建完成:\n${Object.entries(stats)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")}`;
        return { content: [{ type: "text", text }], details: stats };
      },
    },
    {
      name: "index_vectors",
      label: "重建向量索引",
      tier: "write",
      description:
        "重建向量索引（章节/设定/世界观/大纲），供 semantic_search 使用。bge-m3 首次加载约 2.2GB 模型，耗时较长。",
      parameters: Type.Object({}),
      async execute() {
        const provider = settingsService.getEmbeddingProvider();
        const glmKey = settingsService.getEmbeddingGlmKey();
        const modelDir = settingsService.getEmbeddingModelDir();
        const result = await indexAll(ctx.novelId, provider, glmKey, modelDir);
        const text = `向量索引重建完成:\n${Object.entries(result.indexed)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")}`;
        return { content: [{ type: "text", text }], details: result };
      },
    },
  ];
}
