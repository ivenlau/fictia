import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";

export class ArchitectAgent extends BaseAgent {
  protected stageName: StageName = "architecture";
  protected agentType: AgentType = "architect";
  protected agentName = "architect";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return ["genre-analysis.md"];
  }

  getOutputFiles(): string[] {
    return ["blueprint.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const genreAnalysis = await this.readProjectFile("genre-analysis.md");

    let input: string;
    if (options?.isRedo) {
      const current = await this.readProjectFile("blueprint.md");
      input = `## 重新设计架构

### 当前架构
${current}

### 题材分析
${genreAnalysis}

### 用户修改要求
${options.userDirective ?? "请重新审视架构设计"}

请重新设计小说架构，输出完整内容。`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const current = await this.readProjectFile("blueprint.md");
      input = `## 修改架构设计

### 当前架构
${current}

### 题材分析
${genreAnalysis}

### 用户修改要求
${options.userDirective}

请根据要求修改架构设计，输出完整的修改后内容。`;
    } else {
      input = `## 设计小说架构

### 题材分析
${genreAnalysis}

请读取 project.yaml 了解目标字数和卷数，然后设计完整的小说架构：
1. 选择叙事结构（三幕式/英雄之旅/起承转合等）
2. 设计各幕的章节分配和目标字数
3. 规划关键情节点
4. 设计节奏策略（高潮、低谷、喘息）

请输出完整的架构蓝图（Markdown 格式）。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["blueprint.md"],
      success: true,
    };
  }
}
