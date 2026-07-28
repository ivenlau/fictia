import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import {
  chapterPath,
  parseChapterPath,
  parseChapterNumber,
  DESIGN_DIR,
  type StageName,
  type AgentType,
} from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import { countWords } from "../utils/word-counter.js";
import { generateChapterSummary } from "../services/summary-chain.service.js";
import { readFileSafe, listFiles } from "../utils/file.js";
import { findChapterFile, findOutlineFile, extractOutlineTitle } from "../utils/chapter-files.js";
import {
  extractChapterNarrativeWeave,
  buildPreviousChapterSummary,
  chapterToAct,
} from "../utils/context-extractor.js";
import * as path from "path";

export class ChapterWriterAgent extends BaseAgent {
  protected stageName: StageName = "chapters";
  protected agentType: AgentType = "chapter-writer";
  protected agentName = "chapter-writer";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [
      `${DESIGN_DIR}/style-guide.md`,
      `${DESIGN_DIR}/art-design.md`,
      `${DESIGN_DIR}/narrative-weave.md`,
      `${DESIGN_DIR}/blueprint.md`,
      "world/setting.md",
      "world/rules.md",
      "outline/chapters/*.md",
    ];
  }

  getOutputFiles(): string[] {
    return ["chapters/*.md"];
  }

  async hasMoreWork(): Promise<boolean> {
    return (await this.findNextChapter()) !== null;
  }

  async getNextWorkItem(): Promise<string | null> {
    const next = await this.findNextChapter();
    if (next === null) return null;
    return `ch${String(next).padStart(2, "0")}`;
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    if (options?.incrementalTarget) {
      const match = options.incrementalTarget.match(/ch(\d+)/);
      if (match) {
        return this.writeChapter(Number(match[1]), options);
      }
    }

    const nextChapter = await this.findNextChapter();
    if (nextChapter === null) {
      return {
        output: "所有章节已完成",
        filesWritten: [],
        success: true,
      };
    }
    return this.writeChapter(nextChapter, options);
  }

  async writeChapter(
    chapterNumber: number,
    options?: AgentRunOptions
  ): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();

    // act 统一用 chapterToAct（修复历史兜底不一致导致的 ch08 跨 act 重复）；标题从大纲取
    const blueprint = await this.readProjectFile(`${DESIGN_DIR}/blueprint.md`);
    const actNumber = chapterToAct(chapterNumber, blueprint || undefined);
    const outlineFile = await findOutlineFile(this.novelDir, chapterNumber);
    const outlineContent = outlineFile ? (await readFileSafe(outlineFile)) ?? "" : "";
    const title = this.resolveChapterTitle(outlineFile, outlineContent);
    const outputPath = chapterPath(chapterNumber, actNumber, title);

    let input: string;
    if (options?.incrementalTarget || options?.userDirective) {
      // 用 findChapterFile 定位当前正文，不依赖 incrementalTarget 的路径格式
      const curFile = await findChapterFile(this.novelDir, chapterNumber);
      const current = curFile ? (await readFileSafe(curFile)) ?? "" : "";
      input = `## 修改第 ${chapterNumber} 章

### 当前章节正文
${current}

### 用户修改要求
${options.userDirective}

请根据要求修改章节，输出完整的修改后内容。`;

      this.lastUserBudget = [
        { name: "当前章节正文", chars: current.length },
        { name: "用户修改要求", chars: (options.userDirective ?? "").length },
      ];
    } else {
      const outline = outlineContent;

      // L3 推→拉：user message 只保留写作直接依据（大纲 + 本章伏笔指令 + 上章衔接）。
      // 风格规范在 system prompt「风格锚定」段（截断版）；世界观/角色/情感节拍/前章全文
      // 由 agent 按需用工具拉取（get_character / get_summary_chain / semantic_search / read_file），
      // 避免一次性塞满 user message 导致注意力稀释。参见 docs/chapter-writer-context-reform.md L3。
      const narrativeWeave = await this.readProjectFile(`${DESIGN_DIR}/narrative-weave.md`);
      const narrativeWeaveExcerpt = extractChapterNarrativeWeave(narrativeWeave, chapterNumber);

      let previousChapterNotes = "";
      if (chapterNumber > 1) {
        const prevFile = await findChapterFile(this.novelDir, chapterNumber - 1);
        if (prevFile) {
          const prevText = (await readFileSafe(prevFile)) ?? "";
          if (prevText) previousChapterNotes = buildPreviousChapterSummary(prevText);
        }
      }

      const todoGuidance = `**本章上下文需要你主动用工具按需拉取**（初始输入只含写作直接依据，其余按需获取，避免上下文膨胀）：
- 风格规范：已在系统提示词「风格锚定」段；详细语言/禁忌用 read_file 读 design/style-guide.md
- 前文连续性：\`get_summary_chain\`（前文摘要链，比前章全文精简）
- 出场角色：**用 \`get_character(角色名)\` 按名查，不要 read_file 猜 \`characters/\` 文件名**（命名规范 \`{名}_{主角|反派|配角|龙套}.md\`，用职业身份当后缀会猜错）
- 世界观/设定：\`semantic_search\` 召回，或 read_file 读 world/setting.md
- 情感节拍/意象：read_file 读 design/art-design.md（按需）
- **任何 \`read_file\` 前，若不确定路径，先 \`list_files\` 列目录确认**（避免猜路径报「文件不存在」）
- craft 技法：\`get_craft_doc\`（如对话场景查 dialogue、去AI查 anti-ai-writing）

**务必先调 \`todo\` 规划步骤，再按步执行**（见系统提示词「工作流程」）。`;

      input = `${options?.extraContext ? options.extraContext + "\n\n---\n\n" : ""}## 写作第 ${chapterNumber} 章${title ? `：${title}` : ""}

**act ${actNumber}** | 写入路径：${outputPath}

### 章节大纲
${outline}

### 本章伏笔指令（narrative-weave）
${narrativeWeaveExcerpt}

### 上章衔接
${previousChapterNotes || "（这是第一章，无前文衔接）"}

---

${todoGuidance}

请按照以下要求写作：
1. 严格遵循系统提示词中的风格规范与 craft 技法
2. 按章节大纲展开场景，执行伏笔/支线指令
3. 人物言行符合角色设定（用 \`get_character\` 查），地点/势力/历史符合世界设定（用 \`semantic_search\` 查）
4. 保持与前一章连续性（用 \`get_summary_chain\` 查前文）
5. 章节字数以大纲目标为准，允许 ±20% 浮动

正文结束后，附上写作备注：
- 本章字数
- 伏笔操作：本章埋设/强化/回收的伏笔及位置
- 支线推进：本章推进的支线及进展
- 新设定引入：本章引入的新设定元素
- 角色状态更新：主要角色的状态变化
- 下章衔接：为下一章留下的衔接点

请先 \`todo\` 规划，按步写作与核验（\`validate_style\` / \`scan_consistency\` / \`count_words\`），最后用 \`write_file\` 写入 ${outputPath}，并输出完整的章节正文和写作备注。`;

      // 收集 user 预算（推→拉后各块字符数），供调试视图度量瘦身效果。
      this.lastUserBudget = [
        ...(options?.extraContext
          ? [{ name: "extraContext(注入)", chars: options?.extraContext.length }]
          : []),
        { name: "章节大纲", chars: outline.length },
        { name: "本章伏笔指令", chars: narrativeWeaveExcerpt.length },
        { name: "上章衔接备注", chars: previousChapterNotes.length },
        { name: "写作引导", chars: todoGuidance.length },
      ];
    }

    const output = await this.runLLM(input, systemPrompt);

    const writtenContent = await readFileSafe(path.join(this.novelDir, outputPath));
    const wordCount = writtenContent ? countWords(writtenContent) : 0;

    // 章节写成功后蒸馏摘要写入摘要链——手动触发（不走 writing-loop）时也生成，
    // 供后续章节 get_summary_chain 跨章上下文使用。失败不阻塞。
    if (writtenContent) {
      try {
        await generateChapterSummary(path.basename(this.novelDir), chapterNumber);
      } catch (e) {
        console.warn(`[${this.agentName}] 章节摘要生成失败（不阻塞）`, e);
      }
    }

    return {
      output: `${output}\n\n---\n字数统计: ${wordCount}字`,
      filesWritten: [outputPath],
      success: true,
    };
  }

  /** 章节标题：优先大纲文件名（已含 sanitized 标题），回退大纲正文「标题：」行或 H1。 */
  private resolveChapterTitle(outlineFile: string | null, outlineContent: string): string | undefined {
    if (outlineFile) {
      const fromName = parseChapterPath(path.basename(outlineFile))?.title;
      if (fromName && fromName !== "未命名") return fromName;
    }
    return extractOutlineTitle(outlineContent);
  }

  private async findNextChapter(): Promise<number | null> {
    const outlineDir = path.join(this.novelDir, "outline", "chapters");
    const outlineFiles = await listFiles(outlineDir, { extensions: [".md"] });
    if (outlineFiles.length === 0) return null;

    const totalChapters = outlineFiles.length;

    const written = new Set<number>();
    const files = await listFiles(path.join(this.novelDir, "chapters"), { extensions: [".md"] });
    for (const filePath of files) {
      const num = parseChapterNumber(path.basename(filePath));
      if (num !== null) written.add(num);
    }

    for (let i = 1; i <= totalChapters; i++) {
      if (!written.has(i)) return i;
    }

    return null;
  }
}
