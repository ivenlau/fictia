import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";

export class CharacterDesignerAgent extends BaseAgent {
  protected stageName: StageName = "characters";
  protected agentType: AgentType = "character-designer";
  protected agentName = "character-designer";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [
      "world/setting.md",
      "blueprint.md",
      "style-guide.md",
      "art-design.md",
      "narrative-weave.md",
    ];
  }

  getOutputFiles(): string[] {
    return [
      "characters/protagonist.md",
      "characters/antagonist.md",
      "characters/supporting/*.md",
      "characters/relationships.md",
    ];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const context = await this.buildContext(this.getInputFiles());

    let input: string;
    if (options?.isRedo) {
      const protagonist = await this.readProjectFile("characters/protagonist.md");
      const antagonist = await this.readProjectFile("characters/antagonist.md");
      const relationships = await this.readProjectFile("characters/relationships.md");
      input = `## 重新设计人物

### 当前人物设定
--- protagonist.md ---
${protagonist}
--- antagonist.md ---
${antagonist}
--- relationships.md ---
${relationships}

### 前置产出
${context}

### 用户修改要求
${options.userDirective ?? "请重新审视人物设计"}

请重新设计人物体系，输出各文件内容，用 \`===FILE: characters/protagonist.md===\` 等分隔符分隔。`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const target = options?.incrementalTarget ?? "characters/protagonist.md";
      const current = await this.readProjectFile(target);
      input = `## 修改人物设定

### 目标文件: ${target}

### 当前内容
${current}

### 前置产出
${context}

### 用户修改要求
${options.userDirective}

请根据要求修改人物设定，输出完整的修改后内容。`;
    } else {
      input = `## 设计人物体系

### 前置产出
${context}

请设计完整的人物体系：

### 1. 主角 (characters/protagonist.md)
每个角色文件必须以 YAML front-matter 开头，包含 name, role, identity, traits, relationships, growth_arc, language_style 字段。

### 2. 反派 (characters/antagonist.md)
同样详细程度，与主角的对立关系。

### 3. 重要配角 (characters/supporting/*.md)
每个重要配角一个文件，确保支线设计中的配角都被覆盖。

### 4. 人物关系图 (characters/relationships.md)
所有角色之间的关系、关系动态变化弧线、冲突矩阵。

请用 \`===FILE: characters/protagonist.md===\` 等分隔符分隔各文件内容。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: [
        "characters/protagonist.md",
        "characters/antagonist.md",
        "characters/relationships.md",
      ],
      success: true,
    };
  }
}
