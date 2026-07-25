import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";

export class StyleDesignerAgent extends BaseAgent {
  protected stageName: StageName = "style";
  protected agentType: AgentType = "style-designer";
  protected agentName = "style-designer";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return ["design/genre-analysis.md", "design/blueprint.md"];
  }

  getOutputFiles(): string[] {
    return ["design/style-guide.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const genreAnalysis = await this.readProjectFile("design/genre-analysis.md");
    const blueprint = await this.readProjectFile("design/blueprint.md");

    let input: string;
    if (options?.isRedo) {
      const current = await this.readProjectFile("design/style-guide.md");
      input = `## 重新设计风格

### 当前风格指南
${current}

### 题材分析
${genreAnalysis}

### 架构设计
${blueprint}

### 用户修改要求
${options.userDirective ?? "请重新审视风格设计"}

请重新设计风格指南，输出完整内容。`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const current = await this.readProjectFile("design/style-guide.md");
      input = `## 修改风格指南

### 当前风格指南
${current}

### 题材分析
${genreAnalysis}

### 架构设计
${blueprint}

### 用户修改要求
${options.userDirective}

请根据要求修改风格指南，输出完整的修改后内容。`;
    } else {
      input = `## 设计小说风格

### 题材分析
${genreAnalysis}

### 架构设计
${blueprint}

请设计完整的小说风格指南，包括：
1. 叙事视角（主视角、辅助视角）
2. 语言风格（基调、句式偏好、对话风格）
3. 文学手法偏好（允许、限制、禁止）
4. 节奏规范（战斗、日常、转折场景）
5. 参考风格（附 2-3 段示范文本）

请输出完整的风格指南（Markdown 格式）。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["design/style-guide.md"],
      success: true,
    };
  }
}
