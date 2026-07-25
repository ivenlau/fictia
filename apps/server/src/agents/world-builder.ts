import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";

export class WorldBuilderAgent extends BaseAgent {
  protected stageName: StageName = "world";
  protected agentType: AgentType = "world-builder";
  protected agentName = "world-builder";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return ["design/genre-analysis.md", "design/blueprint.md", "design/art-design.md", "design/narrative-weave.md"];
  }

  getOutputFiles(): string[] {
    return ["world/setting.md", "world/rules.md", "world/timeline.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const context = await this.buildContext(this.getInputFiles());

    let input: string;
    if (options?.isRedo) {
      const setting = await this.readProjectFile("world/setting.md");
      const rules = await this.readProjectFile("world/rules.md");
      const timeline = await this.readProjectFile("world/timeline.md");
      input = `## 重新构建世界观

### 当前世界观
--- setting.md ---
${setting}
--- rules.md ---
${rules}
--- timeline.md ---
${timeline}

### 前置产出
${context}

### 用户修改要求
${options.userDirective ?? "请重新审视世界观设定"}

请重新构建世界观，输出三个文件的完整内容，用 \`===FILE: world/setting.md===\` 等分隔符分隔。`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const target = options?.incrementalTarget ?? "world/setting.md";
      const current = await this.readProjectFile(target);
      input = `## 修改世界观

### 目标文件: ${target}

### 当前内容
${current}

### 前置产出
${context}

### 用户修改要求
${options.userDirective}

请根据要求修改世界观，输出完整的修改后内容。`;
    } else {
      input = `## 构建世界观

### 前置产出
${context}

请构建完整的世界观，分三个文件输出：

### world/setting.md - 世界设定
- 世界名称
- 地理（大陆、区域、重要地点）
- 历史（纪元、重大事件）
- 社会（权力结构、经济、文化）

### world/rules.md - 规则体系
- 修炼/能力体系（阶段、突破规则、限制）
- 战斗体系
- 魔法/特殊能力体系
- 其他核心规则

### world/timeline.md - 时间线
- 按时间顺序列出重大历史事件
- 标注与故事相关的事件

请用 \`===FILE: world/setting.md===\` 等分隔符分隔三个文件的内容。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["world/setting.md", "world/rules.md", "world/timeline.md"],
      success: true,
    };
  }
}
