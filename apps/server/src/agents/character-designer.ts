import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import { CHARACTER_TYPES, type StageName, type AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import { readFileSafe } from "../utils/file.js";
import { listCharacterFiles } from "../utils/chapter-files.js";
import * as path from "path";

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
      "design/blueprint.md",
      "design/style-guide.md",
      "design/art-design.md",
      "design/narrative-weave.md",
    ];
  }

  getOutputFiles(): string[] {
    return ["characters/*.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const context = await this.buildContext(this.getInputFiles());

    const namingRule =
      `命名规范：每个角色一个文件 \`characters/{角色名}_{类型}.md\`，类型 ∈ {${CHARACTER_TYPES.join(", ")}}。` +
      `用 \`===FILE: characters/{角色名}_{类型}.md===\` 分隔符分隔各文件内容。`;

    let input: string;
    if (options?.isRedo) {
      const existing = await this.readExistingCharacters();
      const relationships = await this.readProjectFile("characters/relationships.md");
      input = `## 重新设计人物

### 当前人物设定
${existing}

### 人物关系图
${relationships}

### 前置产出
${context}

### 用户修改要求
${options.userDirective ?? "请重新审视人物设计"}

请重新设计人物体系，输出各文件内容。${namingRule}`;
    } else if (options?.incrementalTarget || options?.userDirective) {
      const target = options?.incrementalTarget ?? "characters/relationships.md";
      const current = await this.readProjectFile(target);
      input = `## 修改人物设定

### 目标文件: ${target}

### 当前内容
${current}

### 前置产出
${context}

### 用户修改要求
${options.userDirective}

请根据要求修改人物设定，输出完整的修改后内容。${namingRule}`;
    } else {
      input = `## 设计人物体系

### 前置产出
${context}

请设计完整的人物体系。${namingRule}

### 1. 主角 → characters/{主角名}_主角.md
每个角色文件必须以 YAML front-matter 开头，包含 name, role, identity, traits, relationships, growth_arc, language_style 字段（role 值须与文件名类型一致：主角/反派/配角/龙套）。

### 2. 反派 → characters/{反派名}_反派.md
同样详细程度，与主角的对立关系。

### 3. 重要配角 → characters/{配角名}_配角.md
每个重要配角一个文件，确保支线设计中的配角都被覆盖。

### 4. 人物关系图 → characters/relationships.md
所有角色之间的关系、关系动态变化弧线、冲突矩阵。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["characters/*.md"],
      success: true,
    };
  }

  /** 读现有所有角色文件，拼成文本块供 redo 参考。 */
  private async readExistingCharacters(): Promise<string> {
    const files = await listCharacterFiles(this.novelDir);
    const parts: string[] = [];
    for (const f of files) {
      const content = await readFileSafe(f);
      if (content) {
        parts.push(`--- ${path.relative(this.novelDir, f).replace(/\\/g, "/")} ---\n${content}`);
      }
    }
    return parts.join("\n\n") || "（暂无角色文件）";
  }
}
