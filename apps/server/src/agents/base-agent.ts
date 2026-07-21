import { complete, stream, Type, type Model, type Context, type Message, type Tool, type AssistantMessage, type ToolCall, type ToolResultMessage } from "@earendil-works/pi-ai";
import type { StageName, AgentType } from "@fictia/shared";
import { loadPromptTemplate, loadCraftKnowledge } from "../utils/prompt-loader.js";
import { readFileSafe, listFiles, relativePath } from "../utils/file.js";
import { buildCharacterRegistry, buildCharacterQuickCard } from "../utils/context-extractor.js";
import { countWords, formatWordCount } from "../utils/word-counter.js";
import * as path from "path";
import * as fs from "fs/promises";

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
   * Build system prompt: base prompt + style guide anchoring.
   */
  protected async buildSystemPrompt(): Promise<string> {
    const basePrompt = await loadPromptTemplate(this.agentName);
    let prompt = basePrompt;

    // 注入 craft 知识（落在 # 知识加载 段下，# 专业能力 之前）
    const genre = await this.readNovelGenre();
    const craft = await loadCraftKnowledge(this.agentName, genre);
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
   * 读取 novel 的体裁（用于加载体裁卡）。优先 meta.json.genre；
   * 缺失则返回 undefined（体裁卡跳过，craft 知识仍加载）。
   */
  protected async readNovelGenre(): Promise<string | undefined> {
    const meta = await readFileSafe(path.join(this.novelDir, "meta.json"));
    if (meta) {
      try {
        const obj = JSON.parse(meta);
        if (typeof obj.genre === "string" && obj.genre) return obj.genre;
      } catch {
        // meta.json 非合法 JSON，忽略
      }
    }
    return undefined;
  }

  /**
   * Read style-guide.md as an anchor for all agents.
   */
  protected async readStyleGuide(): Promise<string | null> {
    return readFileSafe(path.join(this.novelDir, "style-guide.md"));
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
    const charDir = path.join(this.novelDir, "characters");
    const supportingFiles = await listFiles(path.join(charDir, "supporting"), { extensions: [".md"] });
    const candidates = [
      path.join(charDir, "protagonist.md"),
      path.join(charDir, "antagonist.md"),
      ...supportingFiles,
    ];

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
   * Tool tier: "standard" (5 tools) or "full" (9 tools).
   * Override in subclass to use full tools.
   */
  protected getToolTier(): "standard" | "full" {
    return "standard";
  }

  /**
   * Define the tools available to this agent.
   */
  protected getTools(): Tool[] {
    const standardTools: Tool[] = [
      {
        name: "read_project_file",
        description: "读取当前小说项目中的文件内容。可以读取任意工作区文件，如设定文件、角色文件、大纲文件等。路径相对于项目根目录。",
        parameters: Type.Object({
          path: Type.String({ description: "相对于项目根目录的文件路径，如 'world/setting.md', 'characters/protagonist.md', 'meta.json'" }),
        }),
      },
      {
        name: "write_project_file",
        description: "将内容写入当前小说项目中的文件。如果文件不存在会自动创建，包括必要的父目录。路径相对于项目根目录。",
        parameters: Type.Object({
          path: Type.String({ description: "相对于项目根目录的文件路径，如 'genre-analysis.md', 'world/setting.md'" }),
          content: Type.String({ description: "要写入的文件内容（Markdown 格式）" }),
        }),
      },
      {
        name: "edit_project_file",
        description: "对项目文件进行局部修改（精确文本替换）。适用于修改少量内容、调整措辞、补充段落等场景。如果需要大幅重写或调整整体结构，请使用 write_project_file。路径相对于项目根目录。",
        parameters: Type.Object({
          file_path: Type.String({ description: "相对于项目根目录的文件路径" }),
          old_text: Type.String({ description: "要替换的原文（必须与文件中的内容完全匹配，包括换行和缩进）" }),
          new_text: Type.String({ description: "替换后的内容" }),
          replace_all: Type.Optional(Type.Boolean({ description: "是否替换所有匹配项（默认 false，仅替换第一处）", default: false })),
        }),
      },
      {
        name: "list_project_files",
        description: "列出项目中的文件。可选按目录过滤和按扩展名过滤。返回相对于项目根目录的路径列表。",
        parameters: Type.Object({
          directory: Type.Optional(Type.String({ description: "要列出的子目录，如 'characters', 'chapters'。不填则列出全部。" })),
          extension: Type.Optional(Type.String({ description: "文件扩展名过滤，如 '.md', '.yaml'" })),
          recursive: Type.Optional(Type.Boolean({ description: "是否递归列出子目录。默认 true。" })),
        }),
      },
      {
        name: "count_words",
        description: "统计文本的字数。中文字符每个计1字，英文单词每个计1词。",
        parameters: Type.Object({
          text: Type.String({ description: "要统计字数的文本" }),
        }),
      },
    ];

    if (this.getToolTier() === "standard") return standardTools;

    return [
      ...standardTools,
      {
        name: "get_chapter_context",
        description: "获取写作指定章节所需的全部上下文：章节大纲、出场角色压缩参考卡、风格指南、前一章正文、世界观相关部分。",
        parameters: Type.Object({
          chapter_number: Type.Number({ description: "章节编号" }),
        }),
      },
      {
        name: "get_character",
        description: "获取指定角色的设定信息。支持两种模式：card（默认，返回压缩参考卡）和 full（返回完整文件）。",
        parameters: Type.Object({
          character_name: Type.String({ description: "角色名称（中文）" }),
          detail_level: Type.Optional(Type.Union([Type.Literal("card"), Type.Literal("full")], { description: "详情级别：card=压缩参考卡（默认），full=完整文件" })),
          chapter_number: Type.Optional(Type.Number({ description: "当前章节号（可选，用于过滤成长弧线）" })),
        }),
      },
      {
        name: "validate_style",
        description: "校验文本是否符合 style-guide.md 中定义的风格规范。返回校验结果和偏差提示。",
        parameters: Type.Object({
          text: Type.String({ description: "要校验的文本" }),
          dimension: Type.Optional(Type.String({ description: "校验维度：'sentence_length', 'dialogue', 'pacing', 'all'。默认 'all'。" })),
        }),
      },
      {
        name: "scan_consistency",
        description: "扫描项目文件的一致性。检查世界观规则、人物设定、伏笔状态等。返回发现的不一致项。",
        parameters: Type.Object({
          scope: Type.Optional(Type.String({ description: "扫描范围：'all' 全部文件, 'world' 仅世界观, 'characters' 仅人物, 'foreshadowing' 仅伏笔。默认 'all'。" })),
        }),
      },
    ];
  }

  /**
   * Execute a tool call and return the result.
   */
  protected async executeTool(name: string, args: Record<string, any>): Promise<string> {
    switch (name) {
      case "read_project_file": {
        const filePath = args.path as string;
        const fullPath = path.join(this.novelDir, filePath);
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          return content || "(文件为空)";
        } catch (err: any) {
          if (err.code === "ENOENT") return `错误：文件 "${filePath}" 不存在`;
          return `错误：读取文件失败 - ${err.message}`;
        }
      }

      case "write_project_file": {
        const filePath = args.path as string;
        const content = args.content as string;
        const fullPath = path.join(this.novelDir, filePath);
        try {
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content, "utf-8");
          return `已写入文件 "${filePath}" (${content.length} 字符)`;
        } catch (err: any) {
          return `错误：写入文件失败 - ${err.message}`;
        }
      }

      case "edit_project_file": {
        const filePath = args.file_path as string;
        const oldText = args.old_text as string;
        const newText = args.new_text as string;
        const replaceAll = args.replace_all as boolean ?? false;
        const fullPath = path.join(this.novelDir, filePath);
        try {
          const content = await readFileSafe(fullPath);
          if (content === null) return `错误：文件 "${filePath}" 不存在，无法编辑。请先使用 write_project_file 创建文件。`;
          if (!content.includes(oldText)) {
            return `错误：在 "${filePath}" 中未找到匹配的文本。请先使用 read_project_file 读取文件内容，确认要替换的文本后再编辑。`;
          }
          const count = content.split(oldText).length - 1;
          if (!replaceAll && count > 1) {
            return `警告：找到 ${count} 处匹配。默认只替换第一处。如需替换所有匹配，请设置 replace_all=true。`;
          }
          const newContent = replaceAll ? content.split(oldText).join(newText) : content.replace(oldText, newText);
          await fs.writeFile(fullPath, newContent, "utf-8");
          return `已编辑 "${filePath}" (${replaceAll ? count : 1} 处替换)`;
        } catch (err: any) {
          return `错误：编辑文件失败 - ${err.message}`;
        }
      }

      case "list_project_files": {
        const dir = args.directory as string | undefined;
        const ext = args.extension as string | undefined;
        const recursive = args.recursive !== false;
        const targetDir = dir ? path.join(this.novelDir, dir) : this.novelDir;
        const extensions = ext ? [ext] : undefined;
        const files = await listFiles(targetDir, { recursive, extensions });
        const relativeFiles = files.map((f) => relativePath(this.novelDir, f));
        return relativeFiles.length > 0 ? relativeFiles.join("\n") : "没有找到匹配的文件";
      }

      case "count_words": {
        const text = args.text as string;
        const count = countWords(text);
        return `字数: ${formatWordCount(count)} (${count}字)`;
      }

      case "get_chapter_context": {
        const chapterNum = String(args.chapter_number).padStart(2, "0");
        const context: Record<string, string | null> = {};
        context.outline = await readFileSafe(path.join(this.novelDir, `outline/chapters/ch${chapterNum}.md`));
        context.styleGuide = await readFileSafe(path.join(this.novelDir, "style-guide.md"));
        context.artDesign = await readFileSafe(path.join(this.novelDir, "art-design.md"));
        context.narrativeWeave = await readFileSafe(path.join(this.novelDir, "narrative-weave.md"));
        context.worldSetting = await readFileSafe(path.join(this.novelDir, "world/setting.md"));
        context.worldRules = await readFileSafe(path.join(this.novelDir, "world/rules.md"));

        // Build character quick cards from outline
        if (context.outline) {
          const charMatches = context.outline.match(/characters:\s*\[([^\]]*)\]/g);
          if (charMatches) {
            const charNames = new Set<string>();
            for (const match of charMatches) {
              const names = match.match(/"([^"]+)"/g);
              if (names) names.forEach((n) => charNames.add(n.replace(/"/g, "")));
            }
            const charCards: string[] = [];
            const candidates = [
              path.join(this.novelDir, "characters/protagonist.md"),
              path.join(this.novelDir, "characters/antagonist.md"),
              ...(await listFiles(path.join(this.novelDir, "characters/supporting"), { extensions: [".md"] })),
            ];
            for (const charName of charNames) {
              for (const candidate of candidates) {
                const content = await readFileSafe(candidate);
                if (content && content.includes(charName)) {
                  const card = buildCharacterQuickCard(content, charName, args.chapter_number);
                  if (card) charCards.push(card);
                  break;
                }
              }
            }
            if (charCards.length > 0) context.characters = charCards.join("\n\n---\n\n");
          }
        }

        // Previous chapter
        if (args.chapter_number > 1) {
          const prevNum = String(args.chapter_number - 1).padStart(2, "0");
          const chapterFiles = await listFiles(path.join(this.novelDir, "chapters"), { recursive: true, extensions: [".md"] });
          const prevFile = chapterFiles.find((f) => f.includes(`ch${prevNum}.md`));
          if (prevFile) context.previousChapter = await readFileSafe(prevFile);
        }

        const summary = Object.entries(context)
          .filter(([, v]) => v !== null)
          .map(([k, v]) => `## ${k}\n\n${v}`)
          .join("\n\n---\n\n");
        return summary || "没有找到章节上下文";
      }

      case "get_character": {
        const charName = args.character_name as string;
        const detailLevel = (args.detail_level as string) ?? "card";
        const charDir = path.join(this.novelDir, "characters");
        const candidates = [
          path.join(charDir, "protagonist.md"),
          path.join(charDir, "antagonist.md"),
          ...(await listFiles(path.join(charDir, "supporting"), { extensions: [".md"] })),
        ];
        for (const candidate of candidates) {
          const content = await readFileSafe(candidate);
          if (content && content.includes(charName)) {
            if (detailLevel === "full") return content;
            return buildCharacterQuickCard(content, charName, args.chapter_number);
          }
        }
        return `未找到角色: ${charName}`;
      }

      case "validate_style": {
        const text = args.text as string;
        const dimension = (args.dimension as string) ?? "all";
        const styleContent = await readFileSafe(path.join(this.novelDir, "style-guide.md"));
        if (!styleContent) return "style-guide.md 尚未创建，无法校验";
        const issues: string[] = [];
        if (dimension === "all" || dimension === "sentence_length") {
          const sentences = text.split(/[。！？.!?]/).filter((s: string) => s.trim().length > 0);
          const long = sentences.filter((s: string) => s.length > 80);
          if (long.length > sentences.length * 0.3) issues.push(`句式偏长：${long.length}/${sentences.length} 个句子超过80字`);
        }
        if (dimension === "all" || dimension === "pacing") {
          const paragraphs = text.split(/\n\n+/).filter((p: string) => p.trim().length > 0);
          const long = paragraphs.filter((p: string) => p.length > 500);
          if (long.length > 0) issues.push(`${long.length} 个段落超过500字，可能影响节奏`);
        }
        if (dimension === "all" || dimension === "dialogue") {
          const dialogueMatches = text.match(/["「」""''][^"「」""'']*["「」""'']/g);
          const dialogueLength = dialogueMatches ? dialogueMatches.join("").length : 0;
          const ratio = dialogueLength / text.length;
          if (ratio < 0.1) issues.push(`对话比例偏低 (${(ratio * 100).toFixed(1)}%)，可能缺乏互动感`);
          else if (ratio > 0.6) issues.push(`对话比例偏高 (${(ratio * 100).toFixed(1)}%)，可能缺乏描写`);
        }
        return issues.length === 0 ? "风格校验通过，未发现明显偏差" : `发现 ${issues.length} 个风格偏差：\n${issues.map((i: string) => `- ${i}`).join("\n")}`;
      }

      case "scan_consistency": {
        const scope = (args.scope as string) ?? "all";
        const issues: string[] = [];
        const narrativeWeave = await readFileSafe(path.join(this.novelDir, "narrative-weave.md"));
        const chapterFiles = await listFiles(path.join(this.novelDir, "chapters"), { recursive: true, extensions: [".md"] });
        const chapters: Record<string, string> = {};
        for (const f of chapterFiles) {
          const content = await readFileSafe(f);
          if (content) chapters[path.basename(f)] = content;
        }
        if ((scope === "all" || scope === "foreshadowing") && narrativeWeave) {
          const matches = narrativeWeave.match(/id:\s*"(FO-[^"]+)"/g);
          if (matches) {
            for (const match of matches) {
              const id = match.match(/"([^"]+)"/)?.[1];
              if (id && !Object.values(chapters).some((c) => c.includes(id))) {
                issues.push(`伏笔 ${id} 在 narrative-weave.md 中定义但未在任何章节中出现`);
              }
            }
          }
        }
        if (scope === "all" || scope === "characters") {
          const charFiles = await listFiles(path.join(this.novelDir, "characters"), { recursive: true, extensions: [".md"] });
          // Character name extraction kept for future use
          for (const f of charFiles) {
            const content = await readFileSafe(f);
            if (content) {
              const nameMatch = content.match(/name:\s*"([^"]+)"/);
              if (nameMatch) { /* charNames.push(nameMatch[1]) */ }
            }
          }
        }
        return issues.length === 0 ? "一致性扫描完成，未发现问题" : `发现 ${issues.length} 个一致性问题：\n${issues.map((i: string) => `- ${i}`).join("\n")}`;
      }

      default:
        return `错误：未知工具 "${name}"`;
    }
  }

  /**
   * Run the LLM with tool support (agentic loop).
   * The LLM can call read_project_file / write_project_file multiple times
   * before producing a final text response.
   */
  protected async runLLM(userMessage: string, systemPrompt?: string): Promise<string> {
    const tools = this.getTools();
    const messages: Message[] = [
      { role: "user", content: userMessage, timestamp: Date.now() },
    ];
    const resolvedSystemPrompt = systemPrompt ?? await this.buildSystemPrompt();

    console.log(`[${this.agentName}] Calling LLM with tools...`, {
      promptLength: resolvedSystemPrompt?.length ?? 0,
      messageLength: userMessage.length,
      toolCount: tools.length,
    });
    const startTime = Date.now();

    let finalText = "";

    for (let iteration = 0; this.maxToolIterations === 0 || iteration < this.maxToolIterations; iteration++) {
      const ctx: Context = {
        systemPrompt: resolvedSystemPrompt,
        messages,
        tools,
      };

      const response = await complete(this.model, ctx, {
        apiKey: this.apiKey,
      });

      if (response.errorMessage) {
        throw new Error(`LLM error: ${response.errorMessage}`);
      }

      // Extract text and tool calls from the response
      const textParts: string[] = [];
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          textParts.push(block.text);
        } else if (block.type === "toolCall") {
          toolCalls.push(block);
        }
      }

      const iterationText = textParts.join("");
      finalText += iterationText;

      // If no tool calls, we're done
      if (toolCalls.length === 0 || response.stopReason !== "toolUse") {
        break;
      }

      // Execute tool calls and add results to messages
      // Add the assistant message with tool calls
      messages.push(response);

      for (const tc of toolCalls) {
        console.log(`[${this.agentName}] Tool call: ${tc.name}`, tc.arguments);
        const result = await this.executeTool(tc.name, tc.arguments);
        console.log(`[${this.agentName}] Tool result: ${result.substring(0, 100)}...`);

        const toolResultMsg: ToolResultMessage = {
          role: "toolResult",
          toolCallId: tc.id,
          toolName: tc.name,
          content: [{ type: "text", text: result }],
          isError: result.startsWith("错误"),
          timestamp: Date.now(),
        };
        messages.push(toolResultMsg);
      }
    }

    console.log(`[${this.agentName}] LLM completed`, {
      elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      outputLength: finalText.length,
    });

    if (!finalText) {
      throw new Error(`Agent "${this.agentName}" returned empty content`);
    }

    return finalText;
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
