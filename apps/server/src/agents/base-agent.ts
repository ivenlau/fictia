import { stream, type Model, type Context, type Message } from "@earendil-works/pi-ai";
import { DESIGN_DIR, type StageName, type AgentType, type AgentRunTrace, type PromptBudget, type PromptBudgetItem } from "@fictia/shared";
import { loadPromptTemplate, loadCraftKnowledge } from "../utils/prompt-loader.js";
import { readFileSafe } from "../utils/file.js";
import { listCharacterFiles } from "../utils/chapter-files.js";
import { readPreferences } from "../utils/user-materials.js";
import { assembleReferenceForInjection, type AssembledReference } from "../utils/reference-works.js";
import { injectSectionsBefore, type PromptSection } from "../utils/prompt-sections.js";
import { buildCharacterRegistry } from "../utils/context-extractor.js";
import { runAgentSession } from "./agent-runner.js";
import { toolRegistry, type ToolContext } from "../tools/index.js";
import { fileService } from "../services/file.service.js";
import * as path from "path";

export interface AgentRunResult {
  output: string;
  filesWritten: string[];
  success: boolean;
  error?: string;
  warnings?: string[];
  /** 本次运行的调试 trace（若调用方传入 traceFilename 则有值）。 */
  trace?: AgentRunTrace;
  /** trace 落盘文件名（agent-outputs 下）。 */
  traceFilename?: string;
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
  /**
   * 调试 trace 文件名（agent-outputs 下）。提供则 agent 自行把 trace 增量写入该文件，
   * 供调试视图实时读取；并在结果里回传 trace。未提供（如 rewrite 路由）则不落盘。
   */
  traceFilename?: string;
}

/** style-guide 注入 system 的字符上限：超出截断，完整可用 read_project_file 读取。
 *  避免全文（部分 novel 达 12-28k 字）与 user 侧本 act 提取重复、撑爆上下文。 */
const STYLE_GUIDE_MAX_CHARS = 5000;

export abstract class BaseAgent {
  protected abstract stageName: StageName;
  protected abstract agentType: AgentType;
  protected abstract agentName: string;
  protected novelDir: string;
  protected model: Model<"openai-completions">;
  protected apiKey: string;
  /** 最大工具迭代次数，0 表示不限制 */
  protected maxToolIterations = 20;

  // ===== 调试 trace 接线（由 createAgent / runAgent / runStage 注入）=====
  /** 模型 id（写入 trace modelUsed）。 */
  modelId = "";
  /** provider id（写入 trace providerUsed）。 */
  providerId = "";
  /** trace 落盘文件名；由调用方经 options 注入，为空则不写 trace 文件。 */
  traceFilename?: string;
  /** 最近一次 runLLM 的完整 trace（失败诊断用）。 */
  lastTrace?: AgentRunTrace;
  /** 最近一次 buildSystemPrompt 收集的 system 各块字符数（预算诊断）。 */
  protected lastSystemBudget: PromptBudgetItem[] = [];
  /** 最近一次构建 user message 收集的各块字符数（子类填充；预算诊断）。 */
  protected lastUserBudget: PromptBudgetItem[] = [];

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
   * Build system prompt: base prompt + 注入段。各段按 sections 数组顺序拼到
   * `# 专业能力` 之前（injectSectionsBefore）：用户偏好 → 已加载知识 →
   * 风格锚定·对标参考 → 风格锚定。
   */
  protected async buildSystemPrompt(): Promise<string> {
    const basePrompt = await loadPromptTemplate(this.agentName);
    const sections: PromptSection[] = [];

    // C1 用户偏好（创作偏好，优先级最高，置顶）—— materials/prompts/preferences.md
    const prefs = await readPreferences(this.novelDir);
    if (prefs && prefs.enabled && prefs.content.trim()) {
      sections.push({
        level: 1,
        title: "用户偏好 (作者常驻指令，优先级最高)",
        body: prefs.content.trim(),
      });
    }

    // 已加载知识（craft 写作技法 + 体裁卡）
    const genre = await this.readNovelGenre();
    const craft = await loadCraftKnowledge(this.agentName, genre, this.novelDir);
    if (craft) {
      sections.push({ level: 2, title: "已加载知识", body: craft });
    }

    // 参考作品产出（风格指纹 / 参考体裁 / 参考技法；借鉴创作规律，禁止复制原句）
    const ref = await this.readReferenceInjection();
    if (ref?.fingerprint.text) {
      sections.push({
        level: 1,
        title: "风格锚定·对标参考 (借鉴其创作规律，禁止复制原句)",
        body: ref.fingerprint.text,
      });
    }
    if (ref?.genre.text) {
      sections.push({
        level: 1,
        title: "参考体裁 (借鉴其体裁打法，禁止照搬设定)",
        body: ref.genre.text,
      });
    }
    if (ref?.craft.text) {
      sections.push({
        level: 1,
        title: "参考技法 (借鉴其技法，禁止复制原文)",
        body: ref.craft.text,
      });
    }

    // 风格锚定
    const styleGuide = await this.readStyleGuide();
    if (styleGuide) {
      sections.push({
        level: 1,
        title: "风格锚定 (所有产出必须严格遵守)",
        body: styleGuide,
      });
    }

    // 收集 system 预算（basePrompt 模板 + 各注入段），供调试视图量化上下文构成。
    this.lastSystemBudget = [
      { name: "basePrompt(模板)", chars: basePrompt.length },
      ...sections.map((s) => ({ name: s.title, chars: s.body.length })),
    ];

    return injectSectionsBefore(basePrompt, sections);
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
   * 风格锚定：读取 style-guide.md 并限长注入 system。
   *
   * 全文注入会与 chapter-writer user 侧的 extractStyleStageNotes（本 act 提取）重复，
   * 且部分 novel 的 style-guide 达 12-28k 字。这里保留前 STYLE_GUIDE_MAX_CHARS 字
   * （总体调性 + 语言规范通常在前），尾部提示完整文件可用 read_project_file 读取。
   * act 专属风格锚点由 chapter-writer 经 extractStyleStageNotes 注入 user message。
   */
  protected async readStyleGuide(): Promise<string | null> {
    const full = await readFileSafe(path.join(this.novelDir, DESIGN_DIR, "style-guide.md"));
    if (!full) return null;
    if (full.length <= STYLE_GUIDE_MAX_CHARS) return full;
    return (
      full.slice(0, STYLE_GUIDE_MAX_CHARS) +
      "\n\n…（已截断，完整风格指南见 design/style-guide.md，可用 read_project_file 读取）"
    );
  }

  /**
   * 读取已启用参考作品的三类产出（风格指纹 / 参考体裁 / 参考技法），拼成注入段
   * （借鉴创作规律，禁止复制原句）。三类任一有内容即返回，否则 null。
   */
  protected async readReferenceInjection(): Promise<AssembledReference | null> {
    const ref = await assembleReferenceForInjection(this.novelDir);
    if (!ref.fingerprint.text && !ref.genre.text && !ref.craft.text) return null;
    return ref;
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

    // 组装 prompt 预算（system/user 各块字符数），下发给 trace 供调试视图量化上下文构成。
    const systemTotal = this.lastSystemBudget.reduce((n, b) => n + b.chars, 0);
    const userTotal = this.lastUserBudget.reduce((n, b) => n + b.chars, 0);
    const promptBudget: PromptBudget = {
      system: this.lastSystemBudget,
      user: this.lastUserBudget,
      systemTotal,
      userTotal,
    };

    console.log(`[${this.agentName}] Calling LLM with tools...`, {
      promptLength: resolvedSystemPrompt.length,
      messageLength: userMessage.length,
      toolCount: tools.length,
      systemTotal,
      userTotal,
    });
    const startTime = Date.now();
    const novelId = path.basename(this.novelDir);
    const traceFile = this.traceFilename;

    // 串行化 trace 落盘：onTraceUpdate 在每个工具/轮次结束时高频触发，若并发
    // fs.writeFile 同一文件会导致 JSON 损坏（多次 truncate+写交错）。用 promise
    // 链保证一次只写一个；finally 里 await 确保返回前（含抛错路径）写盘全部落定。
    let writeChain: Promise<void> = Promise.resolve();
    const onTraceUpdate = traceFile
      ? (t: AgentRunTrace) => {
          this.lastTrace = t;
          writeChain = writeChain.then(() =>
            fileService.writeAgentTrace(novelId, traceFile, t).catch((e) =>
              console.error(`[${this.agentName}] trace write failed`, e),
            ),
          );
        }
      : undefined;

    let text = "";
    try {
      const res = await runAgentSession({
        model: this.model,
        apiKey: this.apiKey,
        systemPrompt: resolvedSystemPrompt,
        messages: [{ role: "user", content: userMessage, timestamp: Date.now() }],
        tools,
        agentType: this.agentType,
        modelLabel: this.modelId,
        providerLabel: this.providerId,
        maxIterations: this.maxToolIterations,
        promptBudget,
        onToolCall: (name, input) => console.log(`[${this.agentName}] Tool call: ${name}`, input),
        onToolResult: (name, _input, result) =>
          console.log(`[${this.agentName}] Tool result: ${result.substring(0, 100)}...`),
        onTraceUpdate,
      });
      text = res.text;
      this.lastTrace = res.trace;
    } finally {
      await writeChain;
    }

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
