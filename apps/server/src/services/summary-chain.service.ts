/**
 * 章级摘要链生成：章节定稿后蒸馏一段压缩摘要，写入 chapter-summary-store，
 * 供 assembleDynamicContext 串成跨章上下文骨架。
 *
 * 主路径 = LLM 一次性补全（最便宜已启用模型）；失败/无凭证 → 确定性兜底
 * （压缩章节末尾「写作备注」的关键条目）。整条链路失败不阻塞 writing loop。
 */
import { stream, type Context } from "@earendil-works/pi-ai";
import { pickAvailableModel } from "./model-picker.js";
import { resolveChapterFile } from "./entity.service.js";
import { writeSummary, getSummary } from "./chapter-summary-store.js";
import { fileService } from "./file.service.js";
import { readFileSafe } from "../utils/file.js";

const SUMMARY_MAX_CHARS = 300;
const SUMMARY_TIMEOUT_MS = 30_000;
const LLM_INPUT_LIMIT = 20_000;

const SYSTEM_PROMPT =
  "你是小说摘要编辑。把给定章节正文与写作备注蒸馏成一段不超过" +
  `${SUMMARY_MAX_CHARS}` +
  "字的压缩摘要，覆盖：本章情节拍点、关键揭示、触及或回收的伏笔、章末人物状态、为下章留下的衔接点。" +
  "只输出摘要正文，不要标题、不要分条、不要额外解释。";

/** LLM 蒸馏；任何失败（无模型/无凭证/超时/流错误）返回 null 走兜底。 */
async function summarizeByLLM(content: string): Promise<string | null> {
  const picked = pickAvailableModel();
  if (!picked) return null;
  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: content.slice(0, LLM_INPUT_LIMIT), timestamp: Date.now() }],
  };
  let out = "";
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("summary timeout")), SUMMARY_TIMEOUT_MS),
  );
  try {
    const eventStream = stream(picked.model, context, { apiKey: picked.apiKey });
    await Promise.race([
      (async () => {
        for await (const event of eventStream) {
          if (event.type === "text_delta") {
            out += event.delta;
          } else if (event.type === "error") {
            throw new Error(event.error?.errorMessage ?? "LLM error");
          }
        }
      })(),
      timeout,
    ]);
  } catch {
    return null;
  }
  out = out.trim();
  return out || null;
}

/** 确定性兜底：从「写作备注」抽关键条目拼摘要；无备注则取正文开头。 */
function condenseFromNotes(content: string): string {
  const body = content.replace(/###\s*写作备注[\s\S]*$/, "").trim();
  const notesMatch = content.match(/###\s*写作备注\s*\n([\s\S]*?)$/);
  const notes = notesMatch ? notesMatch[1] : "";
  const pick = (key: string): string | null => {
    const re = new RegExp(`- \\*\\*${key}\\*\\*[：:]\\s*([^\\n]+)`);
    const m = notes.match(re);
    return m ? m[1].trim() : null;
  };
  const bits = [
    pick("支线推进"),
    pick("新设定引入"),
    pick("角色状态更新"),
    pick("下章衔接"),
    pick("伏笔操作"),
  ].filter((x): x is string => !!x);
  if (bits.length) {
    return bits.join("；").slice(0, SUMMARY_MAX_CHARS);
  }
  // 无备注：取正文前若干字
  return (body || content).slice(0, SUMMARY_MAX_CHARS);
}

export interface GenerateSummaryResult {
  chapterNumber: number;
  summary: string;
  source: "llm" | "fallback";
}

/**
 * 为指定章节生成压缩摘要并写入摘要链存储。
 * 幂等：重复调用覆盖该章摘要。返回 null 表示读不到章节正文（无可生成内容）。
 */
export async function generateChapterSummary(
  novelId: string,
  chapterNumber: number,
): Promise<GenerateSummaryResult | null> {
  const novelDir = fileService.getNovelDir(novelId);
  const chapterPath = await resolveChapterFile(novelDir, chapterNumber);
  if (!chapterPath) return null;
  const content = await readFileSafe(chapterPath);
  if (!content || !content.trim()) return null;

  let summary = await summarizeByLLM(content);
  let source: "llm" | "fallback" = "llm";
  if (!summary) {
    summary = condenseFromNotes(content);
    source = "fallback";
  }
  summary = summary.trim().slice(0, SUMMARY_MAX_CHARS * 2);
  if (!summary) return null;

  writeSummary(novelId, chapterNumber, summary);
  return { chapterNumber, summary, source };
}

/** 读单章摘要（供路由/UI）。 */
export function getChapterSummary(novelId: string, chapterNumber: number): string | null {
  return getSummary(novelId, chapterNumber);
}
