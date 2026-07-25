import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";

export class NarrativeWeaverAgent extends BaseAgent {
  protected stageName: StageName = "narrative_weave";
  protected agentType: AgentType = "narrative-weaver";
  protected agentName = "narrative-weaver";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return ["design/genre-analysis.md", "design/blueprint.md", "design/art-design.md", "design/style-guide.md"];
  }

  getOutputFiles(): string[] {
    return ["design/narrative-weave.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const context = await this.buildContext(this.getInputFiles());

    let input: string;
    if (options?.isRedo) {
      const current = await this.readProjectFile("design/narrative-weave.md");
      input = `## 重新设计叙事编织

### 当前叙事编织
${current}

### 前置产出
${context}

### 用户修改要求
${options.userDirective ?? "请重新审视叙事编织设计"}

请重新设计叙事编织方案，输出完整内容。`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const current = await this.readProjectFile("design/narrative-weave.md");
      input = `## 修改叙事编织

### 当前叙事编织
${current}

### 前置产出
${context}

### 用户修改要求
${options.userDirective}

请根据要求修改叙事编织方案，输出完整的修改后内容。`;
    } else {
      input = `## 设计叙事编织方案

### 前置产出
${context}

请设计完整的叙事编织方案，包括：

### 1. 伏笔体系 (foreshadowing)
为每条伏笔设计：
- 唯一ID (FO-XX)
- 名称
- 埋设章节、场景、方法、文本提示
- 触发章节和方法（读者开始怀疑的时刻）
- 揭示章节、方法、情感冲击
- 关联角色、世界规则、主题连接

### 2. 支线设计 (subplots)
为每条支线设计：
- 唯一ID (SP-XX)
- 名称和主题
- 活跃章节列表
- 起止章节
- 与主线的交汇点（具体章节和事件）
- 情感弧线
- 对主题的呼应

### 3. 彩蛋设计 (easter_eggs)
设计若干彩蛋：
- 唯一ID (EE-XX)
- 类型（互文致敬/隐藏线索/名字彩蛋等）
- 位置、内容
- 隐藏含义和读者奖励
- 发现难度

### 4. 交织节奏表 (weave_schedule)
按章节列出每章的：
- 伏笔活动（埋设/触发/揭示）
- 支线活动
- 彩蛋

请输出完整的叙事编织方案（Markdown 格式）。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["design/narrative-weave.md"],
      success: true,
    };
  }
}
