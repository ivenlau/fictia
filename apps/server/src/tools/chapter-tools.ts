/**
 * 章节工具。
 *
 * 注意：章节有两种来源，读取逻辑保持与原实现一致（行为等价）：
 * - get_chapter_context / count_words：来自 BaseAgent，直接读文件系统（覆盖 writing-loop 产的、无 DB 行的章节）。
 * - read_chapter / edit_chapter / list_chapters：来自 chat 助手，经 chapterService（DB 章节行 + filename）。
 *
 * 不强行统一两种读取逻辑（那属于后续改进）；本阶段统一的是工具协议——都成 AgentTool 进 registry。
 * 参数统一为 snake_case（number / old_text / new_text / replace_all）。
 */
import { Type } from "@earendil-works/pi-ai";
import * as path from "path";
import { readFileSafe, listFiles } from "../utils/file.js";
import { buildCharacterQuickCard } from "../utils/context-extractor.js";
import { countWords, formatWordCount } from "../utils/word-counter.js";
import { chapterService } from "../services/chapter.service.js";
import type { FictiaTool, ToolContext } from "./types.js";

export function createChapterTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "get_chapter_context",
      label: "获取章节写作上下文",
      tier: "readonly",
      description:
        "获取写作指定章节所需的全部上下文：章节大纲、出场角色压缩参考卡、风格指南、前一章正文、世界观相关部分。chapter-writer 写章前调用。",
      parameters: Type.Object({
        chapter_number: Type.Number({ description: "章节编号" }),
      }),
      async execute(_toolCallId, { chapter_number }) {
        const num = String(chapter_number).padStart(2, "0");
        const context: Record<string, string | null> = {};
        context.outline = await readFileSafe(path.join(ctx.novelDir, `outline/chapters/ch${num}.md`));
        context.styleGuide = await readFileSafe(path.join(ctx.novelDir, "style-guide.md"));
        context.artDesign = await readFileSafe(path.join(ctx.novelDir, "art-design.md"));
        context.narrativeWeave = await readFileSafe(path.join(ctx.novelDir, "narrative-weave.md"));
        context.worldSetting = await readFileSafe(path.join(ctx.novelDir, "world/setting.md"));
        context.worldRules = await readFileSafe(path.join(ctx.novelDir, "world/rules.md"));

        // 从大纲解析出场角色，生成压缩卡
        if (context.outline) {
          const charMatches = context.outline.match(/characters:\s*\[([^\]]*)\]/g);
          if (charMatches) {
            const charNames = new Set<string>();
            for (const match of charMatches) {
              const names = match.match(/"([^"]+)"/g);
              if (names) names.forEach((n) => charNames.add(n.replace(/"/g, "")));
            }
            const charCards: string[] = [];
            const candidates = [
              path.join(ctx.novelDir, "characters/protagonist.md"),
              path.join(ctx.novelDir, "characters/antagonist.md"),
              ...(await listFiles(path.join(ctx.novelDir, "characters/supporting"), { extensions: [".md"] })),
            ];
            for (const charName of charNames) {
              for (const candidate of candidates) {
                const content = await readFileSafe(candidate);
                if (content && content.includes(charName)) {
                  const card = buildCharacterQuickCard(content, charName, chapter_number as number);
                  if (card) charCards.push(card);
                  break;
                }
              }
            }
            if (charCards.length > 0) context.characters = charCards.join("\n\n---\n\n");
          }
        }

        // 前一章正文
        if ((chapter_number as number) > 1) {
          const prevNum = String((chapter_number as number) - 1).padStart(2, "0");
          const chapterFiles = await listFiles(path.join(ctx.novelDir, "chapters"), {
            recursive: true,
            extensions: [".md"],
          });
          const prevFile = chapterFiles.find((f) => f.includes(`ch${prevNum}.md`));
          if (prevFile) context.previousChapter = await readFileSafe(prevFile);
        }

        const summary = Object.entries(context)
          .filter(([, v]) => v !== null)
          .map(([k, v]) => `## ${k}\n\n${v}`)
          .join("\n\n---\n\n");
        return {
          content: [{ type: "text", text: summary || "没有找到章节上下文" }],
          details: { chapter_number },
        };
      },
    },
    {
      name: "read_chapter",
      label: "读取章节正文",
      tier: "readonly",
      description: "读取指定章节正文（经 chapters 数据库行定位文件，返回正文内容）。",
      parameters: Type.Object({
        number: Type.Number({ description: "章节编号" }),
      }),
      async execute(_toolCallId, { number }) {
        const chapters = await chapterService.listByNovel(ctx.novelId);
        const chapter = chapters.find((c) => c.number === (number as number));
        if (!chapter) throw new Error(`第${number}章不存在`);
        if (!chapter.content) {
          return {
            content: [{ type: "text", text: `第${number}章 "${chapter.title ?? "无标题"}" 暂无内容（状态：${chapter.status}）` }],
            details: { number, status: chapter.status },
          };
        }
        const text = `第${number}章 "${chapter.title ?? "无标题"}" (${chapter.wordCount}字):\n\`\`\`\n${chapter.content}\n\`\`\``;
        return { content: [{ type: "text", text }], details: { number, wordCount: chapter.wordCount } };
      },
    },
    {
      name: "edit_chapter",
      label: "编辑章节正文",
      tier: "write",
      description: "精确编辑指定章节正文（替换指定文本片段）。适用于局部修改。",
      parameters: Type.Object({
        number: Type.Number({ description: "章节编号" }),
        old_text: Type.String({ description: "要替换的原文（必须与章节内容完全匹配）" }),
        new_text: Type.String({ description: "替换后的内容" }),
        replace_all: Type.Optional(Type.Boolean({ description: "是否替换所有匹配（默认 false）" })),
      }),
      async execute(_toolCallId, { number, old_text, new_text, replace_all }) {
        const chapters = await chapterService.listByNovel(ctx.novelId);
        const chapter = chapters.find((c) => c.number === (number as number));
        if (!chapter) throw new Error(`第${number}章不存在`);
        if (!chapter.content) throw new Error(`第${number}章暂无内容，无法编辑`);
        if (!chapter.content.includes(old_text as string)) {
          throw new Error(`在第${number}章中未找到匹配的文本: "${(old_text as string).slice(0, 50)}..."`);
        }
        const count = chapter.content.split(old_text as string).length - 1;
        const newContent = replace_all
          ? chapter.content.split(old_text as string).join(new_text as string)
          : chapter.content.replace(old_text as string, new_text as string);
        await chapterService.update(chapter.id, { content: newContent });
        return {
          content: [{ type: "text", text: `已编辑第${number}章（${replace_all ? count : 1} 处替换）` }],
          details: { number, replacements: replace_all ? count : 1 },
        };
      },
    },
    {
      name: "list_chapters",
      label: "列出章节",
      tier: "readonly",
      description: "列出当前小说所有章节（含标题、状态、字数、摘要）。",
      parameters: Type.Object({}),
      async execute() {
        const chapters = await chapterService.listByNovel(ctx.novelId);
        if (chapters.length === 0) {
          return { content: [{ type: "text", text: "当前小说暂无章节" }], details: { count: 0 } };
        }
        const text = chapters
          .map(
            (c) =>
              `- 第${c.number}章: ${c.title ?? "无标题"} [${c.status}] ${c.wordCount}字${c.summary ? `\n  摘要: ${c.summary}` : ""}`,
          )
          .join("\n");
        return { content: [{ type: "text", text }], details: { count: chapters.length } };
      },
    },
    {
      name: "count_words",
      label: "统计字数",
      tier: "readonly",
      description: "统计文本的字数。中文字符每个计 1 字，英文单词每个计 1 词。",
      parameters: Type.Object({
        text: Type.String({ description: "要统计字数的文本" }),
      }),
      async execute(_toolCallId, { text }) {
        const count = countWords(text as string);
        return {
          content: [{ type: "text", text: `字数: ${formatWordCount(count)} (${count}字)` }],
          details: { count },
        };
      },
    },
  ];
}
