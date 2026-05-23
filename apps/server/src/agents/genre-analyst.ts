import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";

export class GenreAnalystAgent extends BaseAgent {
  protected stageName: StageName = "genre_analysis";
  protected agentType: AgentType = "genre-analyst";
  protected agentName = "genre-analyst";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [];
  }

  getOutputFiles(): string[] {
    return ["genre-analysis.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();

    let input: string;
    if (options?.isRedo) {
      const current = await this.readProjectFile("genre-analysis.md");
      input = `## 重新进行题材分析

### 当前分析结果
${current}

### 用户修改要求
${options.userDirective ?? "请重新审视题材分析"}

请根据 meta.json 中的 genre 和其他元数据，重新进行题材分析。`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const current = await this.readProjectFile("genre-analysis.md");
      input = `## 修改题材分析

### 当前分析结果
${current}

### 用户修改要求
${options.userDirective}

请根据用户要求修改题材分析，输出完整的修改后内容。`;
    } else {
      const meta = await this.readProjectFile("meta.json");
      input = `## 进行题材分析

### 项目信息
${meta}

请根据项目信息进行题材分析。

分析要求：
1. 确定题材类型和子类型
2. 提取该题材的核心要素
3. 分析读者期待
4. 总结常见套路和模式
5. 探索创新空间
6. 可选：分析参考作品

如果项目包含 description（简介/核心创意），请重点围绕该创意展开分析。

请输出完整的题材分析报告（Markdown 格式）。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["genre-analysis.md"],
      success: true,
    };
  }
}
