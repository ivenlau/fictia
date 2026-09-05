/**
 * 章节文件扫描 helper（基于 @fictia/shared/paths 的命名规范）。
 * chapters/ 扁平、act 编码进文件名后，按章节号定位文件靠扫描 + parseChapterNumber。
 */
import * as path from "path";
import { parseChapterNumber, parseActNumber, parseCharacterPath } from "@fictia/shared";
import { listFiles, readFileSafe } from "./file.js";
import { parseActDefinitions } from "./context-extractor.js";

/**
 * 章节文件统一清单：扫 chapters/（含子目录），parseChapterNumber 识别章号
 * （兼容 ch01.md 与 ch01_act1-标题.md），同号多 act 版本只留 act 最大者，
 * 按章号升序。所有「章节文件数/最新章/按号定位」的消费方都应走这里，
 * 避免各处手写正则与命名规范脱节（历史 bug：countChapters/向量索引漏 act 命名）。
 */
export interface ChapterFileEntry {
  number: number;
  /** 文件名中的 act 编号；旧扁平命名（ch01.md）为 0。 */
  act: number;
  /** 绝对路径。 */
  path: string;
}

export async function listChapterFiles(novelDir: string): Promise<ChapterFileEntry[]> {
  const files = await listFiles(path.join(novelDir, "chapters"), {
    recursive: true,
    extensions: [".md"],
  });
  const byNumber = new Map<number, { act: number; file: string }>();
  for (const f of files) {
    const num = parseChapterNumber(path.basename(f));
    if (num === null) continue;
    const act = parseActNumber(path.basename(f)) ?? 0;
    const cur = byNumber.get(num);
    if (!cur || act > cur.act) byNumber.set(num, { act, file: f });
  }
  return [...byNumber.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, { act, file }]) => ({ number, act, path: file }));
}

/** 扫 chapters/ 找指定章节号对应的文件（扁平，act 进文件名）。同号多版本取 act 最大者。 */
export async function findChapterFile(novelDir: string, number: number): Promise<string | null> {
  const entry = (await listChapterFiles(novelDir)).find((e) => e.number === number);
  return entry?.path ?? null;
}

/** 扫 outline/chapters/ 找指定章节号对应的大纲文件。 */
export async function findOutlineFile(novelDir: string, number: number): Promise<string | null> {
  const files = await listFiles(path.join(novelDir, "outline", "chapters"), { extensions: [".md"] });
  return files.find((f) => parseChapterNumber(path.basename(f)) === number) ?? null;
}

export interface DesignValidation {
  passed: boolean;
  issues: string[];
}

/**
 * 校验 story-design 产出结构（确定性，不调 LLM）：
 * 1. act 文件数 = blueprint 幕定义 act 数
 * 2. 每章细纲存在（1..N 齐全）
 * 3. 章节文件名 act 编号与 blueprint 一致
 * 4. 每章 weave_notes 非空
 * 无 blueprint 幕定义时跳过 1/3，仍按已产出文件校验 2/4。
 */
export async function validateStoryDesign(
  novelDir: string,
  blueprint?: string,
): Promise<DesignValidation> {
  const issues: string[] = [];
  const acts = parseActDefinitions(blueprint ?? undefined);
  const allChapters = acts ? acts.flatMap((a) => a.chapters) : [];
  const totalChapters = allChapters.length ? Math.max(...allChapters) : 0;

  if (acts) {
    const outlineFiles = await listFiles(path.join(novelDir, "outline"), { extensions: [".md"] });
    const actFiles = outlineFiles.filter((f) => /^act-\d+\.md$/.test(path.basename(f)));
    if (actFiles.length !== acts.length) {
      issues.push(`act 文件数 ${actFiles.length} ≠ blueprint 幕定义 ${acts.length} 幕`);
    }
  }

  if (totalChapters > 0) {
    for (let ch = 1; ch <= totalChapters; ch++) {
      const f = await findOutlineFile(novelDir, ch);
      if (!f) {
        issues.push(`第 ${ch} 章细纲缺失`);
        continue;
      }
      if (acts) {
        const expectedAct = acts.find((a) => a.chapters.includes(ch))?.act;
        const actualAct = parseActNumber(path.basename(f));
        if (expectedAct != null && actualAct !== expectedAct) {
          issues.push(`第 ${ch} 章文件名 act${actualAct} ≠ blueprint act${expectedAct}`);
        }
      }
      const content = await readFileSafe(f);
      if (content && !/weave_notes\s*:/.test(content)) {
        issues.push(`第 ${ch} 章缺 weave_notes（应从 narrative-weave 提取）`);
      }
    }
  }

  return { passed: issues.length === 0, issues };
}

/** 扫 characters/ 列出所有角色文件（按 _类型.md 后缀识别，过滤掉 relationships.md 等）。 */
export async function listCharacterFiles(novelDir: string): Promise<string[]> {
  const files = await listFiles(path.join(novelDir, "characters"), { extensions: [".md"] });
  return files.filter((f) => parseCharacterPath(path.basename(f)) !== null);
}

/** 从正文/大纲首行 H1 解析标题；无则返回 null。 */
export function parseHeadingTitle(content: string | null): string | null {
  if (!content) return null;
  const m = content.match(/^#\s+(.+?)\s*$/m);
  return m?.[1] ?? null;
}

/** 从大纲内容提取章节标题：优先「标题：xxx」/「标题: xxx」行，回退首行 H1。 */
export function extractOutlineTitle(content: string): string | undefined {
  const labeled = content.match(/标题[：:]\s*(.+)/);
  if (labeled) return labeled[1].trim();
  return parseHeadingTitle(content) ?? undefined;
}
