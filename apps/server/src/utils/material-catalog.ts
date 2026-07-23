import * as path from "path";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { loadPromptTemplate, loadCraftIndex, loadCraftKnowledge } from "./prompt-loader.js";
import { readFileSafe } from "./file.js";
import { readPreferences, listUserMaterials } from "./user-materials.js";

/**
 * 素材目录（catalog）+ 注入预览工具。
 *
 * 设计目标：把当前散落在 templates/ 下、对用户不可见的内置素材
 * （体裁卡 / 写作技法 / agent 提示词）统一暴露出来，并提供「这些素材
 * 是怎么拼进 agent system prompt 的」预览。详见
 * docs/material-library-design.md（块 1：只读亮出 + 注入预览）。
 */

const GENRE_DIR = "templates/genre-cards";
const CRAFT_DIR = "templates/writing-craft";
const AGENTS_DIR = "templates/agents";

function getServerRoot(): string {
  // 与 prompt-loader 同源：优先 import.meta.dirname，回退 cwd
  return path.resolve(import.meta.dirname ?? process.cwd(), "../..");
}

/** 解析 templates/<sub> 的实际路径（cwd 或 serverRoot）。 */
async function resolveTemplateDir(sub: string): Promise<string> {
  const candidates = [
    path.join(process.cwd(), sub),
    path.join(getServerRoot(), sub),
  ];
  for (const c of candidates) {
    try {
      const stat = await fs.stat(c);
      if (stat.isDirectory()) return c;
    } catch {
      // continue
    }
  }
  return path.join(getServerRoot(), sub);
}

export type MaterialSource = "built-in";

export interface CatalogEntry {
  /** 文件名（无扩展名），如 "xianxia"。也是被引用时的 key。 */
  key: string;
  /** 显示名（优先 front-matter.name，回退 key）。 */
  name: string;
  description?: string;
  /** 正文（已剥离 front-matter）。 */
  content: string;
  /** 原始全文（含 front-matter），供编辑器 / 克隆使用。 */
  raw: string;
  source: MaterialSource;
}

/** 简单拆分 YAML front-matter（`---` 包裹）。无 front-matter 则整体作为 body。 */
function splitFrontMatter(md: string): {
  fm: Record<string, unknown> | null;
  body: string;
} {
  if (!md.startsWith("---")) return { fm: null, body: md };
  const end = md.indexOf("\n---", 3);
  if (end === -1) return { fm: null, body: md };
  const fmText = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\r?\n/, "");
  try {
    const parsed = yaml.load(fmText);
    return {
      fm: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null,
      body,
    };
  } catch {
    return { fm: null, body };
  }
}

/**
 * 显示名：优先 front-matter.name；若 name 与 key 相同（内置卡 front-matter.name
 * 是英文 slug，无中文显示名），则尝试从 description 抽取中文题材/主题名。
 * 不修改模板文件（parity 真相源），对所有卡统一派生。
 */
function deriveDisplayName(
  key: string,
  fmName: unknown,
  description: string | undefined,
): string {
  const raw = typeof fmName === "string" && fmName ? fmName : key;
  if (raw === key && description) {
    const m = description.match(/^(.+?)(?:题材|类型|正文)/);
    if (m && m[1] && m[1].length >= 2) return m[1];
  }
  return raw;
}

async function readCatalogDir(sub: string): Promise<CatalogEntry[]> {
  const absDir = await resolveTemplateDir(sub);
  let files: string[];
  try {
    files = await fs.readdir(absDir);
  } catch {
    return [];
  }

  const entries: CatalogEntry[] = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const raw = await fs.readFile(path.join(absDir, f), "utf-8");
    const { fm, body } = splitFrontMatter(raw);
    const key = f.replace(/\.md$/, "");
    entries.push({
      key,
      name: deriveDisplayName(key, fm?.name, typeof fm?.description === "string" ? fm.description : undefined),
      description: typeof fm?.description === "string" ? fm.description : undefined,
      content: body,
      raw,
      source: "built-in",
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  return entries;
}

/** 8 张内置体裁卡。 */
export function listGenreCards(): Promise<CatalogEntry[]> {
  return readCatalogDir(GENRE_DIR);
}

/** 20 篇内置写作技法。 */
export function listCraftDocs(): Promise<CatalogEntry[]> {
  return readCatalogDir(CRAFT_DIR);
}

/** 11 个 agent 名（注入预览的选择器用）。 */
export async function listAgentNames(): Promise<string[]> {
  const absDir = await resolveTemplateDir(AGENTS_DIR);
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// ==================== 注入预览 ====================

export interface InjectionSection {
  key: "base" | "preferences" | "craft" | "style-guide";
  title: string;
  present: boolean;
  charCount: number;
  /** 说明：加载了哪些文件 / 体裁卡 key / style-guide 状态。 */
  detail: string;
}

export interface InjectionPreview {
  agent: string;
  /** 实际生效的体裁（genreCard 优先，回退 genre）。 */
  genre: string | null;
  /** meta.json.genreCard（若已显式选卡）。 */
  genreCard: string | null;
  sections: InjectionSection[];
  /** 拼装后的完整 system prompt（与 base-agent.buildSystemPrompt 同源）。 */
  assembledPrompt: string;
  totalChars: number;
}

/**
 * 组装某 agent 在某 novel 下的 system prompt，并返回各素材段的拆解。
 * 与 BaseAgent.buildSystemPrompt() 同源（注入顺序一致），但不实例化 agent、
 * 不调用 LLM。供「注入预览」让用户直观看到素材在起作用。
 */
export async function buildInjectionPreview(
  novelDir: string,
  agentName: string,
): Promise<InjectionPreview> {
  // 体裁：优先 meta.json.genreCard，回退 genre（与 BaseAgent.readNovelGenre 一致）
  let genre: string | null = null;
  let genreCard: string | null = null;
  const metaRaw = await readFileSafe(path.join(novelDir, "meta.json"));
  if (metaRaw) {
    try {
      const obj = JSON.parse(metaRaw);
      if (typeof obj.genreCard === "string" && obj.genreCard) {
        genreCard = obj.genreCard;
        genre = obj.genreCard;
      } else if (typeof obj.genre === "string" && obj.genre) {
        genre = obj.genre;
      }
    } catch {
      // meta.json 非法 JSON，忽略
    }
  }

  // base prompt
  let basePrompt = "";
  try {
    basePrompt = await loadPromptTemplate(agentName);
  } catch {
    basePrompt = `(未找到 agent 模板: ${agentName})`;
  }

  const sections: InjectionSection[] = [];

  sections.push({
    key: "base",
    title: "Agent 基础提示词",
    present: true,
    charCount: basePrompt.length,
    detail: `templates/agents/${agentName}/system.md`,
  });

  // C1 用户偏好（创作偏好）
  const prefs = await readPreferences(novelDir);
  const prefsActive = !!(prefs && prefs.enabled && prefs.content.trim());
  sections.push({
    key: "preferences",
    title: "用户偏好（创作偏好）",
    present: prefsActive,
    charCount: prefs?.content.length ?? 0,
    detail: !prefs
      ? "未创建（materials/prompts/preferences.md）"
      : prefs.enabled
        ? "已启用"
        : "已禁用（开关关闭）",
  });

  // craft 知识（含自定义技法）+（如 agent 引用了 genre-cards）体裁卡
  const { craftFiles, hasGenreCard } = await loadCraftIndex(agentName);
  const customCraft = await listUserMaterials(novelDir, "craft");
  const enabledCustom = customCraft.filter(
    (c) => c.enabled && (!c.agents || c.agents.includes(agentName)),
  );
  const craftText = await loadCraftKnowledge(agentName, genre ?? undefined, novelDir);
  const craftDetail = [
    craftFiles.length ? `写作技法: ${craftFiles.join(", ")}` : "",
    enabledCustom.length ? `自定义技法: ${enabledCustom.map((c) => c.key).join(", ")}` : "",
    hasGenreCard ? `体裁卡: ${genre ?? "(本 agent 引用了体裁卡，但本项目未选)"}` : "",
  ]
    .filter(Boolean)
    .join("；");
  sections.push({
    key: "craft",
    title: `已加载知识（写作技法${hasGenreCard ? " + 体裁卡" : ""}）`,
    present: craftText.length > 0,
    charCount: craftText.length,
    detail: craftDetail || "(该 agent 的知识加载表为空)",
  });

  // 风格锚定
  const styleGuide = await readFileSafe(path.join(novelDir, "style-guide.md"));
  sections.push({
    key: "style-guide",
    title: "风格锚定（style-guide.md）",
    present: !!styleGuide,
    charCount: styleGuide?.length ?? 0,
    detail: styleGuide ? "已启用" : "尚未创建（style-designer 阶段产出）",
  });

  // 拼装（复刻 BaseAgent.buildSystemPrompt 顺序：用户偏好 → 已加载知识 → 风格锚定）
  let assembled = basePrompt;
  if (prefsActive && prefs) {
    assembled = assembled.replace(
      "# 专业能力",
      `# 用户偏好 (作者常驻指令，优先级最高)\n\n${prefs.content.trim()}\n\n# 专业能力`,
    );
  }
  if (craftText) {
    assembled = assembled.replace(
      "# 专业能力",
      `## 已加载知识\n\n${craftText}\n\n# 专业能力`,
    );
  }
  if (styleGuide) {
    assembled = assembled.replace(
      "# 专业能力",
      `# 风格锚定 (所有产出必须严格遵守)\n\n${styleGuide}\n\n# 专业能力`,
    );
  }

  return {
    agent: agentName,
    genre,
    genreCard,
    sections,
    assembledPrompt: assembled,
    totalChars: assembled.length,
  };
}
