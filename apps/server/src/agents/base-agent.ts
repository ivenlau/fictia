import { stream, type Model, type Context, type Message } from "@earendil-works/pi-ai";
import { DESIGN_DIR, type StageName, type AgentType } from "@fictia/shared";
import { loadPromptTemplate, loadCraftKnowledge } from "../utils/prompt-loader.js";
import { readFileSafe } from "../utils/file.js";
import { listCharacterFiles } from "../utils/chapter-files.js";
import { readPreferences } from "../utils/user-materials.js";
import { buildCharacterRegistry } from "../utils/context-extractor.js";
import { runAgentSession } from "./agent-runner.js";
import { toolRegistry, type ToolContext } from "../tools/index.js";
import * as path from "path";

export interface AgentRunResult {
  output: string;
  filesWritten: string[];
  success: boolean;
  error?: string;
}

export interface AgentRunOptions {
  userDirective?: string;
  isRedo?: boolean;
  incrementalTarget?: string;
  /**
   * 成功后是否自动确认阶段。默认 true（auto-runner 行为）。
   * 设 false 时置 pending_confirm，等用户显式 /confirm（对齐 skill 人工确认纪律）。
   */
  autoConfirm?: boolean;
  /**
   * 额外上下文块（如动态写作空间的实体状态），拼到 agent 输入前。
   */
  extraContext?: string;
}

export abstract class BaseAgent {
  protected abstract stageName: StageName;
  protected abstract agentType: AgentType;
  protected abstract agentName: string;
  protected novelDir: string;
  protected model: Model<"openai-completions">;
  protected apiKey: string;
  /** 最大工具迭代次数，0 表示不限制 */
  protected maxToolIterations = 20;

  constructor(
    novelDir: string,
    model: Model<"openai-completions">,
    apiKey: string,
  ) {
    this.novelDir = novelDir;
    this.model = model;
    this.apiKey = apiKey;
  }

  get name(): string {
    return this.agentName;
  }

  get stage(): StageName {
    return this.stageName;
  }

  get type(): AgentType {
    return this.agentType;
  }

  /**
   * Build system prompt: base prompt + 用户偏好 + craft 知识 + style guide anchoring。
   * 注入顺序（都落在 # 专业能力 之前）：用户偏好 → 已加载知识 → 风格锚定。
   */
  protected async buildSystemPrompt(): Promise<string> {
    const basePrompt = await loadPromptTemplate(this.agentName);
    let prompt = basePrompt;

    // C1 用户偏好（创作偏好，优先级最高，置顶）—— materials/prompts/preferences.md
    const prefs = await readPreferences(this.novelDir);
    if (prefs && prefs.enabled && prefs.content.trim()) {
      prompt = prompt.replace(
        "# 专业能力",
        `# 用户偏好 (作者常驻指令，优先级最高)\n\n${prefs.content.trim()}\n\n# 专业能力`,
      );
    }

    // 注入 craft 知识（含自定义技法 + 体裁卡），落在 # 专业能力 之前
    const genre = await this.readNovelGenre();
    const craft = await loadCraftKnowledge(this.agentName, genre, this.novelDir);
    if (craft) {
      prompt = prompt.replace(
        "# 专业能力",
        `## 已加载知识\n\n${craft}\n\n# 专业能力`,
      );
    }

    // 风格锚定
    const styleGuide = await this.readStyleGuide();
    if (styleGuide) {
      prompt = prompt.replace(
        "# 专业能力",
        `# 风格锚定 (所有产出必须严格遵守)\n\n${styleGuide}\n\n# 专业能力`,
      );
    }
    return prompt;
  }

  /**
   * 读取 novel 的体裁（用于加载体裁卡）。优先 meta.json.genreCard
   * （素材库面板选卡写入），回退 meta.json.genre（自由文本，存量书兼容）。
   * 缺失则返回 undefined（体裁卡跳过，craft 知识仍加载）。
   */
  protected async readNovelGenre(): Promise<string | undefined> {
    const meta = await readFileSafe(path.join(this.novelDir, "meta.json"));
    if (meta) {
      try {
        const obj = JSON.parse(meta);
        if (typeof obj.genreCard === "string" && obj.genreCard) return obj.genreCard;
        if (typeof obj.genre === "string" && obj.genre) return obj.genre;
      } catch {
        // meta.json 非合法 JSON，忽略
      }
    }
    return undefined;
  }

  /**
   * 头脑风暴探索模式（设计阶段 1-8）：产出 3-5 个创意方向，不写最终文件。
   * 对齐 skill 的 brainstorm 三段式之「探索」段。无工具调用，纯文本产出。
   */
  async runExplore(directive?: string): Promise<string> {
    const input = [
      "# 头脑风暴 · 探索阶段",
      "",
      "在产出正式内容前，先探索 3-5 个创意方向。每个方向必须包含：",
      "- **方向名称**：一句话概括",
      "- **具体示例**：给出具体的设定/情节/风格示例（不能只说方向）",
      "- **叙事价值**：选择这个方向，故事会获得什么",
      "- **风险与代价**：可能失去什么或面临什么挑战",
      "- **参照作品**（如有）：同类成功案例",
      "",
      "**发散约束**（必须满足）：",
      "- 至少一个反直觉选项（违反该题材常见套路）",
      "- 至少一个极端选项（与推荐方案形成鲜明对比）",
      "- 给出明确推荐：说「我推荐方向 X，因为...」",
      "",
      directive ? `用户补充要求：${directive}` : "",
      "",
      "只输出方向分析，不要产出最终的设定文件。",
    ].join("\n");
    return this.streamLLM(input, () => {});
  }

  /**
   * Read style-guide.md as an anchor for all agents.
   */
  protected async readStyleGuide(): Promise<string | null> {
    return readFileSafe(path.join(this.novelDir, DESIGN_DIR, "style-guide.md"));
  }

  /**
   * Read a project file by relative path.
   */
  protected async readProjectFile(relativePath: string): Promise<string> {
    const content = await readFileSafe(
      path.join(this.novelDir, relativePath)
    );
    return content ?? "";
  }

  /**
   * Build the context block from multiple input files.
   */
  protected async buildContext(files: string[]): Promise<string> {
    const parts: string[] = [];
    for (const file of files) {
      const content = await this.readProjectFile(file);
      if (content) {
        parts.push(`## ${file}\n\n${content}`);
      }
    }
    return parts.join("\n\n---\n\n");
  }

  /**
   * Load all character files and build a lightweight registry (Tier 1).
   */
  protected async loadCharacterRegistry(): Promise<string> {
    const candidates = await listCharacterFiles(this.novelDir);

    const characterFiles: { path: string; content: string }[] = [];
    for (const filePath of candidates) {
      const content = await readFileSafe(filePath);
      if (content) {
        characterFiles.push({
          path: path.relative(this.novelDir, filePath).replace(/\\/g, "/"),
          content,
        });
      }
    }

    return buildCharacterRegistry(characterFiles);
  }


  /**
   * Run the LLM with tool support (agentic loop).
   * 统一经 agent-runner（pi-agent-core runAgentLoop）：原生 function calling +
   * 自动工具执行/回填/多轮。工具来自 ToolRegistry（按 agentType 过滤），
   * 替代原手写 complete() 循环与 getTools/executeTool。
   */
  protected async runLLM(userMessage: string, systemPrompt?: string): Promise<string> {
    const resolvedSystemPrompt = systemPrompt ?? await this.buildSystemPrompt();
    const ctx: ToolContext = {
      novelId: path.basename(this.novelDir),
      novelDir: this.novelDir,
    };
    const tools = toolRegistry.getToolsForAgent(ctx, this.agentType);

    console.log(`[${this.agentName}] Calling LLM with tools...`, {
      promptLength: resolvedSystemPrompt.length,
      messageLength: userMessage.length,
      toolCount: tools.length,
    });
    const startTime = Date.now();

    const { text } = await runAgentSession({
      model: this.model,
      apiKey: this.apiKey,
      systemPrompt: resolvedSystemPrompt,
      messages: [{ role: "user", content: userMessage, timestamp: Date.now() }],
      tools,
      maxIterations: this.maxToolIterations,
      onToolCall: (name, input) => console.log(`[${this.agentName}] Tool call: ${name}`, input),
      onToolResult: (name, _input, result) =>
        console.log(`[${this.agentName}] Tool result: ${result.substring(0, 100)}...`),
    });

    console.log(`[${this.agentName}] LLM completed`, {
      elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      outputLength: text.length,
    });

    return text;
  }

  /**
   * Run the agent with streaming (no tool support — for simple agents).
   */
  protected async streamLLM(
    userMessage: string,
    onDelta: (text: string) => void,
    systemPrompt?: string,
  ): Promise<string> {
    const chunks: string[] = [];
    const ctx: Context = {
      systemPrompt: systemPrompt ?? await this.buildSystemPrompt(),
      messages: [{ role: "user", content: userMessage, timestamp: Date.now() }],
    };

    const eventStream = stream(this.model, ctx, {
      apiKey: this.apiKey,
    });

    for await (const event of eventStream) {
      if (event.type === "text_delta") {
        chunks.push(event.delta);
        onDelta(event.delta);
      }
    }

    return chunks.join("");
  }

  /**
   * For incremental stages: check if there's more work to do.
   */
  async hasMoreWork(): Promise<boolean> {
    return false;
  }

  /**
   * For incremental stages: describe the next work item.
   */
  async getNextWorkItem(): Promise<string | null> {
    return null;
  }

  /**
   * Execute the agent's work.
   */
  abstract run(options?: AgentRunOptions): Promise<AgentRunResult>;

  /**
   * Get input files for this stage (used by update propagation).
   */
  abstract getInputFiles(): string[];

  /**
   * Get output files for this stage.
   */
  abstract getOutputFiles(): string[];
}
