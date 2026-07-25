/**
 * chat 助手专属工具（来自 runChatAgent.executeTool）。
 * save_memory：追加写 ai/memory.md。create_novel：经 novelService 建书。
 * 这两个工具仅 chat 助手使用（pipeline agents 不建书/存记忆）。
 */
import { Type } from "@earendil-works/pi-ai";
import { MEMORY_PATH } from "@fictia/shared";
import { novelService } from "../services/novel.service.js";
import type { FictiaTool, ToolContext } from "./types.js";

export function createChatTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "save_memory",
      label: "保存记忆",
      tier: "write",
      description: "保存信息到记忆文件（ai/memory.md），供后续对话引用。重要事实、用户偏好、待办等可存。",
      parameters: Type.Object({
        content: Type.String({ description: "要保存的内容" }),
      }),
      async execute(_toolCallId, { content }) {
        const memoryPath = MEMORY_PATH;
        const existing = await novelService.getWorkspaceFile(ctx.novelId, memoryPath);
        const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
        const newEntry = `\n\n## ${timestamp}\n${content as string}`;
        if (existing) {
          await novelService.updateWorkspaceFile(ctx.novelId, memoryPath, existing.content + newEntry);
        } else {
          await novelService.createWorkspaceFile(ctx.novelId, memoryPath, `# AI 记忆\n${newEntry}`);
        }
        return { content: [{ type: "text", text: "已保存到记忆文件" }], details: { path: memoryPath } };
      },
    },
    {
      name: "create_novel",
      label: "创建小说",
      tier: "write",
      description: "创建一本新小说。需提供标题，其余可选。创建后提示用户刷新资源管理器查看。",
      parameters: Type.Object({
        title: Type.String({ description: "小说标题" }),
        genre: Type.Optional(Type.String({ description: "类型（玄幻/科幻/言情/悬疑/历史/都市/仙侠/末日等）" })),
        description: Type.Optional(Type.String({ description: "简介" })),
        targetChapters: Type.Optional(Type.Number({ description: "目标章节数（短篇10-15、中篇20-30、长篇50+，默认28）" })),
        tags: Type.Optional(Type.Array(Type.String(), { description: "标签列表" })),
      }),
      async execute(_toolCallId, { title, genre, description, targetChapters, tags }) {
        if (!title) throw new Error("小说标题不能为空");
        const novel = await novelService.create({
          title: title as string,
          genre: (genre as string) ?? "",
          description: (description as string) ?? "",
          targetChapters: (targetChapters as number) ?? 28,
          tags: (tags as string[]) ?? [],
        });
        const text = `小说创建成功！\nID: ${novel.id}\n标题: ${novel.title}\n类型: ${novel.genre}\n简介: ${novel.description}\n目标章节数: ${novel.targetChapters}\n标签: ${(novel.tags ?? []).join(", ")}`;
        return { content: [{ type: "text", text }], details: { novelId: novel.id } };
      },
    },
  ];
}
