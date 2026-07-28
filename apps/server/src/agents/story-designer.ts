import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import { parseActDefinitions } from "../utils/context-extractor.js";
import { validateStoryDesign } from "../utils/chapter-files.js";
import { listFiles } from "../utils/file.js";
import path from "path";
import fs from "fs/promises";

export class StoryDesignerAgent extends BaseAgent {
  protected stageName: StageName = "story";
  protected agentType: AgentType = "story-designer";
  protected agentName = "story-designer";
  protected maxToolIterations = 0; // 不限制，支持长篇小说 150+ 章节

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [
      "design/blueprint.md",
      "design/art-design.md",
      "design/narrative-weave.md",
      "world/setting.md",
      "world/rules.md",
    ];
  }

  getOutputFiles(): string[] {
    return ["outline/act-*.md", "outline/chapters/*.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();

    const blueprint = await this.readProjectFile("design/blueprint.md");
    const acts = parseActDefinitions(blueprint ?? undefined);
    const firstActFile = acts && acts.length > 0 ? `outline/act-${acts[0].act}.md` : "outline/act-1.md";
    const actFileList = acts && acts.length > 0
      ? acts.map((a) => `outline/act-${a.act}.md`).join(", ")
      : "outline/act-1.md, outline/act-2.md, outline/act-3.md";
    // L3 推→拉：user message 只保留 blueprint（幕定义强依赖）。art-design/narrative-weave
    // 概览、世界观、角色、写作进度由 agent 按需用工具拉取，避免上下文膨胀。
    // 参见 docs/chapter-writer-context-reform.md。
    const todoGuidance = `**上下文需要你主动用工具按需拉取**（初始输入只含 blueprint 强依赖，其余按需获取）：
- art-design 意象/情感节拍：read_file design/art-design.md
- narrative-weave 伏笔/支线/彩蛋：read_file design/narrative-weave.md，或 \`get_foreshadowing_stats\` 看伏笔现状
- 世界观：read_file world/setting.md、world/rules.md
- 角色：\`get_character\`（按名查），或 read_file characters/*.md
- 重设计/增量时查写作进度：\`get_summary_chain\`（前文摘要）、\`get_foreshadowing_stats\`
- craft 技法：\`get_craft_doc\`（outline-methods/conflict/emotional-arcs/suspense/reversals/chapter-hooks）

**务必先调 \`todo\` 规划步骤**（见系统提示词「工作流程」），再逐幕逐章设计。

**产出方式（关键，违反则任务失败）**：每设计完一个 act 或章细纲，立即用 \`write_file\` 写入对应文件（多文件用 \`===FILE: <路径>===\` 分隔）。**严禁把设计当作回复文本输出**——不调 write_file = 产出为空 = 任务失败（会被产出校验拦截）。`;

    let input: string;
    if (options?.isRedo) {
      const existingOutlines = await this.readProjectFile(firstActFile);
      input = `## 重新设计故事大纲

### 当前大纲（部分）
${existingOutlines}

### design/blueprint.md（幕定义）
${blueprint}

${todoGuidance}

### 用户修改要求
${options.userDirective ?? "请重新审视故事大纲"}

请重新设计故事大纲，输出完整内容（用 \`===FILE:\` 分隔符分隔各文件）。`;
      this.lastUserBudget = [
        { name: "当前大纲", chars: existingOutlines.length },
        { name: "blueprint", chars: blueprint.length },
        { name: "写作引导", chars: todoGuidance.length },
        { name: "用户修改要求", chars: (options.userDirective ?? "").length },
      ];
    } else if (options?.incrementalTarget || options?.userDirective) {
      const target = options?.incrementalTarget ?? firstActFile;
      const current = await this.readProjectFile(target);
      input = `## 修改故事大纲

### 目标文件: ${target}

### 当前内容
${current}

### design/blueprint.md（幕定义）
${blueprint}

${todoGuidance}

### 用户修改要求
${options.userDirective}

请根据要求修改故事大纲，输出完整的修改后内容。`;
      this.lastUserBudget = [
        { name: "目标文件当前内容", chars: current.length },
        { name: "blueprint", chars: blueprint.length },
        { name: "写作引导", chars: todoGuidance.length },
        { name: "用户修改要求", chars: (options.userDirective ?? "").length },
      ];
    } else {
      input = `## 设计故事大纲

### design/blueprint.md（幕定义——act 数量与划分以此为准）
${blueprint}

${todoGuidance}

请设计完整的故事大纲（act 数量与划分以 blueprint 的 \`## 幕定义\` 为准，每幕产出一个 act 文件）：

### 1. 各幕概要 (${actFileList})
每幕含：剧情大纲（散文）/ 幕功能定位 / 章节因果链 / 角色弧光节点 / 节奏曲线 / 伏笔操作 / 字数预估（详见 system.md 幕设计模板）

### 2. 各章详细大纲 (outline/chapters/ch{NN}_act{N}-{标题}.md，如 ch01_act1-静室之谜.md)
每章含（详见 system.md 章设计模板，务必包含以下关键字段）：
- 一句话定位（本章存在的意义）
- 剧情大纲（散文 500-1500 字，故事层 WHAT）
- 价值电荷与情感弧（起止值 + +/- 方向）
- 场景序列（2-4 场，每场用场景三分法：Goal / Conflict 外部·内部·关系三层 / Outcome=Disaster|Decision 禁 Success + 镜头级关键节拍 + 技法提示）
- 章首钩子（类型 + 具体手法）
- 章末钩子（类型 + 具体手法，须驱动下一章）
- weave_notes：本章伏笔/支线/彩蛋指令（从 narrative-weave.md 提取）
- 节奏与篇幅（目标字数 + 场景分配）
- 写作备注（红线 / 风格 / 意象）
- 与上下章衔接（接力点）

产出前对照 system.md 的「章设计自检」清单自查。

请用 \`===FILE: ${firstActFile}===\`、\`===FILE: outline/chapters/ch01_act1-标题.md===\` 等分隔符分隔各文件内容（每幕一个 \`outline/act-{N}.md\`，章节细纲按 \`ch{NN}_act{N}-{标题}.md\` 命名，章节号补 2 位，act 取自 blueprint 幕定义，标题用本章标题）。`;
      this.lastUserBudget = [
        { name: "blueprint", chars: blueprint.length },
        { name: "写作引导", chars: todoGuidance.length },
      ];
    }

    const output = await this.runLLM(input, systemPrompt);

    // P1: 验证 agent 是否真的产出了大纲文件——防止「把设计当文本输出却没 write_file」的假完成。
    const outlineFiles = await listFiles(path.join(this.novelDir, "outline"), {
      recursive: true,
      extensions: [".md"],
    });
    if (outlineFiles.length === 0) {
      return {
        output,
        filesWritten: [],
        success: false,
        error:
          "story-designer 未产出任何大纲文件（agent 可能把设计当作文本输出而未用 write_file 落盘）。请确认模型遵循 ===FILE: + write_file 产出格式，或换更强的模型重试。",
      };
    }

    // 轻量质量门：产出后结构校验（确定性，不调 LLM、不阻塞）。
    // 报告单独落盘到 reviews/story-design-validation.md（前端文件树可见）；
    // 不拼 output——writeAgentOutput 按 ===FILE: 切片会丢弃 trailing 文本。
    const validation = await validateStoryDesign(this.novelDir, blueprint ?? undefined);
    const filesWritten = ["outline/*.md"];
    const reportPath = path.join(this.novelDir, "reviews", "story-design-validation.md");
    if (validation.passed) {
      await fs.rm(reportPath, { force: true }).catch(() => {});
    } else {
      const report = `# 故事设计校验报告\n\n校验未通过，以下结构问题建议复核后重跑：\n\n${validation.issues.map((i) => `- ${i}`).join("\n")}\n`;
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, report, "utf-8");
      filesWritten.push("reviews/story-design-validation.md");
      console.warn(`[story-designer] 设计校验未通过（见 reviews/story-design-validation.md）：\n${validation.issues.map((i) => `  - ${i}`).join("\n")}`);
    }

    return {
      output,
      filesWritten,
      success: true,
      warnings: validation.passed ? undefined : validation.issues,
    };
  }
}
