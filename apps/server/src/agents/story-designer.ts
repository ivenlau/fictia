import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import {
  buildNarrativeWeaveSummary,
  buildArtDesignSummary,
  buildWorldQuickRef,
} from "../utils/context-extractor.js";

export class StoryDesignerAgent extends BaseAgent {
  protected stageName: StageName = "story";
  protected agentType: AgentType = "story-designer";
  protected agentName = "story-designer";
  protected maxToolIterations = 0; // 不限制，支持长篇小说 150+ 章节

  protected getToolTier(): "standard" | "full" {
    return "full";
  }

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [
      "blueprint.md",
      "art-design.md",
      "narrative-weave.md",
      "world/setting.md",
      "world/rules.md",
    ];
  }

  getOutputFiles(): string[] {
    return ["outline/act-1.md", "outline/act-2.md", "outline/act-3.md", "outline/chapters/*.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();

    const blueprint = await this.readProjectFile("blueprint.md");
    const artDesign = await this.readProjectFile("art-design.md");
    const narrativeWeave = await this.readProjectFile("narrative-weave.md");
    const worldSetting = await this.readProjectFile("world/setting.md");
    const worldRules = await this.readProjectFile("world/rules.md");
    const characterRegistry = await this.loadCharacterRegistry();

    const contextParts: string[] = [];
    if (blueprint) contextParts.push(`## blueprint.md\n\n${blueprint}`);
    if (artDesign) contextParts.push(`## art-design.md（概览）\n\n${buildArtDesignSummary(artDesign)}`);
    if (narrativeWeave) contextParts.push(`## narrative-weave.md（概览）\n\n${buildNarrativeWeaveSummary(narrativeWeave)}`);
    const worldRef = buildWorldQuickRef(worldSetting, worldRules);
    if (worldRef) contextParts.push(`## 世界观速查\n\n${worldRef}`);
    contextParts.push(`## 角色总览\n\n${characterRegistry}`);
    const context = contextParts.join("\n\n---\n\n");

    let input: string;
    if (options?.isRedo) {
      const existingOutlines = await this.readProjectFile("outline/act-1.md");
      input = `## 重新设计故事大纲

### 当前大纲（部分）
${existingOutlines}

### 全部前置产出
${context}

### 用户修改要求
${options.userDirective ?? "请重新审视故事大纲"}

请重新设计故事大纲，输出完整内容。`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const target = options?.incrementalTarget ?? "outline/act-1.md";
      const current = await this.readProjectFile(target);
      input = `## 修改故事大纲

### 目标文件: ${target}

### 当前内容
${current}

### 全部前置产出
${context}

### 用户修改要求
${options.userDirective}

请根据要求修改故事大纲，输出完整的修改后内容。`;
    } else {
      input = `## 设计故事大纲

### 全部前置产出
${context}

请设计完整的故事大纲：

### 1. 各幕概要 (outline/act-1.md, act-2.md, act-3.md)
- 幕编号和名称
- 包含的章节
- 幕级概要

### 2. 各章详细大纲 (outline/chapters/ch01.md, ch02.md, ...)
每章包含：
- 章节号、标题、POV、场景
- 场景列表（地点、角色、目的、事件、情感弧线）
- weave_notes：明确标注本章需要执行的伏笔/支线/彩蛋指令
- 目标字数
- 风格提示
- 连续性检查点

请用 \`===FILE: outline/act-1.md===\` 等分隔符分隔各文件内容。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["outline/*.md"],
      success: true,
    };
  }
}
