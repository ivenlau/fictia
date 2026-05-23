import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import { countWords } from "../utils/word-counter.js";
import { readFileSafe, listFiles } from "../utils/file.js";
import {
  extractChapterNarrativeWeave,
  extractChapterArtDesign,
  extractStyleStageNotes,
  buildWorldQuickRef,
  buildPreviousChapterSummary,
  chapterToAct,
} from "../utils/context-extractor.js";
import * as path from "path";
import * as fs from "fs/promises";

export class ChapterWriterAgent extends BaseAgent {
  protected stageName: StageName = "chapters";
  protected agentType: AgentType = "chapter-writer";
  protected agentName = "chapter-writer";

  protected getToolTier(): "standard" | "full" {
    return "full";
  }

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [
      "style-guide.md",
      "art-design.md",
      "narrative-weave.md",
      "blueprint.md",
      "world/setting.md",
      "world/rules.md",
      "outline/chapters/*.md",
    ];
  }

  getOutputFiles(): string[] {
    return ["chapters/**/*.md"];
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
      const match = options.incrementalTarget.match(/ch(\d+)\.md$/);
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
    const chapterNum = String(chapterNumber).padStart(2, "0");

    const actNumber = await this.findActForChapter(chapterNumber);
    const outputPath = `chapters/act-${actNumber}/ch${chapterNum}.md`;

    let input: string;
    if (options?.incrementalTarget || options?.userDirective) {
      const current = await this.readProjectFile(
        options?.incrementalTarget ?? outputPath
      );
      input = `## 修改第 ${chapterNumber} 章

### 当前章节正文
${current}

### 用户修改要求
${options.userDirective}

请根据要求修改章节，输出完整的修改后内容。`;
    } else {
      const outline = await this.readProjectFile(`outline/chapters/ch${chapterNum}.md`);

      const styleGuide = await this.readProjectFile("style-guide.md");
      const artDesign = await this.readProjectFile("art-design.md");
      const narrativeWeave = await this.readProjectFile("narrative-weave.md");
      const worldSetting = await this.readProjectFile("world/setting.md");
      const worldRules = await this.readProjectFile("world/rules.md");

      const stageIndex = chapterToAct(chapterNumber);

      const narrativeWeaveExcerpt = extractChapterNarrativeWeave(narrativeWeave, chapterNumber);
      const artDesignExcerpt = extractChapterArtDesign(artDesign, chapterNumber);
      const styleStageNotes = extractStyleStageNotes(styleGuide, stageIndex);

      const characterRegistry = await this.loadCharacterRegistry();

      const worldQuickRef = buildWorldQuickRef(worldSetting, worldRules);

      let previousChapterNotes = "";
      let previousChapterText = "";
      if (chapterNumber > 1) {
        const prevNum = String(chapterNumber - 1).padStart(2, "0");
        const prevAct = await this.findActForChapter(chapterNumber - 1);
        previousChapterText = await this.readProjectFile(
          `chapters/act-${prevAct}/ch${prevNum}.md`
        );
        if (previousChapterText) {
          previousChapterNotes = buildPreviousChapterSummary(previousChapterText);
        }
      }

      input = `## 写作第 ${chapterNumber} 章

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

  private async findNextChapter(): Promise<number | null> {
    const outlineDir = path.join(this.novelDir, "outline", "chapters");
    const outlineFiles = await listFiles(outlineDir, { extensions: [".md"] });
    if (outlineFiles.length === 0) return null;

    const totalChapters = outlineFiles.length;

    const written = new Set<number>();
    const chaptersDir = path.join(this.novelDir, "chapters");
    try {
      const acts = await listFiles(chaptersDir, { recursive: true, extensions: [".md"] });
      for (const filePath of acts) {
        const match = path.basename(filePath).match(/^ch(\d+)\.md$/);
        if (match) written.add(Number(match[1]));
      }
    } catch {
      // chapters/ doesn't exist yet
    }

    for (let i = 1; i <= totalChapters; i++) {
      if (!written.has(i)) return i;
    }

    return null;
  }

  private async findActForChapter(chapterNumber: number): Promise<number> {
    const num = String(chapterNumber).padStart(2, "0");
    const chaptersDir = path.join(this.novelDir, "chapters");
    try {
      const entries = await fs.readdir(chaptersDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("act-")) {
          const filePath = path.join(chaptersDir, entry.name, `ch${num}.md`);
          try {
            await fs.access(filePath);
            return Number(entry.name.replace("act-", ""));
          } catch {
            // not in this act
          }
        }
      }
    } catch {
      // chapters/ doesn't exist
    }

    const blueprint = await this.readProjectFile("blueprint.md");
    const actMatches = blueprint.match(/name:\s*"([^"]+)"\s*\n\s*chapters:\s*\[([^\]]+)\]/g);
    if (actMatches) {
      let actNum = 1;
      for (const match of actMatches) {
        const nums = match.match(/\d+/g);
        if (nums && nums.some(n => Number(n) === chapterNumber)) {
          return actNum;
        }
        actNum++;
      }
    }

    return chapterNumber <= 7 ? 1 : chapterNumber <= 14 ? 2 : 3;
  }
}
