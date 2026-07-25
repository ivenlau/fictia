import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import {
  buildNarrativeWeaveSummary,
  buildArtDesignSummary,
  buildWorldQuickRef,
} from "../utils/context-extractor.js";
import { listFiles } from "../utils/file.js";
import * as path from "path";

export class EditorAgent extends BaseAgent {
  protected stageName: StageName = "editor";
  protected agentType: AgentType = "editor";
  protected agentName = "editor";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [
      "design/art-design.md",
      "design/narrative-weave.md",
      "world/setting.md",
      "world/rules.md",
    ];
  }

  getOutputFiles(): string[] {
    return ["reviews/ch*-review.md"];
  }

  async hasMoreWork(): Promise<boolean> {
    return (await this.findNextUnreviewedChapter()) !== null;
  }

  async getNextWorkItem(): Promise<string | null> {
    const p = await this.findNextUnreviewedChapter();
    if (!p) return null;
    return p.split("/").pop()?.replace(".md", "") ?? null;
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const chapterToReview = options?.incrementalTarget ?? (await this.findNextUnreviewedChapter());
    if (!chapterToReview) {
      return {
        output: "所有章节已审核",
        filesWritten: [],
        success: true,
      };
    }
    return this.reviewChapter(chapterToReview, options);
  }

  async reviewChapter(
    chapterPath: string,
    options?: AgentRunOptions
  ): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const chapterContent = await this.readProjectFile(chapterPath);

    const artDesign = await this.readProjectFile("design/art-design.md");
    const narrativeWeave = await this.readProjectFile("design/narrative-weave.md");
    const worldSetting = await this.readProjectFile("world/setting.md");
    const worldRules = await this.readProjectFile("world/rules.md");
    const characterRegistry = await this.loadCharacterRegistry();

    const contextParts: string[] = [];
    if (artDesign) contextParts.push(`## design/art-design.md（概览）\n\n${buildArtDesignSummary(artDesign)}`);
    if (narrativeWeave) contextParts.push(`## design/narrative-weave.md（概览）\n\n${buildNarrativeWeaveSummary(narrativeWeave)}`);
    const worldRef = buildWorldQuickRef(worldSetting, worldRules);
    if (worldRef) contextParts.push(`## 世界观速查\n\n${worldRef}`);
    contextParts.push(`## 角色总览\n\n${characterRegistry}`);
    const context = contextParts.join("\n\n---\n\n");

    const chapterName = chapterPath.split("/").pop()?.replace(".md", "") ?? "unknown";
    const reviewPath = `reviews/${chapterName}-review.md`;

    let input: string;
    if (options?.userDirective) {
      const currentReview = await this.readProjectFile(reviewPath);
      input = `## 修改审核报告

### 当前审核报告 (${reviewPath})
${currentReview}

### 用户修改要求
${options.userDirective}

请根据要求修改审核报告，输出完整的修改后内容。`;
    } else {
      input = `## 审核章节

### 待审核章节 (${chapterPath})
${chapterContent}

### 设定概览（用于交叉校验）
${context}

请从以下维度审核本章，每个维度给出 1-10 分：
1. 文学质量（语言流畅度、用词精准度、修辞手法）
2. 风格一致性（是否偏离 design/style-guide.md）
3. 设定准确性（世界观、术语、力量体系是否与设定一致）
4. 人物一致性（对话和行为是否符合角色设定）
5. 情节逻辑（事件因果、决策合理性）
6. 节奏把控（紧张与舒缓交替、是否有拖沓或仓促）
7. 叙事编织达成度（伏笔/支线/彩蛋是否执行到位）

综合评分：A/B/C/D（A=优秀 B=良好 C=需要修改 D=需要重写）

输出格式要求：
- 总体评价和一句话评语
- 7 维度评分表
- 问题清单（按严重/一般/细节三级分类，每条标注位置、类型、描述、修改建议）
- 亮点（列出做得好的地方）
- 伏笔执行检查表
- 修改优先级排序

请输出完整的审核报告（Markdown 格式）。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: [reviewPath],
      success: true,
    };
  }

  private async findNextUnreviewedChapter(): Promise<string | null> {
    const chapterFiles = await listFiles(
      path.join(this.novelDir, "chapters"),
      { recursive: true, extensions: [".md"] }
    );
    if (chapterFiles.length === 0) return null;

    const reviewFiles = await listFiles(
      path.join(this.novelDir, "reviews"),
      { extensions: [".md"] }
    );

    const getNum = (f: string) => {
      const m = path.basename(f).match(/ch(\d+)/i);
      return m ? parseInt(m[1]) : null;
    };

    const reviewedNums = new Set<number>();
    for (const f of reviewFiles) {
      const n = getNum(f);
      if (n !== null) reviewedNums.add(n);
    }

    const unreviewed = chapterFiles
      .map(f => ({ absPath: f, num: getNum(f) }))
      .filter((x): x is { absPath: string; num: number } => x.num !== null && !reviewedNums.has(x.num))
      .sort((a, b) => a.num - b.num);

    if (unreviewed.length === 0) return null;
    return path.relative(this.novelDir, unreviewed[0].absPath).replace(/\\/g, "/");
  }
}
