import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import {
  buildNarrativeWeaveSummary,
  buildArtDesignSummary,
  buildWorldQuickRef,
  buildPreviousChapterSummary,
} from "../utils/context-extractor.js";
import { listFiles, readFileSafe, relativePath } from "../utils/file.js";
import * as path from "path";

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

    const chapterFiles = await listFiles(
      path.join(this.novelDir, "chapters"),
      { recursive: true, extensions: [".md"] }
    );
    const sortedChapterFiles = chapterFiles.sort();

    const artDesign = await this.readProjectFile("design/art-design.md");
    const narrativeWeave = await this.readProjectFile("design/narrative-weave.md");
    const worldSetting = await this.readProjectFile("world/setting.md");
    const worldRules = await this.readProjectFile("world/rules.md");
    const worldTimeline = await this.readProjectFile("world/timeline.md");
    const characterRegistry = await this.loadCharacterRegistry();

    const settingParts: string[] = [];
    if (artDesign) settingParts.push(`## design/art-design.md（概览）\n\n${buildArtDesignSummary(artDesign)}`);
    if (narrativeWeave) settingParts.push(`## design/narrative-weave.md（概览）\n\n${buildNarrativeWeaveSummary(narrativeWeave)}`);
    const worldRef = buildWorldQuickRef(worldSetting, worldRules);
    if (worldRef) settingParts.push(`## 世界观速查\n\n${worldRef}`);
    if (worldTimeline) settingParts.push(`## world/timeline.md\n\n${worldTimeline}`);
    settingParts.push(`## 角色总览\n\n${characterRegistry}`);
    const settings = settingParts.join("\n\n---\n\n");

    const chapterContents: string[] = [];
    const latestFile = sortedChapterFiles.length > 0 ? sortedChapterFiles[sortedChapterFiles.length - 1] : null;

    for (const f of sortedChapterFiles) {
      const content = await readFileSafe(f);
      if (!content) continue;
      const relPath = relativePath(this.novelDir, f).replace(/\\/g, "/");

      if (f === latestFile) {
        chapterContents.push(`### ${relPath}（最新章节 - 全文）\n\n${content}`);
      } else {
        const summary = buildPreviousChapterSummary(content);
        chapterContents.push(`### ${relPath}\n\n${summary}`);
      }
    }

    const scope = sortedChapterFiles.length > 0
      ? `ch01-ch${String(sortedChapterFiles.length).padStart(2, "0")}`
      : "无章节";

    let input: string;
    if (options?.userDirective) {
      const currentReport = await this.readProjectFile("reviews/consistency-report.md");
      input = `## 修改一致性报告

### 当前报告
${currentReport}

### 用户修改要求
${options.userDirective}

请根据要求修改一致性报告，输出完整的修改后内容。`;
    } else {
      input = `## 全局一致性校验

### 扫描范围
${scope}

### 设定概览
${settings}

### 章节内容
${chapterContents.join("\n\n---\n\n")}

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

请输出完整的一致性报告（Markdown 格式）。`;
    }

    const output = await this.runLLM(input, systemPrompt);

    return {
      output,
      filesWritten: ["reviews/consistency-report.md"],
      success: true,
    };
  }
}
