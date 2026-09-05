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
import { findChapterFile, findOutlineFile, extractOutlineTitle, listChapterFiles } from "../utils/chapter-files.js";
import { listEntities } from "../services/entity-store.js";
import { parsePlannedChapter } from "../services/entity.service.js";
import {
  extractChapterNarrativeWeave,
  buildPreviousChapterSummary,
  chapterToAct,
} from "../utils/context-extractor.js";
import * as path from "path";
import type { ProseReport } from "../utils/prose-check.js";

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
      // 伏笔到期提醒：计划回收章已到仍未回收的伏笔强制进视野（治「埋了忘收」）
      const overdueForeshadowNote = await this.buildOverdueForeshadowNote(chapterNumber);

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

${overdueForeshadowNote}
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
        { name: "伏笔到期提醒", chars: overdueForeshadowNote.length },
        { name: "上章衔接备注", chars: previousChapterNotes.length },
        { name: "写作引导", chars: todoGuidance.length },
      ];
    }

    const output = await this.runLLM(input, systemPrompt);

    const writtenContent = await readFileSafe(path.join(this.novelDir, outputPath));
    const wordCount = writtenContent ? countWords(writtenContent) : 0;

    // 产出验证：agent 必须 write_file 落盘。没产出说明 agent 把正文当文本输出而未调
    // write_file（假完成），直接判失败——对齐 story-designer P1。writing-loop 据此走 review-fix。
    if (!writtenContent) {
      return {
        output,
        filesWritten: [],
        success: false,
        error:
          "chapter-writer 未产出章节正文（agent 可能把正文当作文本输出而未用 write_file 落盘）。请确认模型遵循 write_file 产出，或换更强的模型重试。",
      };
    }

    // 章节写成功后蒸馏摘要写入摘要链——手动触发（不走 writing-loop）时也生成，
    // 供后续章节 get_summary_chain 跨章上下文使用。失败不阻塞。
    if (writtenContent) {
      try {
        await generateChapterSummary(path.basename(this.novelDir), chapterNumber);
      } catch (e) {
        console.warn(`[${this.agentName}] 章节摘要生成失败（不阻塞）`, e);
      }
    }

    // 写作段触达轮次上限但正文已落盘：不判失败，降级为警告（后续审核循环兜底质量）。
    const warnings = this.lastRunHitTurnLimit
      ? ["写作触达工具轮次上限被切断，章节可能不完整（审核循环会继续检查）。"]
      : undefined;

    return {
      output: `${output}\n\n---\n字数统计: ${wordCount}字`,
      filesWritten: [outputPath],
      success: true,
      warnings,
    };
  }

  /**
   * 定向修复：按编辑审核报告逐条用 edit_file 精改，**不重写整章**。
   *
   * 取代 review-fix 对 writeChapter 的复用——后者走「修改第 X 章」分支，prompt 收尾
   * 「输出完整修改后内容」会鼓励重写，叠加默认迭代上限，一次「改几个点」跑成
   * 「长 todo + 跨章改 + 跑满上限」。editor 报告的「修改建议」本身已是可执行的
   * edit 指令（原文→改后），故这里收敛为定向 edit、压到 ≤8 轮。
   *
   * success 仅代表「本轮修复已执行」，是否真正达标由下一轮 editor.reviewChapter 重判
   * （与原 writeChapter 在 review-fix 场景语义一致：落盘 ≠ 审核通过）。
   */
  async applyReviewFix(chapterNumber: number, reviewText: string): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();

    const curFile = await findChapterFile(this.novelDir, chapterNumber);
    if (!curFile) {
      return {
        output: "",
        filesWritten: [],
        success: false,
        error: `applyReviewFix: 找不到第 ${chapterNumber} 章的正文文件，无法定向修复`,
      };
    }
    const outputPath = path.relative(this.novelDir, curFile).replace(/\\/g, "/");
    const REVIEW_FIX_MAX_ITERATIONS = 8;

    const input = `## 定向修复第 ${chapterNumber} 章（按编辑审核报告精改）

### 目标章节文件
${outputPath}（需要定位片段时用 \`read_file\` 读取相应段落，**不要整章重写**）

### 编辑审核报告
${reviewText}

### 执行要求（违反则任务失败）
1. **只处理上面审核报告「问题清单」中的「严重问题」和「一般问题」**，逐条用 \`edit_file\` 做最小改动；「细节问题」可跳过。
2. 报告每条的「修改建议」已给出明确改法（原文→改后），**照做**即可；仅当与正文实际文字对不上时，就近适配。
3. **禁止 \`write_file\` 整章正文**、禁止重写未出问题的段落、禁止新增或删减情节。
4. **禁止跨章修改**：报告可能引用别章作对照，但只允许改本章 \`${outputPath}\`。
5. **不要先 \`todo\` 规划长流程**——逐条定位→\`edit_file\` 即可，改完就停。
6. 全部改完后用 \`count_words\` 核一次字数即可，**不要反复 \`validate_style\` / \`scan_consistency\`**。

本轮最多约 ${REVIEW_FIX_MAX_ITERATIONS} 次工具往返，优先处理严重问题。`;

    this.lastUserBudget = [
      { name: "审核报告", chars: reviewText.length },
      { name: "定向修复指令", chars: input.length - reviewText.length },
    ];

    const output = await this.runLLM(input, systemPrompt, REVIEW_FIX_MAX_ITERATIONS);

    // success 判定：修复后章节文件仍在即视为本轮执行完成（是否达标由下一轮 editor 重判）。
    const stillExists = await readFileSafe(path.join(this.novelDir, outputPath));
    if (!stillExists) {
      return {
        output,
        filesWritten: [],
        success: false,
        error: "applyReviewFix: 修复后章节正文文件丢失",
      };
    }
    return {
      output,
      filesWritten: [outputPath],
      success: true,
    };
  }

  /**
   * 定向修复：按确定性 prose 检测的 blocking findings 逐条用 edit_file 改掉（禁用词/句式/比喻过密）。
   *
   * 取代 prose-fix 对 writeChapter 的复用--确定性检测出的问题本就是「定位->改几处」，
   * 用定向 edit 即可，无需重写整章。draft 后 + review-fix 后都会调用（后者兜底 review-fix
   * 改写可能引入的禁用词，避免 editor 反复挑硬规、review-fix 改 A 引入 B 的死循环）。
   */
  async applyProseFix(chapterNumber: number, prose: ProseReport): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();

    const curFile = await findChapterFile(this.novelDir, chapterNumber);
    if (!curFile) {
      return {
        output: "",
        filesWritten: [],
        success: false,
        error: `applyProseFix: 找不到第 ${chapterNumber} 章的正文文件，无法定向修复`,
      };
    }
    const outputPath = path.relative(this.novelDir, curFile).replace(/\\/g, "/");
    const PROSE_FIX_MAX_ITERATIONS = 8;

    const findings = prose.blocking
      .map(
        (f, i) =>
          `${i + 1}. [${f.type}] 第${f.line}行：${f.message}\n   原文片段：${f.excerpt}`,
      )
      .join("\n");

    const input = `## 定向修复第 ${chapterNumber} 章（确定性 prose 检测的硬规问题）

### 目标章节文件
${outputPath}（需要定位片段时用 \`read_file\` 读取相应段落，**不要整章重写**）

### 确定性检测发现的 blocking 问题（必须全部修复）
${findings}

### 执行要求（违反则任务失败）
1. 逐条用 \`edit_file\` 改掉上述 blocking 问题（禁用词/禁用句式/比喻过密等）。
2. **禁止 \`write_file\` 整章**、禁止重写未出问题的段落、禁止新增删减情节、**禁止跨章修改**。
3. **不要先 \`todo\` 规划长流程**，逐条定位->\`edit_file\` 即可，改完就停。
4. 改完用 \`count_words\` 核一次字数即可，不要反复 \`validate_style\`。

本轮最多约 ${PROSE_FIX_MAX_ITERATIONS} 次工具往返。`;

    this.lastUserBudget = [
      { name: "prose blocking 问题", chars: findings.length },
      { name: "定向修复指令", chars: input.length - findings.length },
    ];

    const output = await this.runLLM(input, systemPrompt, PROSE_FIX_MAX_ITERATIONS);

    const stillExists = await readFileSafe(path.join(this.novelDir, outputPath));
    if (!stillExists) {
      return {
        output,
        filesWritten: [],
        success: false,
        error: "applyProseFix: 修复后章节正文文件丢失",
      };
    }
    return {
      output,
      filesWritten: [outputPath],
      success: true,
    };
  }

  /**
   * 一致性修复：按 consistency-checker 报告逐条定向修复（允许跨章 + 设定文档）。
   *
   * 与 applyReviewFix 的区别：一致性矛盾天然可能跨章（第 3 章与第 7 章冲突），
   * 修复点也可能落在设定文档（正文没错、设定漂移时改设定）。纪律不变：
   * edit_file 最小改动、禁止整章重写、禁止新增删减情节。
   * 修复是否达标由复检（consistency-checker 重跑）判定。
   */
  async applyConsistencyFix(reportText: string): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const CONSISTENCY_FIX_MAX_ITERATIONS = 16;

    const input = `## 按一致性校验报告定向修复（可跨章 / 涉及设定文档）

### 一致性校验报告
${reportText}

### 执行要求（违反则任务失败）
1. 只处理报告「问题清单」中的「严重问题」和「一般问题」，逐条用 \`edit_file\` 做最小改动；「细节问题」可跳过。
2. 修复位置以报告的「位置/修复方案」为准：正文矛盾改正文（允许跨多个章节文件），设定漂移则改对应设定文档（design/*.md 或 world/*.md）。
3. **禁止 \`write_file\` 整章/整文档**、禁止重写未出问题的段落、禁止新增或删减情节。
4. 修复不得引入新矛盾：保住报告「时间线/伏笔/支线/角色状态追踪表」中的既有事实。
5. **不要先 \`todo\` 规划长流程**——逐条定位→\`edit_file\` 即可，改完就停。

本轮最多约 ${CONSISTENCY_FIX_MAX_ITERATIONS} 次工具往返，优先处理严重问题。`;

    this.lastUserBudget = [
      { name: "一致性报告", chars: reportText.length },
      { name: "修复指令", chars: input.length - reportText.length },
    ];

    const output = await this.runLLM(input, systemPrompt, CONSISTENCY_FIX_MAX_ITERATIONS);
    const filesWritten = this.lastTrace?.filesWritten ?? [];
    return {
      output,
      filesWritten,
      success: true,
      warnings: this.lastRunHitTurnLimit
        ? ["一致性修复触达轮次上限被切断，可能未改完"]
        : undefined,
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

  /**
   * 伏笔到期提醒：计划回收章已到（chapterNumber >= plannedChapter）仍未 resolved/suspended
   * 的伏笔注入 user message。plannedChapter 取实体字段（实体索引时解析）；旧实体库无字段
   * 则现解析「回收位置」。实体库不可用/无到期伏笔时返回空串，不阻塞写作。
   */
  private async buildOverdueForeshadowNote(chapterNumber: number): Promise<string> {
    try {
      const foreshadows = listEntities(path.basename(this.novelDir), "foreshadowing");
      if (foreshadows.length === 0) return "";
      const overdue = foreshadows
        .filter((f) => f.state !== "resolved" && f.state !== "suspended")
        .map((f) => ({
          id: f.id,
          name: f.name,
          planned:
            typeof f.fields.plannedChapter === "number"
              ? f.fields.plannedChapter
              : parsePlannedChapter(f.fields.resolve),
        }))
        .filter((f): f is { id: string; name: string; planned: number } => f.planned != null && chapterNumber >= f.planned);
      if (overdue.length === 0) return "";
      return [
        "### ⚠ 伏笔到期提醒（必须处理）",
        "",
        ...overdue.map(
          (f) =>
            `- [${f.id}] ${f.name}：计划第 ${f.planned} 章回收，本章已到期/超期。本章应安排回收或明确推进（写备注时更新伏笔状态），不得无视。`,
        ),
        "",
      ].join("\n");
    } catch {
      return "";
    }
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
