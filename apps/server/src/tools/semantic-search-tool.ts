/**
 * 语义检索工具（C 类，只读）。
 * 暴露向量检索（sqlite-vec + 本地/远程 embedding）：让 AI 主动"想起"相关前文/设定，
 * 治长篇失忆。依赖前端已建立向量索引；未索引/索引不一致时给出友好提示。
 */
import { Type } from "@earendil-works/pi-ai";
import {
  queryVectors,
  collectionStats,
  getIndexMeta,
  indexMetaMatches,
  type VectorIndexMeta,
  type VectorCollection,
} from "../services/vector-store.js";
import { embedOne } from "../utils/embedding.js";
import { settingsService } from "../services/settings.service.js";
import type { FictiaTool, ToolContext } from "./types.js";

/** 参与语义检索的集合（notes/sources 暂不索引，见 vector-index.service）。 */
const SEARCHABLE_COLLECTIONS: VectorCollection[] = ["chapters", "design", "world", "outlines"];

export function createSemanticSearchTool(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "semantic_search",
      label: "语义检索",
      tier: "readonly",
      description:
        "语义检索小说内容（章节/设定/世界观/大纲），按语义相似度召回相关片段。治长篇失忆。需先在前端「知识库」面板建立向量索引。bge-m3 首次调用加载本地模型有延迟。",
      parameters: Type.Object({
        query: Type.String({ description: "查询文本（自然语言）" }),
        collection: Type.Optional(
          Type.String({ description: "限定集合：chapters/design/world/outlines。不填则跨全部集合检索。" }),
        ),
        top_k: Type.Optional(Type.Number({ description: "每个集合返回的最大命中数（默认 3）" })),
      }),
      async execute(_id, { query, collection, top_k }) {
        const stats = collectionStats(ctx.novelId);
        const indexedCount = SEARCHABLE_COLLECTIONS.filter((c) => (stats[c] ?? 0) > 0).length;
        if (indexedCount === 0) {
          throw new Error("向量索引为空，请先在前端「知识库」面板建立索引后再使用语义检索。");
        }
        // 索引配置指纹校验：provider/模型/切块参数任一变化都要求重建
        const provider = settingsService.getEmbeddingProvider();
        const modelDir = settingsService.getEmbeddingModelDir() || undefined;
        const dtype = (process.env.EMBEDDING_DTYPE as string | undefined) ?? "fp32";
        const expectedMeta: VectorIndexMeta = {
          version: 2,
          provider,
          modelDir,
          dtype,
          chunkChars: settingsService.getEmbeddingChunkChars(),
          chunkOverlap: settingsService.getEmbeddingChunkOverlap(),
        };
        if (!indexMetaMatches(getIndexMeta(ctx.novelId), expectedMeta)) {
          throw new Error(
            "向量索引与当前 embedding 配置（provider/模型/切块参数）不一致，请先在前端「知识库」面板重建索引。",
          );
        }
        const glmKey = settingsService.getEmbeddingGlmKey();
        const k = (top_k as number) ?? 3;
        const queryVec = await embedOne(query as string, provider, glmKey, modelDir);

        const cols: VectorCollection[] = collection
          ? ([collection as string] as VectorCollection[]).filter((c) => SEARCHABLE_COLLECTIONS.includes(c))
          : SEARCHABLE_COLLECTIONS;

        // 不按 path 去重：同一文件不同段落都相关时各自命中是 RAG 的价值，去重会丢上下文。
        const hits: {
          collection: string;
          id: string;
          score: number;
          text: string;
          metadata: Record<string, unknown>;
        }[] = [];
        for (const col of cols) {
          if ((stats[col] ?? 0) === 0) continue; // 该集合未索引
          const result = queryVectors(ctx.novelId, col, queryVec, k);
          for (const h of result) {
            hits.push({
              collection: col,
              id: h.id,
              score: h.score,
              text: h.text,
              metadata: h.metadata,
            });
          }
        }
        if (hits.length === 0) {
          return { content: [{ type: "text", text: `未找到与 "${query}" 语义相关的内容` }], details: { count: 0 } };
        }
        hits.sort((a, b) => b.score - a.score);
        const top = hits.slice(0, k * cols.length);
        const text = `语义检索 "${query}" 命中 ${top.length} 条:\n\n${top
          .map((h) => {
            // id 形如 path#chunkIndex，从 metadata 取更稳；片段号转 1 基便于阅读
            const m = h.metadata as { path?: string; chunkIndex?: number };
            const displayId = m.path
              ? m.chunkIndex != null
                ? `${m.path} · 片段 ${m.chunkIndex + 1}`
                : m.path
              : h.id;
            return `## [${h.collection}] ${displayId} (score: ${h.score.toFixed(3)})\n${h.text.slice(0, 500)}${h.text.length > 500 ? "..." : ""}`;
          })
          .join("\n\n")}`;
        return { content: [{ type: "text", text }], details: { count: top.length } };
      },
    },
  ];
}
