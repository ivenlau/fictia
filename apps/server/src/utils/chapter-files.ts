/**
 * 章节文件扫描 helper（基于 @fictia/shared/paths 的命名规范）。
 * chapters/ 扁平、act 编码进文件名后，按章节号定位文件靠扫描 + parseChapterNumber。
 */
import * as path from "path";
import { parseChapterNumber, parseActNumber, parseCharacterPath } from "@fictia/shared";
import { listFiles } from "./file.js";

/** 扫 chapters/ 找指定章节号对应的文件（扁平，act 进文件名）。同号多版本取 act 最大者。 */
export async function findChapterFile(novelDir: string, number: number): Promise<string | null> {
  const files = await listFiles(path.join(novelDir, "chapters"), { extensions: [".md"] });
  const matches = files.filter((f) => parseChapterNumber(path.basename(f)) === number);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // 历史脏数据残留（同章节号多 act 版本）：取 act 最大的（通常最新）
  matches.sort(
    (a, b) => (parseActNumber(path.basename(a)) ?? 0) - (parseActNumber(path.basename(b)) ?? 0),
  );
  return matches[matches.length - 1];
}

/** 扫 outline/chapters/ 找指定章节号对应的大纲文件。 */
export async function findOutlineFile(novelDir: string, number: number): Promise<string | null> {
  const files = await listFiles(path.join(novelDir, "outline", "chapters"), { extensions: [".md"] });
  return files.find((f) => parseChapterNumber(path.basename(f)) === number) ?? null;
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
