import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";

export class ArtDirectorAgent extends BaseAgent {
  protected stageName: StageName = "art_design";
  protected agentType: AgentType = "art-director";
  protected agentName = "art-director";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return ["design/genre-analysis.md", "design/blueprint.md", "design/style-guide.md"];
  }

  getOutputFiles(): string[] {
    return ["design/art-design.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const context = await this.buildContext(this.getInputFiles());

    let input: string;
    if (options?.isRedo) {
      const current = await this.readProjectFile("design/art-design.md");
      input = `## 重新设计艺术方案

### 当前艺术设计
${current}

### 前置产出
${context}

### 用户修改要求
${options.userDirective ?? "请重新审视艺术设计"}

请重新设计艺术方案，输出完整内容。`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const current = await this.readProjectFile("design/art-design.md");
      input = `## 修改艺术设计

### 当前艺术设计
${current}

### 前置产出
${context}

### 用户修改要求
${options.userDirective}

请根据要求修改艺术设计，输出完整的修改后内容。`;
    } else {
      input = `## 设计小说艺术方案

### 前置产出
${context}

请设计完整的小说艺术方案，包括：
1. 意象体系（核心意象、反复出现的象征符号及其含义和使用章节）
2. 情感节拍（每章的目标情感）
3. 叙事技巧（回忆穿插、不可靠叙述者等，不含伏笔——伏笔由叙事编织师负责）

请输出完整的艺术设计方案（Markdown 格式）。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["design/art-design.md"],
      success: true,
    };
  }
}
