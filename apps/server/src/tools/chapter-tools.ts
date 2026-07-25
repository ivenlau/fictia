/**
 * 章节工具。
 *
 * 全部走文件系统（chapters/ 目录扫描），不依赖 chapters DB 表。
 * 原因：writing-loop 写章节只落文件、不建 DB 行，DB 与文件不一致；
 * 文件是真相。兼容两种命名：
 * - writing-loop: chapters/act-X/chXX.md（2 位）
 * - chapterService.create: chapters/001-标题.md（3 位 + 标题）
 *
 * get_chapter_context / count_words 来自 BaseAgent（本就文件系统），保留。
 */
import { Type } from "@earendil-works/pi-ai";
import * as path from "path";
import * as fs from "fs/promises";
import { readFileSafe, listFiles, relativePath } from "../utils/file.js";
import { buildCharacterQuickCard } from "../utils/context-extractor.js";
import { countWords, formatWordCount } from "../utils/word-counter.js";
import type { FictiaTool, ToolContext } from "./types.js";

/** 从文件名解析章节号。支持 chXX.md 和 001-标题.md 两种命名。 */
function parseChapterNumber(basename: string): number | null {
  let m = basename.match(/^ch(\d+)\.md$/);
  if (m) return Number(m[1]);
  m = basename.match(/^(\d+)-.*\.md$/);
  if (m) return Number(m[1]);
  return null;
}

/** 扫 chapters/ 找指定章节号对应的文件。优先 writing-loop 命名，回退 chapterService 命名。 */
async function findChapterFile(novelDir: string, number: number): Promise<string | null> {
  const num2 = String(number).padStart(2, "0");
  const chaptersDir = path.join(novelDir, "chapters");
  const files = await listFiles(chaptersDir, { recursive: true, extensions: [".md"] });
  const byCh = files.find((f) => path.basename(f) === `ch${num2}.md`);
  if (byCh) return byCh;
  const num3 = String(number).padStart(3, "0");
  const byNum = files.find((f) => {
    const base = path.basename(f);
    return base.startsWith(`${num3}-`) && base.endsWith(".md");
  });
  return byNum ?? null;
}

/** 从正文首行 H1 解析标题；无则返回 null。 */
function parseTitle(content: string | null): string | null {
  if (!content) return null;
  const m = content.match(/^#\s+(.+?)\s*$/m);
  return m?.[1] ?? null;
}

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

        // 前一章正文（走文件系统，兼容两种命名）
        if ((chapter_number as number) > 1) {
          const prevFile = await findChapterFile(ctx.novelDir, (chapter_number as number) - 1);
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
      description: "读取指定章节正文（扫 chapters/ 目录定位文件，不依赖 DB）。返回正文 + 字数 + 标题。",
      parameters: Type.Object({
        number: Type.Number({ description: "章节编号" }),
      }),
      async execute(_toolCallId, { number }) {
        const file = await findChapterFile(ctx.novelDir, number as number);
        if (!file) {
          throw new Error(`第${number}章不存在（未找到 chapters/**/ch${String(number).padStart(2, "0")}.md）`);
        }
        const content = await readFileSafe(file);
        if (!content) {
          return { content: [{ type: "text", text: `第${number}章暂无内容` }], details: { number } };
        }
        const wordCount = countWords(content);
        const title = parseTitle(content) ?? "无标题";
        const text = `第${number}章 "${title}" (${wordCount}字) [${relativePath(ctx.novelDir, file)}]:\n\`\`\`\n${content}\n\`\`\``;
        return { content: [{ type: "text", text }], details: { number, wordCount } };
      },
    },
    {
      name: "edit_chapter",
      label: "编辑章节正文",
      tier: "write",
      description: "精确编辑指定章节正文（替换指定文本片段，直接写回文件，不依赖 DB）。适用于局部修改。",
      parameters: Type.Object({
        number: Type.Number({ description: "章节编号" }),
        old_text: Type.String({ description: "要替换的原文（必须与章节内容完全匹配）" }),
        new_text: Type.String({ description: "替换后的内容" }),
        replace_all: Type.Optional(Type.Boolean({ description: "是否替换所有匹配（默认 false）" })),
      }),
      async execute(_toolCallId, { number, old_text, new_text, replace_all }) {
        const file = await findChapterFile(ctx.novelDir, number as number);
        if (!file) throw new Error(`第${number}章不存在，无法编辑`);
        const content = await readFileSafe(file);
        if (!content) throw new Error(`第${number}章暂无内容，无法编辑`);
        if (!content.includes(old_text as string)) {
          throw new Error(`在第${number}章中未找到匹配的文本: "${(old_text as string).slice(0, 50)}..."`);
        }
        const count = content.split(old_text as string).length - 1;
        let warning = "";
        if (!replace_all && count > 1) {
          warning = `警告：找到 ${count} 处匹配，仅替换第一处。如需全替换设 replace_all=true。 `;
        }
        const newContent = replace_all
          ? content.split(old_text as string).join(new_text as string)
          : content.replace(old_text as string, new_text as string);
        await fs.writeFile(file, newContent, "utf-8");
        return {
          content: [{ type: "text", text: `${warning}已编辑第${number}章（${replace_all ? count : 1} 处替换）` }],
          details: { number, replacements: replace_all ? count : 1 },
        };
      },
    },
    {
      name: "list_chapters",
      label: "列出章节",
      tier: "readonly",
      description: "列出当前小说所有章节（扫 chapters/ 目录，返回章节号/标题/字数/路径，不依赖 DB）。",
      parameters: Type.Object({}),
      async execute() {
        const chaptersDir = path.join(ctx.novelDir, "chapters");
        const files = await listFiles(chaptersDir, { recursive: true, extensions: [".md"] });
        const items: { number: number; title: string; wordCount: number; path: string }[] = [];
        for (const f of files) {
          const num = parseChapterNumber(path.basename(f));
          if (num === null) continue;
          const content = await readFileSafe(f);
          const wordCount = content ? countWords(content) : 0;
          items.push({
            number: num,
            title: parseTitle(content) ?? "无标题",
            wordCount,
            path: relativePath(ctx.novelDir, f),
          });
        }
        items.sort((a, b) => a.number - b.number);
        if (items.length === 0) {
          return {
            content: [{ type: "text", text: "当前小说暂无章节（chapters/ 目录无 ch*.md 文件）" }],
            details: { count: 0 },
          };
        }
        const text = items
          .map((c) => `- 第${c.number}章: ${c.title} (${c.wordCount}字) [${c.path}]`)
          .join("\n");
        return { content: [{ type: "text", text }], details: { count: items.length } };
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
