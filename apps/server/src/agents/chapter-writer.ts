import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import {
  chapterPath,
  parseChapterPath,
  parseChapterNumber,
  DESIGN_DIR,
  type StageName,
  type AgentType,
} from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import { countWords } from "../utils/word-counter.js";
import { readFileSafe, listFiles } from "../utils/file.js";
import { findChapterFile, findOutlineFile, extractOutlineTitle } from "../utils/chapter-files.js";
import {
  extractChapterNarrativeWeave,
  extractChapterArtDesign,
  extractStyleStageNotes,
  buildWorldQuickRef,
  buildPreviousChapterSummary,
  chapterToAct,
} from "../utils/context-extractor.js";
import * as path from "path";

export class ChapterWriterAgent extends BaseAgent {
  protected stageName: StageName = "chapters";
  protected agentType: AgentType = "chapter-writer";
  protected agentName = "chapter-writer";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [
      `${DESIGN_DIR}/style-guide.md`,
      `${DESIGN_DIR}/art-design.md`,
      `${DESIGN_DIR}/narrative-weave.md`,
      `${DESIGN_DIR}/blueprint.md`,
      "world/setting.md",
      "world/rules.md",
      "outline/chapters/*.md",
    ];
  }

  getOutputFiles(): string[] {
    return ["chapters/*.md"];
  }

  async hasMoreWork(): Promise<boolean> {
    return (await this.findNextChapter()) !== null;
  }

  async getNextWorkItem(): Promise<string | null> {
    const next = await this.findNextChapter();
    if (next === null) return null;
    return `ch${String(next).padStart(2, "0")}`;
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    if (options?.incrementalTarget) {
      const match = options.incrementalTarget.match(/ch(\d+)/);
      if (match) {
        return this.writeChapter(Number(match[1]), options);
      }
    }

    const nextChapter = await this.findNextChapter();
    if (nextChapter === null) {
      return {
        output: "所有章节已完成",
        filesWritten: [],
        success: true,
      };
    }
    return this.writeChapter(nextChapter, options);
  }

  async writeChapter(
    chapterNumber: number,
    options?: AgentRunOptions
  ): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();

    // act 统一用 chapterToAct（修复历史兜底不一致导致的 ch08 跨 act 重复）；标题从大纲取
    const blueprint = await this.readProjectFile(`${DESIGN_DIR}/blueprint.md`);
    const actNumber = chapterToAct(chapterNumber, blueprint || undefined);
    const outlineFile = await findOutlineFile(this.novelDir, chapterNumber);
    const outlineContent = outlineFile ? (await readFileSafe(outlineFile)) ?? "" : "";
    const title = this.resolveChapterTitle(outlineFile, outlineContent);
    const outputPath = chapterPath(chapterNumber, actNumber, title);

    let input: string;
    if (options?.incrementalTarget || options?.userDirective) {
      // 用 findChapterFile 定位当前正文，不依赖 incrementalTarget 的路径格式
      const curFile = await findChapterFile(this.novelDir, chapterNumber);
      const current = curFile ? (await readFileSafe(curFile)) ?? "" : "";
      input = `## 修改第 ${chapterNumber} 章

### 当前章节正文
${current}

### 用户修改要求
${options.userDirective}

请根据要求修改章节，输出完整的修改后内容。`;
    } else {
      const outline = outlineContent;

      const styleGuide = await this.readProjectFile(`${DESIGN_DIR}/style-guide.md`);
      const artDesign = await this.readProjectFile(`${DESIGN_DIR}/art-design.md`);
      const narrativeWeave = await this.readProjectFile(`${DESIGN_DIR}/narrative-weave.md`);
      const worldSetting = await this.readProjectFile("world/setting.md");
      const worldRules = await this.readProjectFile("world/rules.md");

      const narrativeWeaveExcerpt = extractChapterNarrativeWeave(narrativeWeave, chapterNumber);
      const artDesignExcerpt = extractChapterArtDesign(artDesign, chapterNumber);
      const styleStageNotes = extractStyleStageNotes(styleGuide, actNumber);

      const characterRegistry = await this.loadCharacterRegistry();

      const worldQuickRef = buildWorldQuickRef(worldSetting, worldRules);

      let previousChapterNotes = "";
      let previousChapterText = "";
      if (chapterNumber > 1) {
        const prevFile = await findChapterFile(this.novelDir, chapterNumber - 1);
        if (prevFile) {
          previousChapterText = (await readFileSafe(prevFile)) ?? "";
          if (previousChapterText) {
            previousChapterNotes = buildPreviousChapterSummary(previousChapterText);
          }
        }
      }

      input = `${options?.extraContext ? options.extraContext + "\n\n---\n\n" : ""}## 写作第 ${chapterNumber} 章

### 章节大纲
${outline}

### 风格指南（本阶段）
${styleStageNotes}

### 世界观速查
${worldQuickRef}

### 角色总览
${characterRegistry}

### 叙事技巧配置（本章）
${narrativeWeaveExcerpt}

### 情感节拍（本章）
${artDesignExcerpt}

${previousChapterNotes}

### 前一章正文（保持连续性）
${previousChapterText || "（这是第一章）"}

请按照以下要求写作：
1. 严格遵循风格指南中的所有规范
2. 按照章节大纲展开场景
3. 执行大纲中 weave_notes 指定的伏笔/支线/彩蛋指令
4. 人物对话和行为必须符合角色设定
5. 地点、势力、历史引用必须符合世界设定
6. 章节字数以大纲中的目标字数为准，允许 ±20% 浮动
7. 确保与前一章的连续性

正文结束后，附上写作备注：
- 本章字数
- 伏笔操作：本章埋设/强化/回收的伏笔及位置
- 支线推进：本章推进的支线及进展
- 新设定引入：本章引入的新设定元素
- 角色状态更新：主要角色的状态变化
- 下章衔接：为下一章留下的衔接点

请输出完整的章节正文和写作备注。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    const writtenContent = await readFileSafe(path.join(this.novelDir, outputPath));
    const wordCount = writtenContent ? countWords(writtenContent) : 0;

    return {
      output: `${output}\n\n---\n字数统计: ${wordCount}字`,
      filesWritten: [outputPath],
      success: true,
    };
  }

  /** 章节标题：优先大纲文件名（已含 sanitized 标题），回退大纲正文「标题：」行或 H1。 */
  private resolveChapterTitle(outlineFile: string | null, outlineContent: string): string | undefined {
    if (outlineFile) {
      const fromName = parseChapterPath(path.basename(outlineFile))?.title;
      if (fromName && fromName !== "未命名") return fromName;
    }
    return extractOutlineTitle(outlineContent);
  }

  private async findNextChapter(): Promise<number | null> {
    const outlineDir = path.join(this.novelDir, "outline", "chapters");
    const outlineFiles = await listFiles(outlineDir, { extensions: [".md"] });
    if (outlineFiles.length === 0) return null;

    const totalChapters = outlineFiles.length;

    const written = new Set<number>();
    const files = await listFiles(path.join(this.novelDir, "chapters"), { extensions: [".md"] });
    for (const filePath of files) {
      const num = parseChapterNumber(path.basename(filePath));
      if (num !== null) written.add(num);
    }

    for (let i = 1; i <= totalChapters; i++) {
      if (!written.has(i)) return i;
    }

    return null;
  }
}
