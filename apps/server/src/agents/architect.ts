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
    return ["design/genre-analysis.md"];
  }

  getOutputFiles(): string[] {
    return ["design/blueprint.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const genreAnalysis = await this.readProjectFile("design/genre-analysis.md");

    let input: string;
    if (options?.isRedo) {
      const current = await this.readProjectFile("design/blueprint.md");
      input = `## 重新设计架构

### 当前架构
${current}

### 题材分析
${genreAnalysis}

### 用户修改要求
${options.userDirective ?? "请重新审视架构设计"}

请重新设计小说架构，输出完整内容。`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const current = await this.readProjectFile("design/blueprint.md");
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

请根据上方「小说元信息」中的目标章节数，参考系统提示里的「幕数规划建议」决定 act 数量与每幕章节分配，然后设计完整的小说架构：
1. 选择叙事结构（三幕式/英雄之旅/起承转合等）
2. 设计各幕的章节分配和目标字数（act 数随目标章节数动态决定）
3. 规划关键情节点
4. 设计节奏策略（高潮、低谷、喘息）

请输出完整的架构蓝图（Markdown 格式），必须包含 \`## 幕定义\` JSON 块（每幕的 act 编号 + chapters 章节号列表，所有章节须覆盖且不重叠）。`;
    }

    const fullInput = options?.extraContext ? `${options.extraContext}\n\n---\n\n${input}` : input;
    const output = await this.runLLM(fullInput, systemPrompt);

    return {
      output,
      filesWritten: ["design/blueprint.md"],
      success: true,
    };
  }
}
