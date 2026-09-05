import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import { readFileSafe } from "../utils/file.js";
import { listChapterFiles } from "../utils/chapter-files.js";

export class ConsistencyCheckerAgent extends BaseAgent {
  protected stageName: StageName = "consistency";
  protected agentType: AgentType = "consistency-checker";
  protected agentName = "consistency-checker";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [
      "design/art-design.md",
      "design/narrative-weave.md",
      "world/setting.md",
      "world/rules.md",
      "world/timeline.md",
      "chapters/**/*.md",
    ];
  }

  getOutputFiles(): string[] {
    return ["reviews/consistency-report.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();

    // 统一章节清单：act 动态命名兼容 + 同号取最大 act + 按章号排序
    const chapters = await listChapterFiles(this.novelDir);
    const latest = chapters.length > 0 ? chapters[chapters.length - 1] : null;
    const latestContent = latest ? ((await readFileSafe(latest.path)) ?? "") : "";
    const latestRel = latest
      ? latest.path.slice(this.novelDir.length + 1).replace(/\\/g, "/")
      : "";
    const scope = latest
      ? `ch01-ch${String(latest.number).padStart(2, "0")}`
      : "无章节";

    // L3 推→拉：user message 只保留最新章正文（审核刚需）+ 扫描范围。设定概览、历史章节
    // 由 agent 按需用工具拉取（get_summary_chain / read_file / get_character / semantic_search），
    // 避免一次性塞满全部章节正文导致注意力稀释。参见 docs/chapter-writer-context-reform.md。
    const todoGuidance = `**校验所需上下文请主动用工具按需拉取**（初始输入只含最新章正文 + 扫描范围）：
- 设定文件：read_file design/art-design.md / narrative-weave.md / world/setting.md / world/rules.md / world/timeline.md
- 历史章节摘要：\`get_summary_chain\` / \`get_chapter_summary\`（不要逐章读全文）
- 角色：\`get_character\`（按名查）
- 伏笔现状：\`get_foreshadow\` / \`get_foreshadowing_stats\`
- 相关设定召回：\`semantic_search\`

**务必先调 \`todo\` 规划步骤**（见系统提示词「工作流程」，按追踪表逐维度核验），再逐步执行。`;

    let input: string;
    if (options?.userDirective) {
      const currentReport = await this.readProjectFile("reviews/consistency-report.md");
      input = `## 修改一致性报告

### 当前报告
${currentReport}

### 用户修改要求
${options.userDirective}

请根据要求修改一致性报告，输出完整的修改后内容。`;
      this.lastUserBudget = [
        { name: "当前报告", chars: currentReport.length },
        { name: "用户修改要求", chars: (options.userDirective ?? "").length },
      ];
    } else {
      input = `## 全局一致性校验

### 扫描范围
${scope}

### 最新章节正文（${latestRel || "无"}）
${latestContent || "（无章节）"}

${todoGuidance}

请从以下维度进行全面一致性校验：
1. 设定一致性：世界观规则是否被违反（力量等级、术语、尺度、文化）
2. 人物一致性：角色性格、能力、外貌、关系是否前后一致
3. 时间线一致性：事件顺序、时间跨度、旅程时间是否合理
4. 伏笔回收：已埋伏笔是否按计划回收（参考 design/narrative-weave.md）
5. 支线连续性：支线是否按计划推进和收束
6. 风格漂移：文风是否在不知不觉中改变
7. 意象一致性：核心意象的使用是否连贯

输出报告必须包含以下结构（便于自动解析评分与问题数）：

## 总体评价
- **综合评分**：A/B/C/D（A=优秀 B=良好 C=需要修改 D=需要重写）
- **一句话评价**：[总体一致性印象]

## 问题清单

### 严重问题（必须修改）
| 序号 | 位置 | 问题类型 | 问题描述 | 修复方案 |
|------|------|---------|---------|---------|
| 1 | [章节/位置] | [类型] | [描述] | [方案] |

### 一般问题（建议修改）
| 序号 | 位置 | 问题类型 | 问题描述 | 修复方案 |
|------|------|---------|---------|---------|

### 细节问题（可选修改）
| 序号 | 位置 | 问题类型 | 问题描述 | 修复方案 |
|------|------|---------|---------|---------|

## 时间线总览
[事件顺序与时间跨度检查]

## 伏笔追踪表
| 伏笔 | 埋设章节 | 计划回收 | 实际状态 |
|------|---------|---------|---------|

## 支线追踪表
| 支线 | 起始 | 当前状态 | 是否按计划 |
|------|------|---------|-----------|

## 物品追踪表
| 物品 | 状态 | 出现章节 |
|------|------|---------|

## 角色状态追踪表
| 角色 | 当前状态 | 是否一致 |
|------|---------|---------|

## 设定漂移检查表
[力量体系/术语/文化等是否前后一致]

请输出完整的一致性报告（Markdown 格式），并用 write_file 写入 reviews/consistency-report.md。`;
      this.lastUserBudget = [
        { name: "最新章正文", chars: latestContent.length },
        { name: "写作引导", chars: todoGuidance.length },
      ];
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["reviews/consistency-report.md"],
      success: true,
    };
  }
}
