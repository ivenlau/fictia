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

export interface SummaryEntry {
  number: number;
  summary: string;
  /** 滑窗省略标记（非真实章摘要，仅作占位提示）。 */
  omitted?: boolean;
}

/** 字符上限兜底：总字符超 maxChars 时从最早开始丢，至少保留最后一条。 */
function capSummaryChars(entries: SummaryEntry[], maxChars: number): SummaryEntry[] {
  let total = entries.reduce((s, e) => s + e.summary.length, 0);
  if (total <= maxChars) return entries;
  const result = [...entries];
  while (result.length > 1 && total > maxChars) {
    total -= result[0].summary.length;
    result.shift();
  }
  return result;
}

/** 相邻条目章号跳跃 > 1 处插入省略标记（供滑窗后补全中间省略提示）。 */
function withOmissionMarkers(entries: SummaryEntry[]): SummaryEntry[] {
  const result: SummaryEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    result.push(entries[i]);
    const next = entries[i + 1];
    if (next && !next.omitted && next.number - entries[i].number > 1) {
      const from = entries[i].number + 1;
      const to = next.number - 1;
      const count = to - from + 1;
      result.push({
        number: -1,
        summary: `—— 中间省略第 ${from}-${to} 章（共 ${count} 章）；可用 get_chapter_summary 查单章详情 ——`,
        omitted: true,
      });
    }
  }
  return result;
}

/**
 * number < chapterNumber 的摘要，按章序返回（供摘要链注入）。
 * 长篇滑窗：超 maxRecent 章时保留第 1 章 + 最近 maxRecent 章，中间用 omitted 标记占位；
 * 并对总字符做 maxChars 兜底（超限从最早丢，保最近）。短篇（≤maxRecent 章）全量返回，行为不变。
 */
export function readSummariesBefore(
  novelId: string,
  chapterNumber: number,
  opts?: { maxRecent?: number; maxChars?: number },
): SummaryEntry[] {
  const maxRecent = opts?.maxRecent ?? 20;
  const maxChars = opts?.maxChars ?? 15000;
  const all = readAllSummaries(novelId);
  const full = Object.entries(all)
    .map(([k, summary]) => ({ number: Number(k), summary }))
    .filter((s) => Number.isInteger(s.number) && s.number < chapterNumber && s.number >= 1)
    .sort((a, b) => a.number - b.number);

  if (full.length === 0) return [];
  // 短篇或未超阈值：全量（仅做字符上限兜底）
  if (full.length <= maxRecent) return capSummaryChars(full, maxChars);

  // 长篇滑窗：第 1 章 + 最近 maxRecent 章，字符兜底后补省略标记
  const recent = full.slice(-maxRecent);
  const first = full[0];
  const kept = capSummaryChars([first, ...recent], maxChars);
  return withOmissionMarkers(kept);
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
