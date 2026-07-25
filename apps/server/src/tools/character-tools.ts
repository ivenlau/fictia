/**
 * 角色工具（来自 BaseAgent.get_character）。
 * 直接读 characters/ 目录文件（文件即真相），支持 card（压缩参考卡）/ full（完整文件）两种级别。
 * 命名扁平：characters/{名字}_{类型}.md，listCharacterFiles 按后缀过滤角色文件。
 */
import { Type } from "@earendil-works/pi-ai";
import { readFileSafe } from "../utils/file.js";
import { listCharacterFiles } from "../utils/chapter-files.js";
import { buildCharacterQuickCard } from "../utils/context-extractor.js";
import type { FictiaTool, ToolContext } from "./types.js";

export function createCharacterTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "get_character",
      label: "获取角色设定",
      tier: "readonly",
      description:
        "获取指定角色的设定信息。支持两种模式：card（默认，返回压缩参考卡）和 full（返回完整文件）。chapter-writer 写章时按需查角色。",
      parameters: Type.Object({
        character_name: Type.String({ description: "角色名称（中文）" }),
        detail_level: Type.Optional(
          Type.Union([Type.Literal("card"), Type.Literal("full")], {
            description: "详情级别：card=压缩参考卡（默认），full=完整文件",
          }),
        ),
        chapter_number: Type.Optional(Type.Number({ description: "当前章节号（可选，用于过滤成长弧线）" })),
      }),
      async execute(_toolCallId, { character_name, detail_level, chapter_number }) {
        const candidates = await listCharacterFiles(ctx.novelDir);
        for (const candidate of candidates) {
          const content = await readFileSafe(candidate);
          if (content && content.includes(character_name as string)) {
            if (detail_level === "full") {
              return { content: [{ type: "text", text: content }], details: { character_name, file: candidate } };
            }
            const card = buildCharacterQuickCard(content, character_name as string, chapter_number as number | undefined);
            return {
              content: [{ type: "text", text: card ?? `未生成角色卡: ${character_name}` }],
              details: { character_name, file: candidate },
            };
          }
        }
        throw new Error(`未找到角色: ${character_name}`);
      },
    },
  ];
}
