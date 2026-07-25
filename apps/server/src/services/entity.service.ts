/**
 * 实体提取 + 动态写作空间组装 + 知识图谱构建（scoped P2-2 / P2-3）。
 *
 * 提取 4 类实体：
 *   characters    <- characters/*.md 的 YAML front-matter（含 relationships）
 *   foreshadowing <- design/narrative-weave.md 的伏笔表
 *   storylines    <- design/narrative-weave.md 的支线表
 *   timeline      <- world/timeline.md 的时间线表
 *
 * 知识图谱：从 characters.relationships + storylines.characters 抽三元组。
 * 表 schema 对齐 skill project-structure.md。动态状态更新（从章节备注）为后续。
 */

import * as yaml from "js-yaml";
import * as path from "path";
import { transitionForeshadow, FORESHADOW_OP_TO_STATE } from "@fictia/shared";
import type {
  ForeshadowState,
  ForeshadowHistoryEntry,
  ForeshadowStats,
} from "@fictia/shared";
import { fileService } from "./file.service.js";
import { readSummariesBefore } from "./chapter-summary-store.js";
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
  clearRelations,
  upsertRelations,
  type Entity,
  type Relation,
  entityStats,
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
        relationships: fm.relationships ?? [],
        file: path.relative(novelDir, f).replace(/\\/g, "/"),
      },
    });
  }
  return entities;
}

async function extractForeshadowing(novelDir: string): Promise<Entity[]> {
  const nw = await readFileSafe(path.join(novelDir, "design/narrative-weave.md"));
  if (!nw) return [];
  const rows = parseTableRows(nw, /编号.*名称.*类型.*埋设章节/);
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
  const nw = await readFileSafe(path.join(novelDir, "design/narrative-weave.md"));
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

// ---------- 知识图谱 ----------

/** 从关系描述文本归类关系类型。 */
function classifyRel(text: string): string {
  if (/师|徒|mentor/.test(text)) return "mentor";
  if (/友|friend/.test(text)) return "friend";
  if (/敌|enemy|rival|对手/.test(text)) return "enemy";
  if (/恋|爱|lover|青梅/.test(text)) return "lover";
  if (/家|族|family|父|母|兄|弟|姐|妹|亲/.test(text)) return "family";
  if (/盟|ally/.test(text)) return "ally";
  return "related_to";
}

/** 容忍两种 relationships 格式：字符串「与X：Y」/「X：Y」或对象 {name, relation}。 */
function parseRelationship(
  r: unknown,
): { target: string; relType: string; text: string } | null {
  if (typeof r === "string") {
    const m = r.match(/^与?\s*([^:：]+)[:：]\s*(.+)$/);
    if (m) {
      const text = m[2].trim();
      return { target: m[1].trim(), relType: classifyRel(text), text };
    }
    return null;
  }
  if (r && typeof r === "object") {
    const obj = r as Record<string, unknown>;
    const name = obj.name ?? obj.target ?? "";
    const rel = obj.relation ?? obj.rel_type ?? "related";
    if (name) {
      const text = String(rel);
      return { target: String(name), relType: classifyRel(text), text };
    }
  }
  return null;
}

/**
 * 从已有实体构建知识图谱三元组：
 *   - characters.relationships -> (char, relType, target)
 *   - storylines.characters    -> (char, participates, storyline)
 */
export async function buildGraph(
  novelId: string,
): Promise<{ relations_added: number }> {
  const characters = listEntities(novelId, "characters");
  const storylines = listEntities(novelId, "storylines");
  const rels: Relation[] = [];

  for (const c of characters) {
    const rships = c.fields.relationships;
    if (Array.isArray(rships)) {
      for (const r of rships) {
        const parsed = parseRelationship(r);
        if (parsed) {
          rels.push({
            source_id: c.id,
            rel_type: parsed.relType,
            target_id: parsed.target,
            text: parsed.text,
          });
        }
      }
    }
  }

  for (const s of storylines) {
    const chars = s.fields.characters;
    if (typeof chars === "string" && chars.trim()) {
      for (const name of chars.split(/[,，、]/).map((x) => x.trim()).filter(Boolean)) {
        rels.push({
          source_id: name,
          rel_type: "participates",
          target_id: s.id,
          text: `参与支线 ${s.name}`,
        });
      }
    }
  }

  clearRelations(novelId);
  upsertRelations(novelId, rels);
  return { relations_added: rels.length };
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
 */
export async function assembleWritingSpace(
  novelId: string,
  chapterNumber: number,
): Promise<string> {
  const novelDir = fileService.getNovelDir(novelId);
  const num = String(chapterNumber).padStart(2, "0");
  const chTag = `ch${num}`;
  const parts: string[] = [];

  const outline = await readFileSafe(
    path.join(novelDir, "outline", "chapters", `ch${num}.md`),
  );
  if (outline) parts.push(`## 章节大纲（ch${num}）\n\n${outline}`);

  const styleGuide = await readFileSafe(path.join(novelDir, "design/style-guide.md"));
  if (styleGuide) {
    const act = chapterToAct(chapterNumber);
    const notes = extractStyleStageNotes(styleGuide, act);
    if (notes) parts.push(`## 风格要点（act ${act}）\n\n${notes}`);
  }

  const worldSetting = await readFileSafe(path.join(novelDir, "world", "setting.md"));
  const worldRules = await readFileSafe(path.join(novelDir, "world", "rules.md"));
  if (worldSetting || worldRules) {
    const ref = buildWorldQuickRef(worldSetting ?? "", worldRules ?? "");
    if (ref) parts.push(`## 世界观速查\n\n${ref}`);
  }

  const charFiles = await collectCharacterFiles(novelDir);
  if (charFiles.length) {
    const registry = buildCharacterRegistry(charFiles);
    if (registry) parts.push(`## 角色总览\n\n${registry}`);
  }

  const charEntities = listEntities(novelId, "characters");
  const withState = charEntities.filter((e) => e.state && e.state !== "active");
  if (withState.length) {
    parts.push(
      `## 角色当前状态\n\n${withState
        .map((e) => `- **${e.name}**（${e.fields.role ?? ""}）：${e.state}`)
        .join("\n")}`,
    );
  }

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

  parts.push(
    `## 按需检索\n如需更多实体（其他章节伏笔/支线/时间线），使用 GET /novels/:id/entity/search?q=...`,
  );

  return parts.join("\n\n---\n\n");
}

// ---------- 动态状态更新（从章节写作备注） ----------

export async function resolveChapterFile(
  novelDir: string,
  chapterNumber: number,
): Promise<string | null> {
  const num = String(chapterNumber).padStart(2, "0");
  try {
    const files = await listFiles(path.join(novelDir, "chapters"), {
      recursive: true,
      extensions: [".md"],
    });
    return files.find((f) => path.basename(f) === `ch${num}.md`) ?? null;
  } catch {
    return null;
  }
}

function extractWritingNotes(content: string): string | null {
  const m = content.match(/### 写作备注\s*\n([\s\S]*?)$/);
  return m ? m[1] : null;
}

function getNoteValue(notes: string, key: string): string | null {
  const re = new RegExp(`- \\*\\*${key}\\*\\*[：:]\\s*([^\\n]+)`);
  const m = notes.match(re);
  return m ? m[1].trim() : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 从章节写作备注解析状态变更，更新 characters/foreshadowing 的 state。
 *   - 角色状态更新/人物状态更新：按已知角色名前缀匹配，state = 去名去括号后的文本
 *   - 伏笔操作：埋设->planted / 推进|强化->strengthened / 回收->resolved
 */
export async function updateEntitiesFromChapterNotes(
  novelId: string,
  chapterNumber: number,
): Promise<{ updated: number }> {
  const novelDir = fileService.getNovelDir(novelId);
  const chapterPath = await resolveChapterFile(novelDir, chapterNumber);
  if (!chapterPath) return { updated: 0 };
  const content = await readFileSafe(chapterPath);
  if (!content) return { updated: 0 };
  const notes = extractWritingNotes(content);
  if (!notes) return { updated: 0 };

  const characters = listEntities(novelId, "characters");
  const foreshadows = listEntities(novelId, "foreshadowing");
  const updated: Entity[] = [];

  const stateValue =
    getNoteValue(notes, "角色状态更新") ?? getNoteValue(notes, "人物状态更新");
  if (stateValue) {
    const segments = stateValue
      .split(/[；;，,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const seg of segments) {
      const clean = seg.replace(/\s*[（(][^)）]*[)）]\s*/g, "").trim();
      for (const c of characters) {
        if (c.name && clean.startsWith(c.name)) {
          const stateText = clean.slice(c.name.length).trim() || c.name;
          updated.push({ ...c, state: stateText });
          break;
        }
      }
    }
  }

  const foreshadowValue = getNoteValue(notes, "伏笔操作");
  if (foreshadowValue) {
    const chTag = `ch${String(chapterNumber).padStart(2, "0")}`;
    for (const f of foreshadows) {
      const reOp = new RegExp(`(埋设|推进|强化|回收|悬置)[^F]*${escapeRe(f.id)}`);
      const m = foreshadowValue.match(reOp);
      if (!m) continue;
      const op = m[1];
      const cur = (f.state as ForeshadowState) || "planted";
      const history = Array.isArray(f.fields.history)
        ? [...(f.fields.history as ForeshadowHistoryEntry[])]
        : [];
      // 首次实际章节事件：state 可能来自 narrative-weave 计划而非实际章节，
      // 直接采纳 op 映射；之后按状态机校验，禁止回退（如 resolved 后再埋设）。
      const isFirstRealEvent = history.length === 0;
      const next = isFirstRealEvent
        ? (FORESHADOW_OP_TO_STATE[op] ?? null)
        : transitionForeshadow(cur, op);
      if (!next) continue;
      history.push({ ch: chTag, op, state: next });
      const fields: Record<string, unknown> = { ...f.fields, history };
      if (next === "planted" && !fields.plantedCh) fields.plantedCh = chTag;
      if (next === "strengthened") {
        const arr = Array.isArray(fields.strengthenChs)
          ? [...(fields.strengthenChs as string[])]
          : [];
        if (!arr.includes(chTag)) arr.push(chTag);
        fields.strengthenChs = arr;
      }
      if (next === "resolved") fields.resolvedCh = chTag;
      updated.push({ ...f, state: next, fields });
    }
  }

  if (updated.length > 0) upsertEntities(novelId, updated);
  return { updated: updated.length };
}

/**
 * 组装动态上下文（前文摘要链 + 角色当前状态 + 本章伏笔指令），注入 chapter-writer。
 */
export function assembleDynamicContext(
  novelId: string,
  chapterNumber: number,
): string {
  const num = String(chapterNumber).padStart(2, "0");
  const chTag = `ch${num}`;
  const parts: string[] = [];

  // 前文摘要链：每章压缩摘要串成跨章骨架，治长篇失忆（N-1 全文仍由 chapter-writer 另读）
  const summaries = readSummariesBefore(novelId, chapterNumber);
  if (summaries.length) {
    parts.push(
      `## 前文摘要链（每章压缩，跨章骨架）\n${summaries
        .map((s) => `[${s.number}] ${s.summary}`)
        .join("\n")}`,
    );
  }

  const charEntities = listEntities(novelId, "characters");
  const withState = charEntities.filter((e) => e.state && e.state !== "active");
  if (withState.length) {
    parts.push(
      `## 角色当前状态（动态，随章节更新）\n${withState
        .map((e) => `- **${e.name}**：${e.state}`)
        .join("\n")}`,
    );
  }

  const foreshadows = listEntities(novelId, "foreshadowing");
  const relevant = foreshadows.filter((e) => {
    const f = e.fields;
    return [f.plant, f.strengthen, f.resolve].some(
      (v) => typeof v === "string" && v.includes(chTag),
    );
  });
  if (relevant.length) {
    parts.push(
      `## 本章伏笔指令\n${relevant
        .map(
          (e) =>
            `- **${e.id} ${e.name}**（${e.fields.type ?? ""}，state=${e.state}）：${e.fields.desc ?? ""}`,
        )
        .join("\n")}`,
    );
  }

  return parts.join("\n\n");
}

/**
 * 伏笔闭合统计：各态计数 + closureRate + 未闭合（open）列表。
 * `open` = 非 resolved 且非 suspended 的伏笔。
 */
export function foreshadowStats(novelId: string): ForeshadowStats {
  const foreshadows = listEntities(novelId, "foreshadowing");
  const counts = { planted: 0, strengthened: 0, resolved: 0, suspended: 0 };
  const open: ForeshadowStats["open"] = [];
  for (const f of foreshadows) {
    const st = (f.state as ForeshadowState) || "planted";
    if (st in counts) (counts as Record<string, number>)[st]++;
    if (st !== "resolved" && st !== "suspended") {
      open.push({
        id: f.id,
        name: f.name,
        state: st,
        desc: typeof f.fields.desc === "string" && f.fields.desc ? f.fields.desc : undefined,
      });
    }
  }
  const total = foreshadows.length;
  const closureRate = total > 0 ? counts.resolved / total : 0;
  return { total, ...counts, closureRate, open };
}

export { extractCharacters, extractForeshadowing, extractStorylines, extractTimeline };
