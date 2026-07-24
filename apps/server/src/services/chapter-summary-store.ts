/**
 * 章级摘要链存储：per-novel JSON 文件 `<novelDir>/.fictia/chapter-summaries.json`，
 * 结构 `{ "1": "摘要…", "2": "…" }`（key = 章节号字符串）。
 *
 * 选文件而非 chapters.summary DB 列作权威存储：writing loop 经 agent 写章节文件、
 * 不一定有 chapters DB 行（DB 行仅 routes/chapters.ts 手动 CRUD 创建），文件优先与
 * 项目「文件为主、SQLite 为元数据」的架构一致，且对两种章节来源都可用。
 */
import * as fs from "fs";
import * as path from "path";
import { fileService } from "./file.service.js";

function summariesPath(novelId: string): string {
  const novelDir = fileService.getNovelDir(novelId);
  return path.join(novelDir, ".fictia", "chapter-summaries.json");
}

/** 读取整本摘要映射；文件不存在或损坏时返回 {}。 */
export function readAllSummaries(novelId: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(summariesPath(novelId), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[String(k)] = v;
      }
      return out;
    }
  } catch {
    // not found or invalid — treat as empty
  }
  return {};
}

/** number < chapterNumber 的摘要，按章序返回（供摘要链注入）。 */
export function readSummariesBefore(
  novelId: string,
  chapterNumber: number,
): { number: number; summary: string }[] {
  const all = readAllSummaries(novelId);
  return Object.entries(all)
    .map(([k, summary]) => ({ number: Number(k), summary }))
    .filter((s) => Number.isInteger(s.number) && s.number < chapterNumber && s.number >= 1)
    .sort((a, b) => a.number - b.number);
}

/** 读取单章摘要；不存在则 null。 */
export function getSummary(novelId: string, chapterNumber: number): string | null {
  const all = readAllSummaries(novelId);
  const v = all[String(chapterNumber)];
  return v ?? null;
}

/** 写入/覆盖单章摘要（原子写：先写临时文件再 rename）。 */
export function writeSummary(novelId: string, chapterNumber: number, summary: string): void {
  const filePath = summariesPath(novelId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const all = readAllSummaries(novelId);
  all[String(chapterNumber)] = summary;
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}
