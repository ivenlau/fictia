import * as path from "path";
import * as fs from "fs/promises";
import { readFileSafe, writeFile } from "./file.js";
import { parseFrontMatter, stringifyFrontMatter } from "./user-materials.js";

/**
 * 参考作品（Reference Work）存储层。
 *
 * 与 user-materials.ts 同源「文件即真相」，但一个作品 = 一个目录（含
 * meta.md / source.txt / fingerprint.md），因为参考作品要留底原文、追踪
 * 解析状态、产出多个素材文件。详见 docs/material-library-design.md §2.D
 * 与 /root/.claude/plans/hidden-percolating-cocoa.md。
 *
 * 目录布局：novelDir/materials/references/{key}/{meta.md, source.txt, fingerprint.md}
 */

/** 与 routes/materials.ts 一致的 key 校验，防路径穿越。 */
const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

const REFERENCES_DIR = "materials/references";

export type ParseStatus = "pending" | "parsing" | "done" | "failed";
export type SourceFormat = "paste" | "txt" | "markdown" | "epub";

export interface ReferenceMeta {
  key: string;
  name: string;
  description: string;
  sourceFormat: SourceFormat;
  charCount: number;
  parsedAt: string | null;
  /** 用户意图开关。注入还需 parseStatus === "done"（见 readEnabledFingerprints）。 */
  enabled: boolean;
  parseStatus: ParseStatus;
}

export interface ReferenceWork extends ReferenceMeta {
  /** fingerprint.md 正文（已剥离 front-matter）；未解析则为 null。 */
  fingerprint: string | null;
  /** genre-card.md 正文（体裁卡提炼）；未产出则为 null。 */
  genreCard: string | null;
  /** craft.md 正文（技法示范）；未产出则为 null。 */
  craft: string | null;
  hasSource: boolean;
}

function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error(`非法 key（须匹配 ${KEY_RE.source}）: ${key}`);
}

function refsDir(novelDir: string): string {
  return path.join(novelDir, REFERENCES_DIR);
}
function workDir(novelDir: string, key: string): string {
  return path.join(refsDir(novelDir), key);
}
function metaPath(novelDir: string, key: string): string {
  return path.join(workDir(novelDir, key), "meta.md");
}
function sourcePath(novelDir: string, key: string): string {
  return path.join(workDir(novelDir, key), "source.txt");
}
function fingerprintPath(novelDir: string, key: string): string {
  return path.join(workDir(novelDir, key), "fingerprint.md");
}
function genreCardPath(novelDir: string, key: string): string {
  return path.join(workDir(novelDir, key), "genre-card.md");
}
function craftPath(novelDir: string, key: string): string {
  return path.join(workDir(novelDir, key), "craft.md");
}

function parseMeta(key: string, raw: string): ReferenceMeta {
  const { fm } = parseFrontMatter(raw);
  const sourceFormat =
    fm.sourceFormat === "txt" || fm.sourceFormat === "markdown" || fm.sourceFormat === "epub"
      ? fm.sourceFormat
      : "paste";
  const parseStatus =
    fm.parseStatus === "parsing" ||
    fm.parseStatus === "done" ||
    fm.parseStatus === "failed"
      ? fm.parseStatus
      : "pending";
  return {
    key,
    name: typeof fm.name === "string" && fm.name ? fm.name : key,
    description: typeof fm.description === "string" ? fm.description : "",
    sourceFormat,
    charCount: typeof fm.charCount === "number" && Number.isFinite(fm.charCount) ? fm.charCount : 0,
    parsedAt: typeof fm.parsedAt === "string" && fm.parsedAt ? fm.parsedAt : null,
    enabled: fm.enabled !== false,
    parseStatus,
  };
}

/** 列出所有参考作品的元数据（不含 fingerprint 正文）。 */
export async function listReferences(novelDir: string): Promise<ReferenceMeta[]> {
  const dir = refsDir(novelDir);
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ReferenceMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !KEY_RE.test(e.name)) continue;
    const raw = await readFileSafe(metaPath(novelDir, e.name));
    if (raw === null) continue;
    out.push(parseMeta(e.name, raw));
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  return out;
}

/** 取单个参考作品详情（含三类产出正文）。不存在返回 null。 */
export async function getReference(
  novelDir: string,
  key: string,
): Promise<ReferenceWork | null> {
  assertKey(key);
  const metaRaw = await readFileSafe(metaPath(novelDir, key));
  if (metaRaw === null) return null;
  const meta = parseMeta(key, metaRaw);
  const readBody = async (p: string): Promise<string | null> => {
    const raw = await readFileSafe(p);
    if (!raw) return null;
    const { body } = parseFrontMatter(raw);
    return body.trim() || null;
  };
  const sourceRaw = await readFileSafe(sourcePath(novelDir, key));
  return {
    ...meta,
    fingerprint: await readBody(fingerprintPath(novelDir, key)),
    genreCard: await readBody(genreCardPath(novelDir, key)),
    craft: await readBody(craftPath(novelDir, key)),
    hasSource: sourceRaw !== null && sourceRaw.length > 0,
  };
}

export interface CreateReferenceInput {
  name: string;
  sourceText: string;
  sourceFormat: SourceFormat;
  description?: string;
}

/** 新建参考作品：写 source.txt + meta.md（parseStatus=pending，enabled=true）。 */
export async function createReference(
  novelDir: string,
  key: string,
  data: CreateReferenceInput,
): Promise<ReferenceMeta> {
  assertKey(key);
  const fm: Record<string, unknown> = {
    name: data.name || key,
    description: data.description ?? "",
    sourceFormat: data.sourceFormat,
    charCount: data.sourceText.length,
    parsedAt: null,
    enabled: true,
    parseStatus: "pending",
  };
  await writeFile(metaPath(novelDir, key), stringifyFrontMatter(fm, ""));
  await writeFile(sourcePath(novelDir, key), data.sourceText);
  return parseMeta(key, (await readFileSafe(metaPath(novelDir, key))) ?? "");
}

/** 读 source.txt 原文（供解析管线用）。 */
export async function readSource(novelDir: string, key: string): Promise<string | null> {
  assertKey(key);
  return readFileSafe(sourcePath(novelDir, key));
}

/** 写 fingerprint.md 正文（不加 front-matter，纯正文）。 */
export async function saveFingerprint(
  novelDir: string,
  key: string,
  content: string,
): Promise<void> {
  assertKey(key);
  await writeFile(fingerprintPath(novelDir, key), `${content.trim()}\n`);
}

/** 写 genre-card.md（带 front-matter，便于「采用为本作体裁卡」时 clone）。 */
export async function saveGenreCard(
  novelDir: string,
  key: string,
  content: string,
): Promise<void> {
  assertKey(key);
  const fm = {
    name: `${key}-参考体裁`,
    description: `从参考作品提炼的体裁打法（借鉴规律，勿照搬设定）`,
    source: `reference:${key}`,
  };
  await writeFile(genreCardPath(novelDir, key), stringifyFrontMatter(fm, content.trim()));
}

/** 写 craft.md（带 front-matter）。 */
export async function saveCraft(
  novelDir: string,
  key: string,
  content: string,
): Promise<void> {
  assertKey(key);
  const fm = {
    name: `${key}-参考技法`,
    description: `从参考作品提炼的写作技法（借鉴，勿复制原文）`,
    source: `reference:${key}`,
  };
  await writeFile(craftPath(novelDir, key), stringifyFrontMatter(fm, content.trim()));
}

/** 更新解析状态；done 时同步写 parsedAt。 */
export async function setParseStatus(
  novelDir: string,
  key: string,
  status: ParseStatus,
): Promise<void> {
  assertKey(key);
  const raw = await readFileSafe(metaPath(novelDir, key));
  if (raw === null) return;
  const { fm, body } = parseFrontMatter(raw);
  fm.parseStatus = status;
  if (status === "done") fm.parsedAt = new Date().toISOString();
  await writeFile(metaPath(novelDir, key), stringifyFrontMatter(fm, body));
}

/** 更新 name / description / enabled。 */
export async function updateReference(
  novelDir: string,
  key: string,
  data: { name?: string; description?: string; enabled?: boolean },
): Promise<ReferenceMeta | null> {
  assertKey(key);
  const raw = await readFileSafe(metaPath(novelDir, key));
  if (raw === null) return null;
  const { fm, body } = parseFrontMatter(raw);
  if (typeof data.name === "string" && data.name) fm.name = data.name;
  if (typeof data.description === "string") fm.description = data.description;
  if (typeof data.enabled === "boolean") fm.enabled = data.enabled;
  await writeFile(metaPath(novelDir, key), stringifyFrontMatter(fm, body));
  return parseMeta(key, (await readFileSafe(metaPath(novelDir, key))) ?? "");
}

/** 删除整本参考作品（递归清理目录）。 */
export async function deleteReference(novelDir: string, key: string): Promise<void> {
  assertKey(key);
  await fs.rm(workDir(novelDir, key), { recursive: true, force: true });
}

/** 注入段每类总量上限（≈3000 token/类），防 system prompt 膨胀。见 plan D6。 */
const INJECTION_MAX_CHARS = 2000;

export interface AssembledReferenceSection {
  /** 拼好的注入文本（已截断）；无内容则为 ""。 */
  text: string;
  /** 贡献了内容的作品名列表。 */
  names: string[];
  truncated: boolean;
}

export interface AssembledReference {
  /** 风格指纹 → 「风格锚定·对标参考」段。 */
  fingerprint: AssembledReferenceSection;
  /** 体裁卡提炼 → 「参考体裁」段。 */
  genre: AssembledReferenceSection;
  /** 技法示范 → 「参考技法」段。 */
  craft: AssembledReferenceSection;
}

/** 剥离 front-matter 取正文。 */
function stripFrontMatter(raw: string): string {
  const { body } = parseFrontMatter(raw);
  return body.trim();
}

interface RefItem {
  name: string;
  fingerprint: string;
  genre: string;
  craft: string;
}

/** 跨作品拼接某一类产出，超 max 截断当前本并停止。 */
function assembleSection(
  items: RefItem[],
  pick: (it: RefItem) => string,
  max: number,
): AssembledReferenceSection {
  const parts: string[] = [];
  const names: string[] = [];
  let used = 0;
  let truncated = false;
  for (const it of items) {
    const content = pick(it);
    if (!content) continue;
    names.push(it.name);
    const header = `## 《${it.name}》`;
    const budget = max - used - header.length - 6;
    if (budget <= 50) {
      truncated = true;
      break;
    }
    const over = content.length > budget;
    const body = over
      ? `${content.slice(0, budget)}…（已截断，完整见参考作品产出文件）`
      : content;
    parts.push(`${header}\n\n${body}`);
    used += header.length + body.length + 6;
    if (over) {
      truncated = true;
      break;
    }
  }
  return { text: parts.join("\n\n"), names, truncated };
}

/**
 * 拼装参考作品三类产出（fingerprint / genre / craft）的注入文本，每类独立
 * 上限截断。供 base-agent.buildSystemPrompt 与 material-catalog.buildInjectionPreview
 * 共用，保证两处口径一致。只读 enabled && parseStatus===done 的作品。
 */
export async function assembleReferenceForInjection(
  novelDir: string,
  max = INJECTION_MAX_CHARS,
): Promise<AssembledReference> {
  const refs = (await listReferences(novelDir)).filter(
    (r) => r.enabled && r.parseStatus === "done",
  );
  const items: RefItem[] = [];
  for (const r of refs) {
    const [fp, ge, cr] = await Promise.all([
      readFileSafe(fingerprintPath(novelDir, r.key)),
      readFileSafe(genreCardPath(novelDir, r.key)),
      readFileSafe(craftPath(novelDir, r.key)),
    ]);
    items.push({
      name: r.name,
      fingerprint: fp ? stripFrontMatter(fp) : "",
      genre: ge ? stripFrontMatter(ge) : "",
      craft: cr ? stripFrontMatter(cr) : "",
    });
  }
  return {
    fingerprint: assembleSection(items, (it) => it.fingerprint, max),
    genre: assembleSection(items, (it) => it.genre, max),
    craft: assembleSection(items, (it) => it.craft, max),
  };
}
