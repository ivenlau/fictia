/**
 * 参考作品 → 三类素材解析管线（风格指纹 / 体裁卡 / 技法）。
 *
 * 流程：读 source.txt → 章节切分/滑窗 → 叙事结构采样(5 位置)+启发式打分
 * → map(并发蒸馏每段的三类信号：文风/体裁/技法) → reduce(三类各一次聚合) →
 * 写 fingerprint.md / genre-card.md / craft.md。
 *
 * 定位（用户确认）：参考作品是输入、素材是产出。不做向量库、不做召回。
 * LLM 调用复用 model-picker.pickAvailableModel。
 */
import { stream, type Context } from "@earendil-works/pi-ai";
import { pickAvailableModel, type PickedModel } from "./model-picker.js";
import {
  readSource,
  saveFingerprint,
  saveGenreCard,
  saveCraft,
  setParseStatus,
} from "../utils/reference-works.js";

const SEGMENT_MAX_CHARS = 6000;
const LLM_INPUT_LIMIT = 20_000;
const MAP_TIMEOUT_MS = 30_000;
const REDUCE_TIMEOUT_MS = 60_000;
const MAP_PER_POSITION = 2;

const MAP_SYSTEM_PROMPT = [
  "你是文学分析师。给定参考作品的一个片段及其在全书中的叙事位置，",
  "提炼三类「可迁移到其他作品」的规律：",
  "",
  "【文风】叙事视角 / 句式偏好 / 对话风格 / 节奏控制 / 情绪浓度 / 修辞偏好，每条 ≤30 字。",
  "【体裁】该作品所属体裁的世界规则、力量体系、角色原型、冲突模式、爽点类型、",
  "节奏打法等体裁级要素，每条 ≤40 字（写规律，不写具体设定）。",
  "【技法】这段写得好所用到的具体技法，每条格式：`- **技法名**：一句话描述。适用：场景。`",
  "",
  "严格约束：禁止复制原文句子；禁止引用具体人名 / 地名 / 作品专有名词；禁止复述剧情。",
  "",
  "输出格式（严格按标记分三段，不要前言）：",
  "【文风】",
  "- 条目",
  "【体裁】",
  "- 条目",
  "【技法】",
  "- **技法名**：描述。适用：场景。",
].join("\n");

const REDUCE_FINGERPRINT_PROMPT = [
  "你是文学风格编辑。下面是对一本参考作品多个片段分别提炼出的「文风」规律。",
  "请聚合成一份统一的「风格指纹」——其他作者可照着执行的风格约束清单。",
  "",
  "要求：",
  "- 用固定的六个二级标题：## 叙事视角、## 语言风格、## 对话处理、",
  "  ## 节奏与结构、## 修辞与情绪、## 禁忌（应避免的写法）；",
  "- 每条是可执行约束（如「第三人称限知，始终聚焦主角」「短句为主，70% 句子 <15 字」）；",
  "- 跨片段去重、合并相近条目；",
  "- 全文不得出现原作品的人名、地名或任何专有名词；",
  "- 总长度不超过 600 字。",
  "",
  "只输出风格指纹正文，不要前言、不要解释。",
].join("\n");

const REDUCE_GENRE_PROMPT = [
  "你是体裁分析师。下面是对一本参考作品多个片段提炼出的「体裁」要素。",
  "请聚合成一份该体裁的「写作指南卡」——可迁移到同类体裁的创作参考。",
  "",
  "要求：",
  "- 用以下二级标题组织：## 开场抓手、## 冲突发动机、## 爽点与情绪释放、",
  "  ## 对话与声线、## 章尾钩子、## 场景颗粒、## 节奏密度、## 禁止漂移；",
  "- 每条是可执行的体裁打法（从要素归纳出「怎么写」，不是列设定）；",
  "- 跨片段去重；全文不得出现原作品的人名、地名或专有名词；",
  "- 总长度不超过 700 字。",
  "",
  "只输出体裁卡正文，不要前言、不要解释。",
].join("\n");

const REDUCE_CRAFT_PROMPT = [
  "你是写作技法编辑。下面是对一本参考作品多个片段提炼出的「亮点技法」。",
  "请去重、合并、补全，整理成一份「技法参考」——每个技法是一条可执行指令。",
  "",
  "要求：",
  "- 输出若干 `## N. 技法名` 节（N 从 1 递增），每节含：",
  "  - 一句话点明技法核心；",
  "  - 「适用：」一行说明用在什么场景；",
  "- 合并相近技法，控制在 4-8 个技法；",
  "- 全文不得出现原作品的人名、地名或专有名词，不要复制原文；",
  "- 总长度不超过 700 字。",
  "",
  "只输出技法正文，不要前言、不要解释。",
].join("\n");

// ==================== 文本切分 ====================

const CHAPTER_RE =
  /(?:^|\n)\s*(?:第[零一二三四五六七八九十百千万0-9]+\s*[章节回卷部][\s:：、.\-]*|#{1,3}\s+\S[^\n]*)/g;

/** 按中文章节/卷/节/回或 Markdown 标题切分。切出 <3 段视为切不出。 */
function splitByChapter(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  CHAPTER_RE.lastIndex = 0;
  const matches = [...trimmed.matchAll(CHAPTER_RE)];
  if (matches.length < 3) return [];
  const chunks: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? trimmed.length) : trimmed.length;
    const piece = trimmed.slice(start, end).trim();
    if (piece) chunks.push(piece);
  }
  return chunks;
}

/** 按段落（空行分隔）累积到 ~target 字切段，不切断单个段落。 */
function splitBySlidingWindow(text: string, target = SEGMENT_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const paras = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) return [trimmed];
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > target) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
    if (cur.length > target * 1.5) {
      chunks.push(cur);
      cur = "";
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.length ? chunks : [trimmed];
}

// ==================== 启发式打分 + 采样 ====================

interface Sample {
  text: string;
  position: string;
}

/** 零成本标点统计：对话/情绪/节奏/长短交错 加权。值越大越「有代表性」。 */
function scoreSegment(text: string): number {
  const len = text.length;
  if (len === 0) return 0;
  const quotes = (text.match(/["“”‘’「」『』]/g) || []).length / 2;
  const dialogueDensity = (quotes / len) * 1000;
  const emotion = (text.match(/[！？!?]/g) || []).length;
  const emotionDensity = (emotion / len) * 1000;
  const periods = (text.match(/[。！？!?]/g) || []).length;
  const periodDensity = (periods / len) * 1000;
  const paraLens = text.split(/\n/).map((s) => s.length).filter((n) => n > 0);
  const mean = paraLens.length ? paraLens.reduce((a, b) => a + b, 0) / paraLens.length : 0;
  const variance =
    paraLens.length && mean
      ? paraLens.reduce((a, b) => a + (b - mean) ** 2, 0) / paraLens.length
      : 0;
  const paraLenVar = mean ? variance / mean : 0;
  return dialogueDensity * 0.3 + emotionDensity * 0.2 + periodDensity * 0.2 + paraLenVar * 0.3;
}

/**
 * 叙事结构采样：开头/第一转折/中点/高潮/结尾 5 位置，每位置取打分 top-K。
 * 退化保护：整篇 chunk<5 时放弃分位置，全局取 top-K。
 */
function sampleNarrativePositions(chunks: string[], perPosition = MAP_PER_POSITION): Sample[] {
  const n = chunks.length;
  if (n === 0) return [];
  if (n < 5) {
    return chunks
      .map((text) => ({ text, score: scoreSegment(text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(perPosition, n))
      .map((s) => ({ text: s.text, position: "全文" }));
  }
  const positions = [
    { name: "开头", from: 0, to: Math.max(1, Math.floor(n * 0.1)) },
    { name: "第一转折", from: Math.floor(n * 0.2), to: Math.floor(n * 0.35) },
    { name: "中点", from: Math.floor(n * 0.45), to: Math.floor(n * 0.6) },
    { name: "高潮", from: Math.floor(n * 0.7), to: Math.floor(n * 0.85) },
    { name: "结尾", from: Math.max(0, n - Math.max(1, Math.floor(n * 0.1))), to: n },
  ];
  const out: Sample[] = [];
  for (const pos of positions) {
    const window = chunks.slice(pos.from, Math.max(pos.from + 1, pos.to));
    const picked = window
      .map((text) => ({ text, score: scoreSegment(text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(perPosition, window.length));
    for (const s of picked) out.push({ text: s.text, position: pos.name });
  }
  return out;
}

// ==================== LLM 调用 ====================

async function callLLM(
  picked: PickedModel,
  systemPrompt: string,
  userContent: string,
  timeoutMs: number,
): Promise<string | null> {
  const context: Context = {
    systemPrompt,
    messages: [{ role: "user", content: userContent.slice(0, LLM_INPUT_LIMIT), timestamp: Date.now() }],
  };
  let out = "";
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("reference parse timeout")), timeoutMs),
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

async function distillSegment(picked: PickedModel, sample: Sample): Promise<string | null> {
  const user = `【叙事位置：${sample.position}】\n\n以下是参考作品的一个片段，请提炼其可迁移的文风/体裁/技法规律：\n\n${sample.text}`;
  return callLLM(picked, MAP_SYSTEM_PROMPT, user, MAP_TIMEOUT_MS);
}

/** 从单段 map 产出里抽取某一类（文风/体裁/技法）内容；无标记返回 ""。 */
function extractSection(text: string, marker: string): string {
  const markers = ["【文风】", "【体裁】", "【技法】"];
  const startIdx = text.indexOf(marker);
  if (startIdx === -1) return "";
  let endIdx = text.length;
  for (const m of markers) {
    if (m === marker) continue;
    const idx = text.indexOf(m, startIdx + marker.length);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }
  return text.slice(startIdx + marker.length, endIdx).trim();
}

/** 把多段 map 产出拆成三类聚合文本（用于各自 reduce）。 */
function splitDistillations(distillations: string[]): {
  style: string;
  genre: string;
  craft: string;
} {
  const join = (marker: string) =>
    distillations
      .map((d) => extractSection(d, marker))
      .filter((s) => s.trim())
      .join("\n\n---\n\n");
  return { style: join("【文风】"), genre: join("【体裁】"), craft: join("【技法】") };
}

/** 单次聚合：内容空则直接返回 null（跳过该类产出）。 */
async function reduceOnce(
  picked: PickedModel,
  systemPrompt: string,
  content: string,
): Promise<string | null> {
  if (!content.trim()) return null;
  const user = `以下是参考作品多个片段分别提炼出的规律，请聚合成一份统一产出：\n\n${content}`;
  return callLLM(picked, systemPrompt, user, REDUCE_TIMEOUT_MS);
}

// ==================== 主入口 ====================

export interface ParseResult {
  source: "llm" | "fallback";
  segments: number;
  samples: number;
  /** 三类产出字数（reduce 失败时为兜底拼接字数，可能为 0 表示该类无产出）。 */
  fingerprintChars: number;
  genreChars: number;
  craftChars: number;
}

/**
 * 解析参考作品为三类素材并落盘。同步执行（map 并发 + 3 次 reduce，约 60-120s）。
 * 失败语义：map 全失败 → throw（置 failed）；每类 reduce 失败 → 用该类 map 产出
 * 拼接兜底（source=fallback），该类若连 map 也无内容则不落该产出文件。
 */
export async function parseReference(
  novelDir: string,
  key: string,
  onProgress?: (msg: string) => void,
): Promise<ParseResult> {
  const source = await readSource(novelDir, key);
  if (!source || !source.trim()) throw new Error("参考作品原文为空");

  const picked = pickAvailableModel();
  if (!picked) throw new Error("无可用的 LLM 模型/凭证（请在设置中配置 provider 与 API key）");

  await setParseStatus(novelDir, key, "parsing");
  onProgress?.("切分章节…");

  let chunks = splitByChapter(source);
  if (chunks.length < 3) chunks = splitBySlidingWindow(source);
  if (chunks.length === 0) chunks = [source.slice(0, SEGMENT_MAX_CHARS)];

  onProgress?.(`采样代表性片段（全书切为 ${chunks.length} 段）…`);
  const samples = sampleNarrativePositions(chunks);
  if (samples.length === 0) {
    await setParseStatus(novelDir, key, "failed");
    throw new Error("采样失败：原文过短或无可读片段");
  }

  onProgress?.(`蒸馏文风/体裁/技法（${samples.length} 段并发，预计 30-60 秒）…`);
  const distillations = await Promise.all(
    samples.map((s) => distillSegment(picked, s).catch(() => null)),
  );
  const valid = distillations.filter((d): d is string => !!d && d.trim().length > 0);
  if (valid.length === 0) {
    await setParseStatus(novelDir, key, "failed");
    throw new Error("特征蒸馏全部失败（请检查 LLM 配置/网络后重试）");
  }

  const { style, genre, craft } = splitDistillations(valid);

  onProgress?.("聚合成三类素材（风格指纹 / 体裁卡 / 技法）…");
  const [fp, ge, cr] = await Promise.all([
    reduceOnce(picked, REDUCE_FINGERPRINT_PROMPT, style).catch(() => null),
    reduceOnce(picked, REDUCE_GENRE_PROMPT, genre).catch(() => null),
    reduceOnce(picked, REDUCE_CRAFT_PROMPT, craft).catch(() => null),
  ]);

  // 每类：reduce 成功用 reduce 产出；reduce 失败用 map 拼接兜底；连 map 也空则跳过。
  const fingerprintText = fp?.trim() || style || "";
  const genreText = ge?.trim() || genre || "";
  const craftText = cr?.trim() || craft || "";
  const sourceKind: "llm" | "fallback" = !fp || !ge || !cr ? "fallback" : "llm";

  await saveFingerprint(novelDir, key, fingerprintText);
  if (genreText) await saveGenreCard(novelDir, key, genreText);
  if (craftText) await saveCraft(novelDir, key, craftText);
  await setParseStatus(novelDir, key, "done");
  onProgress?.("完成");

  return {
    source: sourceKind,
    segments: chunks.length,
    samples: samples.length,
    fingerprintChars: fingerprintText.length,
    genreChars: genreText.length,
    craftChars: craftText.length,
  };
}
