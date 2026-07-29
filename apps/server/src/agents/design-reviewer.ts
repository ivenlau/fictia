import { BaseAgent, type AgentRunResult, type AgentRunOptions } from "./base-agent.js";
import type { StageName, AgentType } from "@fictia/shared";
import type { Model } from "@earendil-works/pi-ai";
import { readFileSafe, listFiles } from "../utils/file.js";
import * as path from "path";

/** stageName -> 设计产出文件（供 reviewer 读取审核）。 */
const DESIGN_OUTPUT_FILES: Record<string, string[]> = {
  genre_analysis: ["design/genre-analysis.md"],
  architecture: ["design/blueprint.md"],
  style: ["design/style-guide.md"],
  art_design: ["design/art-design.md"],
  narrative_weave: ["design/narrative-weave.md"],
  world: ["world/setting.md", "world/rules.md", "world/timeline.md"],
};

/**
 * 设计审核员（B 层 LLM 审核）：审核设计阶段产出的语义质量（完整性/深度/一致性/
 * 可写作性/创意），产出 reviews/{stage}-design-review.md，含综合评分 + 严重/一般
 * 问题表（复用 parseReviewVerdict 解析通过条件）。design-loop 据此 review-fix。
 *
 * 区别于 editor（审章节正文）+ consistency-checker（跨章一致性）：design-reviewer
 * 审设计产出本身的质量。区别于 A 层 validateXxx（确定性结构校验）：design-reviewer
 * 审语义（够不够好），不审结构（在不在）。
 */
export class DesignReviewerAgent extends BaseAgent {
  protected stageName: StageName = "editor";
  protected agentType: AgentType = "design-reviewer";
  protected agentName = "design-reviewer";

  constructor(novelDir: string, model: Model<"openai-completions">, apiKey: string) {
    super(novelDir, model, apiKey);
  }

  getInputFiles(): string[] {
    return [];
  }

  getOutputFiles(): string[] {
    return ["reviews/*-design-review.md"];
  }

  async run(options?: AgentRunOptions): Promise<AgentRunResult> {
    const stage = (options?.incrementalTarget as string) ?? "";
    return this.reviewDesign(stage);
  }

  /** 审核指定 design stage 的产出，产出 reviews/{stage}-design-review.md（含 verdict）。 */
  async reviewDesign(stageName: string): Promise<AgentRunResult> {
    const systemPrompt = await this.buildSystemPrompt();
    const parts: string[] = [];
    const files = DESIGN_OUTPUT_FILES[stageName] ?? [];
    if (stageName === "characters") {
      const charFiles = await listFiles(path.join(this.novelDir, "characters"), { extensions: [".md"] });
      for (const f of charFiles) {
        const c = await readFileSafe(f);
        if (c) parts.push(`### ${path.relative(this.novelDir, f).replace(/\\/g, "/")}\n\n${c}`);
      }
    } else if (stageName === "story") {
      const outlineFiles = await listFiles(path.join(this.novelDir, "outline"), {
        recursive: true,
        extensions: [".md"],
      });
      for (const f of outlineFiles.slice(0, 3)) {
        const c = await readFileSafe(f);
        if (c) parts.push(`### ${path.relative(this.novelDir, f).replace(/\\/g, "/")}\n\n${c}`);
      }
    } else {
      for (const f of files) {
        const c = await readFileSafe(path.join(this.novelDir, f));
        if (c) parts.push(`### ${f}\n\n${c}`);
      }
    }
    const designContent = parts.join("\n\n---\n\n") || "（未找到产出）";
    const reviewPath = `reviews/${stageName}-design-review.md`;

    const input = `## 审核 design 产出（${stageName}）

### 待审核产出
${designContent}

请从以下维度审核该设计产出的**语义质量**（结构完整由确定性校验负责，你专注语义）：
1. **完整性**：是否覆盖该阶段应有要点，有无明显遗漏
2. **深度**：内容是否扎实、有具体细节（非空泛/敷衍/占位）
3. **一致性**：与上游设定（题材/架构/风格等）是否一致、有无矛盾
4. **可写作性**：下游章节写作能否据此执行（指令清晰、可落地）
5. **创意/质量**：是否有亮点、达专业水准

综合评分：A/B/C/D（A=优秀 B=良好 C=需要修改 D=需要重写）

输出格式（严格遵守，供自动解析通过条件）：
- **综合评分**：A/B/C/D
- ### 严重问题（必须修改）
| 序号 | 位置 | 问题类型 | 问题描述 | 修复方案 |
|------|------|---------|---------|---------|
- ### 一般问题（建议修改）
| 序号 | 位置 | 问题类型 | 问题描述 | 修复方案 |
|------|------|---------|---------|---------|
- 亮点（做得好的地方）

请输出完整的设计审核报告（Markdown），并用 write_file 写入 ${reviewPath}。`;

    const output = await this.runLLM(input, systemPrompt);
    return { output, filesWritten: [reviewPath], success: true };
  }
}
