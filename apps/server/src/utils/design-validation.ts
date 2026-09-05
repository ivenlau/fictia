/**
 * 设计阶段产出的确定性结构校验（A 层质量保证）。
 *
 * 7 个 validate 函数，检查各设计 agent 产出的必填章节/字段/ID 格式/文件存在。
 * 结构规则从各 agent 的 system.md「输出规范」提取。返回 {passed, issues}，
 * 供 agent run() 接入（失败落 reviews/{agent}-validation.md + warnings），
 * 复用 story-designer 的 validateStoryDesign 模式。
 *
 * 只查结构完整（字段在不在/格式对不对），不查语义质量（深度/一致性）--后者由
 * design-reviewer（B 层 LLM 审核）负责。
 */
import * as path from "path";
import { readFileSafe } from "./file.js";
import { listCharacterFiles } from "./chapter-files.js";
import { parseYamlFrontMatter } from "./yaml.js";
import * as fs from "fs/promises";

export interface DesignValidation {
  passed: boolean;
  issues: string[];
}

const done = (issues: string[]): DesignValidation => ({ passed: issues.length === 0, issues });

/** 检查文件存在 + 必填章节（## 标题或关键短语）。 */
function checkSections(
  content: string | null,
  file: string,
  required: string[],
  issues: string[],
): void {
  if (!content || !content.trim()) {
    issues.push(`${file} 不存在或为空`);
    return;
  }
  for (const sec of required) {
    if (!content.includes(sec)) {
      issues.push(`${file} 缺少「${sec}」`);
    }
  }
}

/** design/genre-analysis.md：题材分析报告必填章节。 */
export async function validateGenreAnalysis(novelDir: string): Promise<DesignValidation> {
  const issues: string[] = [];
  const content = await readFileSafe(path.join(novelDir, "design/genre-analysis.md"));
  checkSections(content, "design/genre-analysis.md", [
    "# 题材分析报告",
    "## 基本信息",
    "## 核心要素分析",
  ], issues);
  return done(issues);
}

/** design/blueprint.md：结构设计 + 幕定义。 */
export async function validateBlueprint(novelDir: string): Promise<DesignValidation> {
  const issues: string[] = [];
  const content = await readFileSafe(path.join(novelDir, "design/blueprint.md"));
  checkSections(content, "design/blueprint.md", [
    "# 结构设计",
    "## 总体信息",
    "## 幕定义",
  ], issues);
  // 幕定义要有 act 条目
  if (content && /## 幕定义/.test(content) && !/act\s*[:：]\s*\d+|Act\s*\d+|第.+幕/m.test(content)) {
    issues.push("blueprint「## 幕定义」下无 act 条目");
  }
  return done(issues);
}

/** design/style-guide.md：风格指南必填章节 + 禁忌清单。 */
export async function validateStyleGuide(novelDir: string): Promise<DesignValidation> {
  const issues: string[] = [];
  const content = await readFileSafe(path.join(novelDir, "design/style-guide.md"));
  checkSections(content, "design/style-guide.md", [
    "# 风格指南",
    "## 总体调性",
    "## 语言规范",
  ], issues);
  if (content && !/禁忌清单|禁用词|禁止项|句式黑名单/.test(content)) {
    issues.push("style-guide 缺少禁忌清单/禁用词");
  }
  return done(issues);
}

/** design/art-design.md：意象体系 + 情感节拍。 */
export async function validateArtDesign(novelDir: string): Promise<DesignValidation> {
  const issues: string[] = [];
  const content = await readFileSafe(path.join(novelDir, "design/art-design.md"));
  checkSections(content, "design/art-design.md", [
    "# 艺术设计方案",
    "意象体系",
    "情感节拍",
  ], issues);
  return done(issues);
}

/** design/narrative-weave.md：伏笔/支线/彩蛋 ID + 交织表。 */
export async function validateNarrativeWeave(novelDir: string): Promise<DesignValidation> {
  const issues: string[] = [];
  const content = await readFileSafe(path.join(novelDir, "design/narrative-weave.md"));
  checkSections(content, "design/narrative-weave.md", [
    "# 叙事设计",
    "## 伏笔体系",
    "## 支线网络",
  ], issues);
  if (content) {
    // 伏笔编号（F01 或 FO-XX）
    const foreshadowIds = [...content.matchAll(/\b(F\d+|FO-\d+)\b/g)].map((m) => m[1]);
    if (foreshadowIds.length === 0) issues.push("narrative-weave 无伏笔编号（F01/FO-XX）");
    // 支线编号（SP-XX）
    if (!/SP-\d+/.test(content)) issues.push("narrative-weave 无支线编号（SP-XX）");
    // 交织节奏表/章级安排
    if (!/交织|节奏表|章.*伏笔|章.*支线/.test(content)) {
      issues.push("narrative-weave 缺少交织节奏表/章级安排");
    }
  }
  return done(issues);
}

/** world/setting.md + rules.md + timeline.md：三文件 + 必填。 */
export async function validateWorld(novelDir: string): Promise<DesignValidation> {
  const issues: string[] = [];
  const setting = await readFileSafe(path.join(novelDir, "world/setting.md"));
  checkSections(setting, "world/setting.md", [
    "# 世界设定",
    "## 世界概况",
  ], issues);
  const rules = await readFileSafe(path.join(novelDir, "world/rules.md"));
  if (!rules || !rules.trim()) issues.push("world/rules.md 不存在或为空");
  const timeline = await readFileSafe(path.join(novelDir, "world/timeline.md"));
  if (!timeline || !timeline.trim()) issues.push("world/timeline.md 不存在或为空");
  return done(issues);
}

/** characters/*.md：YAML front-matter 必填字段 + relationships.md。 */
export async function validateCharacters(novelDir: string): Promise<DesignValidation> {
  const issues: string[] = [];
  const files = await listCharacterFiles(novelDir);
  if (files.length === 0) {
    issues.push("characters/ 无角色文件（{名}_{主角|反派|配角|龙套}.md）");
  }
  for (const f of files) {
    const content = await readFileSafe(f);
    if (!content) continue;
    const base = path.basename(f);
    const { data: meta } = parseYamlFrontMatter<Record<string, unknown>>(content);
    if (!meta || !meta.name) {
      issues.push(`${base} 缺少 YAML front-matter 或 name 字段`);
      continue;
    }
    for (const key of ["name", "role", "identity", "traits"]) {
      if (!(key in meta)) issues.push(`${base} front-matter 缺 ${key}`);
    }
  }
  const rel = await readFileSafe(path.join(novelDir, "characters/relationships.md"));
  if (!rel || !rel.trim()) issues.push("characters/relationships.md 不存在或为空");
  return done(issues);
}

/** 按 stageName 分发到对应 validate。 */
export async function validateDesign(
  novelDir: string,
  stageName: string,
): Promise<DesignValidation> {
  switch (stageName) {
    case "genre_analysis": return validateGenreAnalysis(novelDir);
    case "architecture": return validateBlueprint(novelDir);
    case "style": return validateStyleGuide(novelDir);
    case "art_design": return validateArtDesign(novelDir);
    case "narrative_weave": return validateNarrativeWeave(novelDir);
    case "world": return validateWorld(novelDir);
    case "characters": return validateCharacters(novelDir);
    default: return { passed: true, issues: [] };
  }
}

// ===== 产物底线检查（force-confirm 用）：只查「核心文件存在且非空」，不查结构 =====

/** 各阶段核心产物文件清单（相对 novelDir）。 */
const STAGE_ARTIFACTS: Record<string, string[]> = {
  genre_analysis: ["design/genre-analysis.md"],
  architecture: ["design/blueprint.md"],
  style: ["design/style-guide.md"],
  art_design: ["design/art-design.md"],
  narrative_weave: ["design/narrative-weave.md"],
  world: ["world/setting.md", "world/rules.md", "world/timeline.md"],
};

/**
 * 检查某阶段的核心产物是否成立（存在且非空）。供 force-confirm 端点使用：
 * 产物成立即可强制确认阶段（审核/结构问题降级为用户自担），不成立则拒绝。
 */
export async function checkArtifactsExist(
  novelDir: string,
  stageName: string,
): Promise<DesignValidation> {
  const issues: string[] = [];

  const files = STAGE_ARTIFACTS[stageName];
  if (files) {
    for (const f of files) {
      const content = await readFileSafe(path.join(novelDir, f));
      if (!content || !content.trim()) issues.push(`${f} 不存在或为空`);
    }
    return done(issues);
  }

  if (stageName === "characters") {
    const charFiles = await listCharacterFiles(novelDir);
    if (charFiles.length === 0) issues.push("characters/ 无角色文件");
    return done(issues);
  }

  if (stageName === "story") {
    const outlineFiles = await fs
      .readdir(path.join(novelDir, "outline"), { recursive: true })
      .catch(() => [] as string[]);
    if (!outlineFiles.some((f) => f.endsWith(".md"))) issues.push("outline/ 无大纲文件");
    return done(issues);
  }

  if (stageName === "chapters") {
    const chapterFiles = await fs
      .readdir(path.join(novelDir, "chapters"), { recursive: true })
      .catch(() => [] as string[]);
    if (!chapterFiles.some((f) => f.endsWith(".md"))) issues.push("chapters/ 无章节文件");
    return done(issues);
  }

  // editor / consistency 等报告型阶段：无下游依赖产物，默认放行
  return { passed: true, issues: [] };
}

/**
 * 把校验结果落盘到 reviews/{agentName}-validation.md。通过则删除旧报告，返回 null；
 * 未通过则写报告，返回报告路径。供 agent run() 接入（复用 story-designer 模式）。
 */
export async function writeDesignValidationReport(
  novelDir: string,
  agentName: string,
  validation: DesignValidation,
): Promise<string | null> {
  const reportPath = path.join(novelDir, "reviews", `${agentName}-validation.md`);
  if (validation.passed) {
    await fs.rm(reportPath, { force: true }).catch(() => {});
    return null;
  }
  const report =
    `# ${agentName} 校验报告\n\n` +
    `校验未通过，以下结构问题建议复核后重跑：\n\n` +
    validation.issues.map((i) => `- ${i}`).join("\n") +
    "\n";
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, report, "utf-8");
  return `reviews/${agentName}-validation.md`;
}
