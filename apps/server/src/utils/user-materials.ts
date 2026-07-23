import * as path from "path";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { readFileSafe, writeFile, listFiles } from "./file.js";

/**
 * 用户素材（块 2）：按书存于 novelDir/materials/ 下的 markdown 文件，
 * front-matter 携带元数据（name / description / enabled / agents）。
 *
 * 纯文件 + front-matter（不建 DB 表）—— 与 style-guide.md / genre-cards /
 * writing-craft 同源的「文件即真相」契约：agent 的 read_project_file 能直接读到，
 * 无需 DB 迁移。详见 docs/material-library-design.md §4.2。
 */

/** material type → novelDir/materials/ 下的子目录。 */
export const MATERIAL_SUBDIR: Record<string, string> = {
  "genre-card": "genre-cards",
  craft: "craft",
  "prompt-snippet": "prompts/snippets",
};

export type UserMaterialType = "genre-card" | "craft" | "prompt-snippet";

export interface UserMaterial {
  type: UserMaterialType;
  /** 文件名（无扩展名），也是引用 key。 */
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  /** 可选：仅注入这些 agent；缺省=所有加载 craft 的 agent。 */
  agents?: string[];
  /** 正文（已剥离 front-matter）。 */
  content: string;
  raw: string;
  scope: "novel";
  source: "user";
}

/** 拆分 YAML front-matter。无 front-matter 则整体作为 body。 */
export function parseFrontMatter(md: string): {
  fm: Record<string, any>;
  body: string;
} {
  if (!md.startsWith("---")) return { fm: {}, body: md };
  const end = md.indexOf("\n---", 3);
  if (end === -1) return { fm: {}, body: md };
  const fmText = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\r?\n/, "");
  try {
    const parsed = yaml.load(fmText);
    return {
      fm: parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : {},
      body,
    };
  } catch {
    return { fm: {}, body };
  }
}

/** 组装 front-matter + 正文。 */
export function stringifyFrontMatter(
  fm: Record<string, any>,
  body: string,
): string {
  const fmText = yaml.dump(fm, { lineWidth: -1 }).trim();
  return `---\n${fmText}\n---\n\n${(body ?? "").trimStart()}`;
}

function parseAgents(v: any): string[] | undefined {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) {
    return v
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

function materialsDir(novelDir: string, type: UserMaterialType): string {
  return path.join(novelDir, "materials", MATERIAL_SUBDIR[type]);
}

function toEntry(
  type: UserMaterialType,
  key: string,
  raw: string,
): UserMaterial {
  const { fm, body } = parseFrontMatter(raw);
  return {
    type,
    key,
    name: typeof fm.name === "string" && fm.name ? fm.name : key,
    description: typeof fm.description === "string" ? fm.description : "",
    enabled: fm.enabled !== false,
    agents: parseAgents(fm.agents),
    content: body,
    raw,
    scope: "novel",
    source: "user",
  };
}

export async function listUserMaterials(
  novelDir: string,
  type: UserMaterialType,
): Promise<UserMaterial[]> {
  const dir = materialsDir(novelDir, type);
  const files = await listFiles(dir, { extensions: [".md"] });
  const out: UserMaterial[] = [];
  for (const f of files) {
    const raw = await readFileSafe(f);
    if (raw === null) continue;
    out.push(toEntry(type, path.basename(f, ".md"), raw));
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  return out;
}

export async function getUserMaterial(
  novelDir: string,
  type: UserMaterialType,
  key: string,
): Promise<UserMaterial | null> {
  const raw = await readFileSafe(path.join(materialsDir(novelDir, type), `${key}.md`));
  if (raw === null) return null;
  return toEntry(type, key, raw);
}

export interface UserMaterialInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  agents?: string[];
  content?: string;
}

export async function writeUserMaterial(
  novelDir: string,
  type: UserMaterialType,
  key: string,
  data: UserMaterialInput,
): Promise<UserMaterial> {
  const fm: Record<string, any> = {
    name: data.name ?? key,
    description: data.description ?? "",
    enabled: data.enabled ?? true,
  };
  if (data.agents && data.agents.length) fm.agents = data.agents;
  const raw = stringifyFrontMatter(fm, data.content ?? "");
  await writeFile(path.join(materialsDir(novelDir, type), `${key}.md`), raw);
  return (await getUserMaterial(novelDir, type, key))!;
}

export async function deleteUserMaterial(
  novelDir: string,
  type: UserMaterialType,
  key: string,
): Promise<void> {
  await fs.unlink(path.join(materialsDir(novelDir, type), `${key}.md`)).catch(() => {});
}

// ==================== C1 创作偏好（单文件） ====================

const PREFERENCES_REL = "materials/prompts/preferences.md";

export interface Preferences {
  enabled: boolean;
  content: string;
}

export async function readPreferences(novelDir: string): Promise<Preferences | null> {
  const raw = await readFileSafe(path.join(novelDir, PREFERENCES_REL));
  if (raw === null) return null;
  const { fm, body } = parseFrontMatter(raw);
  return { enabled: fm.enabled !== false, content: body };
}

export async function writePreferences(
  novelDir: string,
  enabled: boolean,
  content: string,
): Promise<Preferences> {
  const raw = stringifyFrontMatter({ enabled }, content ?? "");
  await writeFile(path.join(novelDir, PREFERENCES_REL), raw);
  return (await readPreferences(novelDir))!;
}
