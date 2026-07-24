/**
 * 审校工具（来自 BaseAgent.validate_style / scan_consistency）。
 * 确定性规则校验，不调 LLM。editor / consistency-checker 使用。
 */
import { Type } from "@earendil-works/pi-ai";
import * as path from "path";
import { readFileSafe, listFiles } from "../utils/file.js";
import type { FictiaTool, ToolContext } from "./types.js";

export function createReviewTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "validate_style",
      label: "风格校验",
      tier: "readonly",
      description: "校验文本是否符合 style-guide.md 中定义的风格规范（句长/节奏/对话比例）。返回校验结果和偏差提示。",
      parameters: Type.Object({
        text: Type.String({ description: "要校验的文本" }),
        dimension: Type.Optional(
          Type.String({ description: "校验维度：'sentence_length', 'dialogue', 'pacing', 'all'。默认 'all'。" }),
        ),
      }),
      async execute(_toolCallId, { text, dimension }) {
        const dim = (dimension as string) ?? "all";
        const styleContent = await readFileSafe(path.join(ctx.novelDir, "style-guide.md"));
        if (!styleContent) throw new Error("style-guide.md 尚未创建，无法校验");
        const issues: string[] = [];
        if (dim === "all" || dim === "sentence_length") {
          const sentences = (text as string).split(/[。！？.!?]/).filter((s) => s.trim().length > 0);
          const long = sentences.filter((s) => s.length > 80);
          if (long.length > sentences.length * 0.3) {
            issues.push(`句式偏长：${long.length}/${sentences.length} 个句子超过80字`);
          }
        }
        if (dim === "all" || dim === "pacing") {
          const paragraphs = (text as string).split(/\n\n+/).filter((p) => p.trim().length > 0);
          const long = paragraphs.filter((p) => p.length > 500);
          if (long.length > 0) issues.push(`${long.length} 个段落超过500字，可能影响节奏`);
        }
        if (dim === "all" || dim === "dialogue") {
          const dialogueMatches = (text as string).match(/["「」""''][^"「」""'']*["「」""'']/g);
          const dialogueLength = dialogueMatches ? dialogueMatches.join("").length : 0;
          const ratio = dialogueLength / (text as string).length;
          if (ratio < 0.1) issues.push(`对话比例偏低 (${(ratio * 100).toFixed(1)}%)，可能缺乏互动感`);
          else if (ratio > 0.6) issues.push(`对话比例偏高 (${(ratio * 100).toFixed(1)}%)，可能缺乏描写`);
        }
        const msg =
          issues.length === 0
            ? "风格校验通过，未发现明显偏差"
            : `发现 ${issues.length} 个风格偏差：\n${issues.map((i) => `- ${i}`).join("\n")}`;
        return { content: [{ type: "text", text: msg }], details: { issueCount: issues.length } };
      },
    },
    {
      name: "scan_consistency",
      label: "一致性扫描",
      tier: "readonly",
      description: "扫描项目文件的一致性。检查伏笔是否在章节中出现等。返回发现的不一致项。",
      parameters: Type.Object({
        scope: Type.Optional(
          Type.String({ description: "扫描范围：'all' 全部, 'world' 仅世界观, 'characters' 仅人物, 'foreshadowing' 仅伏笔。默认 'all'。" }),
        ),
      }),
      async execute(_toolCallId, { scope }) {
        const sc = (scope as string) ?? "all";
        const issues: string[] = [];
        const narrativeWeave = await readFileSafe(path.join(ctx.novelDir, "narrative-weave.md"));
        const chapterFiles = await listFiles(path.join(ctx.novelDir, "chapters"), {
          recursive: true,
          extensions: [".md"],
        });
        const chapters: Record<string, string> = {};
        for (const f of chapterFiles) {
          const content = await readFileSafe(f);
          if (content) chapters[path.basename(f)] = content;
        }
        if ((sc === "all" || sc === "foreshadowing") && narrativeWeave) {
          const matches = narrativeWeave.match(/id:\s*"(FO-[^"]+)"/g);
          if (matches) {
            for (const match of matches) {
              const id = match.match(/"([^"]+)"/)?.[1];
              if (id && !Object.values(chapters).some((c) => c.includes(id))) {
                issues.push(`伏笔 ${id} 在 narrative-weave.md 中定义但未在任何章节中出现`);
              }
            }
          }
        }
        // characters scope：原实现为预留（空逻辑），保持
        const msg =
          issues.length === 0
            ? "一致性扫描完成，未发现问题"
            : `发现 ${issues.length} 个一致性问题：\n${issues.map((i) => `- ${i}`).join("\n")}`;
        return { content: [{ type: "text", text: msg }], details: { issueCount: issues.length } };
      },
    },
  ];
}
