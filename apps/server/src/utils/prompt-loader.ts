import * as path from "path";
import * as fs from "fs/promises";

const PROMPTS_DIR = "templates/agents";

function getServerRoot(): string {
  return path.resolve(import.meta.dirname ?? process.cwd(), "../..");
}

/**
 * Load a system prompt template for an agent.
 * Looks for templates/agents/{agentName}/system.md
 */
export async function loadPromptTemplate(agentName: string): Promise<string> {
  const candidates = [
    path.join(process.cwd(), PROMPTS_DIR, agentName, "system.md"),
    path.join(getServerRoot(), PROMPTS_DIR, agentName, "system.md"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return fs.readFile(candidate, "utf-8");
    } catch {
      // continue
    }
  }

  throw new Error(`Prompt template not found for agent: ${agentName}`);
}

const CRAFT_DIR = "templates/writing-craft";
const GENRE_DIR = "templates/genre-cards";

async function readTemplateSafe(relPath: string): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), relPath),
    path.join(getServerRoot(), relPath),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return await fs.readFile(c, "utf-8");
    } catch {
      // continue
    }
  }
  return null;
}

export interface CraftIndex {
  craftFiles: string[];
  hasGenreCard: boolean;
}

/**
 * 从 agent system.md 的「# 知识加载」表格解析需加载的 craft 文件清单。
 * 表格单元格中反引号包裹的 .md 路径即为引用文件；含 genre-cards 的记为体裁卡引用。
 */
export async function loadCraftIndex(agentName: string): Promise<CraftIndex> {
  let sys: string;
  try {
    sys = await loadPromptTemplate(agentName);
  } catch {
    return { craftFiles: [], hasGenreCard: false };
  }
  const section = extractKnowledgeSection(sys);
  if (!section) return { craftFiles: [], hasGenreCard: false };

  const paths = [...section.matchAll(/`([^`]+\.md)`/g)].map((m) => m[1]);
  const craftFiles = new Set<string>();
  let hasGenreCard = false;
  for (const p of paths) {
    if (p.includes("genre-cards")) hasGenreCard = true;
    else craftFiles.add(path.basename(p));
  }
  return { craftFiles: [...craftFiles], hasGenreCard };
}

function extractKnowledgeSection(md: string): string | null {
  const startMatch = md.match(/^# 知识加载$/m);
  if (!startMatch || startMatch.index === undefined) return null;
  const lines = md.slice(startMatch.index).split("\n");
  const sectionLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && /^# /.test(lines[i])) break;
    sectionLines.push(lines[i]);
  }
  return sectionLines.join("\n");
}

/**
 * 加载 agent 的 craft 知识 +（如有且 genre 已知）对应体裁卡，返回拼接后的 markdown。
 */
export async function loadCraftKnowledge(
  agentName: string,
  genre?: string,
): Promise<string> {
  const { craftFiles, hasGenreCard } = await loadCraftIndex(agentName);
  const parts: string[] = [];
  for (const f of craftFiles) {
    const content = await readTemplateSafe(`${CRAFT_DIR}/${f}`);
    if (content) parts.push(`### ${f}\n\n${content}`);
  }
  if (hasGenreCard && genre) {
    const card = await readTemplateSafe(`${GENRE_DIR}/${genre}.md`);
    if (card) parts.push(`### genre-cards/${genre}.md\n\n${card}`);
  }
  return parts.join("\n\n---\n\n");
}
