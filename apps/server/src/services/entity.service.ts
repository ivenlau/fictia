/**
 * 实体提取 + 动态写作空间组装（scoped P2-2）。
 *
 * 提取 4 类实体：
 *   characters    <- characters/*.md 的 YAML front-matter
 *   foreshadowing <- narrative-weave.md 的伏笔表
 *   storylines    <- narrative-weave.md 的支线表
 *   timeline      <- world/timeline.md 的时间线表
 *
 * 表 schema 对齐 skill project-structure.md。动态状态更新（从章节写作备注）为后续。
 */

import * as yaml from "js-yaml";
import * as path from "path";
import { fileService } from "./file.service.js";
import { listFiles, readFileSafe } from "../utils/file.js";
import {
  buildCharacterRegistry,
  buildWorldQuickRef,
  extractStyleStageNotes,
  chapterToAct,
} from "../utils/context-extractor.js";
import {
  upsertEntities,
  clearEntities,
  listEntities,
  type Entity,
} from "./entity-store.js";

// ---------- 表解析 ----------

/** 找到含 headerPattern 的表头行，解析其下数据行（跳过表头与分隔行）。 */
function parseTableRows(md: string, headerPattern: RegExp): string[][] {
  const lines = md.split("\n");
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|") && headerPattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return [];
  const rows: string[][] = [];
  for (let i = startIdx + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

function extractFrontMatter(content: string): Record<string, unknown> | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try {
    return yaml.load(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------- 提取器 ----------

async function extractCharacters(novelDir: string): Promise<Entity[]> {
  let files: string[] = [];
  try {
    files = await listFiles(path.join(novelDir, "characters"), {
      recursive: true,
      extensions: [".md"],
    });
  } catch {
    return [];
  }
  const entities: Entity[] = [];
  for (const f of files) {
    const content = await readFileSafe(f);
    if (!content) continue;
    const fm = extractFrontMatter(content);
    if (!fm || !fm.name) continue;
    entities.push({
      collection: "characters",
      id: String(fm.name),
      name: String(fm.name),
      state: "active",
      fields: {
        role: fm.role ?? "",
        identity: fm.identity ?? "",
        age: fm.age ?? "",
        traits: fm.traits ?? [],
        language_style: fm.language_style ?? "",
        file: path.relative(novelDir, f).replace(/\\/g, "/"),
      },
    });
  }
  return entities;
}

async function extractForeshadowing(novelDir: string): Promise<Entity[]> {
  const nw = await readFileSafe(path.join(novelDir, "narrative-weave.md"));
  if (!nw) return [];
  const rows = parseTableRows(nw, /编号.*名称.*类型/);
  return rows
    .filter((r) => r.length >= 4 && r[0])
    .map((r) => {
      const [id, name, type, plant, strengthen, resolve, desc] = [
        r[0] ?? "", r[1] ?? "", r[2] ?? "", r[3] ?? "", r[4] ?? "", r[5] ?? "", r[6] ?? "",
      ];
      const state = resolve ? "resolved" : strengthen ? "strengthened" : "planted";
      return {
        collection: "foreshadowing",
        id,
        name,
        state,
        fields: { type, plant, strengthen, resolve, desc },
      } as Entity;
    });
}

async function extractStorylines(novelDir: string): Promise<Entity[]> {
  const nw = await readFileSafe(path.join(novelDir, "narrative-weave.md"));
  if (!nw) return [];
  const rows = parseTableRows(nw, /编号.*名称.*类型.*起始章节/);
  return rows
    .filter((r) => r.length >= 4 && r[0])
    .map((r) => {
      const [id, name, type, start, end, chars, desc] = [
        r[0] ?? "", r[1] ?? "", r[2] ?? "", r[3] ?? "", r[4] ?? "", r[5] ?? "", r[6] ?? "",
      ];
      const state = end ? "resolved" : start ? "active" : "dormant";
      return {
        collection: "storylines",
        id,
        name,
        state,
        fields: { type, start, end, characters: chars, desc },
      } as Entity;
    });
}

async function extractTimeline(novelDir: string): Promise<Entity[]> {
  const tl = await readFileSafe(path.join(novelDir, "world", "timeline.md"));
  if (!tl) return [];
  const rows = parseTableRows(tl, /时间.*事件.*影响/);
  return rows
    .filter((r) => r.length >= 2 && r[1])
    .map((r, i) => {
      const [time, event, impact, relation] = [r[0] ?? "", r[1] ?? "", r[2] ?? "", r[3] ?? ""];
      return {
        collection: "timeline",
        id: `T${String(i + 1).padStart(2, "0")}`,
        name: event,
        state: "past",
        fields: { time, impact, relation },
      } as Entity;
    });
}

// ---------- 索引 ----------

export async function indexAllEntities(
  novelId: string,
): Promise<{ indexed: Record<string, number> }> {
  const novelDir = fileService.getNovelDir(novelId);
  clearEntities(novelId);
  const characters = await extractCharacters(novelDir);
  const foreshadowing = await extractForeshadowing(novelDir);
  const storylines = await extractStorylines(novelDir);
  const timeline = await extractTimeline(novelDir);
  upsertEntities(novelId, [...characters, ...foreshadowing, ...storylines, ...timeline]);
  return {
    indexed: {
      characters: characters.length,
      foreshadowing: foreshadowing.length,
      storylines: storylines.length,
      timeline: timeline.length,
    },
  };
}

// ---------- 写作空间组装 ----------

async function collectCharacterFiles(
  novelDir: string,
): Promise<{ path: string; content: string }[]> {
  let files: string[] = [];
  try {
    files = await listFiles(path.join(novelDir, "characters"), {
      recursive: true,
      extensions: [".md"],
    });
  } catch {
    return [];
  }
  const out: { path: string; content: string }[] = [];
  for (const f of files) {
    const content = await readFileSafe(f);
    if (content) out.push({ path: path.relative(novelDir, f).replace(/\\/g, "/"), content });
  }
  return out;
}

/**
 * 为指定章节组装动态写作空间（静态设计 + 必读动态实体 + 按需检索提示）。
 * 对齐 skill writing_space.py 的三层结构（简化版）。
 */
export async function assembleWritingSpace(
  novelId: string,
  chapterNumber: number,
): Promise<string> {
  const novelDir = fileService.getNovelDir(novelId);
  const num = String(chapterNumber).padStart(2, "0");
  const chTag = `ch${num}`;
  const parts: string[] = [];

  // 1. 章节大纲
  const outline = await readFileSafe(
    path.join(novelDir, "outline", "chapters", `ch${num}.md`),
  );
  if (outline) parts.push(`## 章节大纲（ch${num}）\n\n${outline}`);

  // 2. 风格要点
  const styleGuide = await readFileSafe(path.join(novelDir, "style-guide.md"));
  if (styleGuide) {
    const act = chapterToAct(chapterNumber);
    const notes = extractStyleStageNotes(styleGuide, act);
    if (notes) parts.push(`## 风格要点（act ${act}）\n\n${notes}`);
  }

  // 3. 世界观速查
  const worldSetting = await readFileSafe(path.join(novelDir, "world", "setting.md"));
  const worldRules = await readFileSafe(path.join(novelDir, "world", "rules.md"));
  if (worldSetting || worldRules) {
    const ref = buildWorldQuickRef(worldSetting ?? "", worldRules ?? "");
    if (ref) parts.push(`## 世界观速查\n\n${ref}`);
  }

  // 4. 角色总览
  const charFiles = await collectCharacterFiles(novelDir);
  if (charFiles.length) {
    const registry = buildCharacterRegistry(charFiles);
    if (registry) parts.push(`## 角色总览\n\n${registry}`);
  }

  // 5. 角色当前状态（非默认 active 的）
  const charEntities = listEntities(novelId, "characters");
  const withState = charEntities.filter((e) => e.state && e.state !== "active");
  if (withState.length) {
    parts.push(
      `## 角色当前状态\n\n${withState
        .map((e) => `- **${e.name}**（${e.fields.role ?? ""}）：${e.state}`)
        .join("\n")}`,
    );
  }

  // 6. 本章相关伏笔（埋设/强化/回收章节命中本章）
  const foreshadows = listEntities(novelId, "foreshadowing");
  const relevant = foreshadows.filter((e) => {
    const f = e.fields;
    return [f.plant, f.strengthen, f.resolve].some(
      (v) => typeof v === "string" && v.includes(chTag),
    );
  });
  if (relevant.length) {
    parts.push(
      `## 本章伏笔指令\n\n${relevant
        .map(
          (e) =>
            `- **${e.id} ${e.name}**（${e.fields.type ?? ""}，state=${e.state}）：${e.fields.desc ?? ""}`,
        )
        .join("\n")}`,
    );
  }

  // 7. 按需检索提示
  parts.push(
    `## 按需检索\n如需更多实体（其他章节伏笔/支线/时间线），使用 GET /novels/:id/entity/search?q=...`,
  );

  return parts.join("\n\n---\n\n");
}

export { extractCharacters, extractForeshadowing, extractStorylines, extractTimeline };
