/**
 * 文本滑窗切块（字符级，句子边界对齐）。
 *
 * 用于向量索引：把长文件切成 ~maxChars 字符、带 overlap 的多块，每块独立嵌入。
 * 切点优先落在段落/句子边界（在窗口内**向后**找最近的强终止符），避免把句子
 * 拦腰切断；窗口内找不到任何边界时才硬切。
 *
 * 之所以用字符而非 token：transformers.js v4.2.0 的 tokenizer 不支持 offset_mapping，
 * 无法把 token 窗口映射回原始字符区间，token 切只能 encode→切片→decode（有损、
 * 边界可能落在词中间）；而中文字符≈token（XLM-R BPE 基本一字一 token），字符切
 * + 句子边界对齐既可控又能保证语义完整。
 *
 * 环境变量：
 *   EMBEDDING_CHUNK_CHARS   - 单块最大字符数，默认 600（≈500 CJK token），下限 128
 *   EMBEDDING_CHUNK_OVERLAP - 相邻块重叠字符数，默认 60（≈10%），钳制到 [0, maxChars/2]
 */

export interface Chunk {
  text: string;
  /** 该文件内第几块（从 0 起）。 */
  index: number;
  /** 块在原文中的起始字符偏移（含）。 */
  charStart: number;
  /** 块在原文中的结束字符偏移（不含）。 */
  charEnd: number;
}

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

const DEFAULT_MAX_CHARS = Math.max(128, Math.floor(Number(process.env.EMBEDDING_CHUNK_CHARS ?? 600)) || 600);
const DEFAULT_OVERLAP = Math.max(0, Math.floor(Number(process.env.EMBEDDING_CHUNK_OVERLAP ?? 60)) || 60);

// 边界正则（全局，供 lastIndex 窗口扫描）。优先级从高到低，均为「强终止」边界。
const RE_PARAGRAPH = /\n[ \t]*\n/g; // 段落分隔（空行）
const RE_SENT_NL = /[。！？!?.][ \t]*\n/g; // 句末符 + 换行
const RE_SENT = /[。！？!?.]/g; // 任意句末符
const RE_NL = /\n/g; // 任意换行

/**
 * 在 [from, to] 内找 re 的**最后一个**匹配，返回匹配结束位置（边界归左块，
 * 即切点在匹配之后）；无匹配返回 null。
 *
 * 用 lastIndex=from 做窗口扫描，复杂度 O(窗口内匹配数)，整篇切块是 O(n)。
 */
function lastMatchEnd(text: string, re: RegExp, from: number, to: number): number | null {
  re.lastIndex = from;
  let best: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end > to) break; // 匹配只会越来越靠后，越界即停
    best = end;
    if (m.index === re.lastIndex) re.lastIndex++; // 零宽保护，避免死循环
  }
  re.lastIndex = 0;
  return best;
}

/**
 * 在 (from, to] 内按优先级找切分点：段落 > 句末+换行 > 句末符 > 换行 > 兜底硬切(to)。
 * 始终返回 > from 的值（兜底 to ≥ from+1，因调用方保证 to > from）。
 */
function findBoundary(text: string, from: number, to: number): number {
  return (
    lastMatchEnd(text, RE_PARAGRAPH, from, to) ??
    lastMatchEnd(text, RE_SENT_NL, from, to) ??
    lastMatchEnd(text, RE_SENT, from, to) ??
    lastMatchEnd(text, RE_NL, from, to) ??
    to
  );
}

/**
 * 把文本切成带 overlap 的滑窗块，切点对齐句子边界。
 *
 * - 空/纯空白 → []。
 * - 短块（长度 ≤ overlap）：直接前进到块末尾，不回退重叠（无法重叠比自己短的块）。
 * - 尾块（剩余 ≤ maxChars）：整段到末尾收尾，不再细分，避免尾部退化成碎块。
 *
 * 保证：相邻块区间连续无空洞；每块 text === 原文 slice(charStart, charEnd)。
 */
export function chunkText(text: string, opts?: ChunkOptions): Chunk[] {
  if (!text || !text.trim()) return [];

  // 显式传入时尊重调用方（仅 env 默认值有 128 下限保护），便于测试用小块验证边界逻辑。
  const maxChars = opts?.maxChars != null ? Math.max(1, Math.floor(opts.maxChars)) : DEFAULT_MAX_CHARS;
  const overlap = Math.min(
    opts?.overlap != null ? Math.max(0, Math.floor(opts.overlap)) : DEFAULT_OVERLAP,
    Math.floor(maxChars / 2),
  );

  const len = text.length;
  const chunks: Chunk[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < len) {
    // 剩余 ≤ maxChars：作为最后一块整体收尾（其起始已与上一块重叠 overlap）
    if (len - cursor <= maxChars) {
      chunks.push({ text: text.slice(cursor, len), index, charStart: cursor, charEnd: len });
      break;
    }
    const windowEnd = cursor + maxChars;
    const chunkEnd = findBoundary(text, cursor, windowEnd);
    chunks.push({ text: text.slice(cursor, chunkEnd), index, charStart: cursor, charEnd: chunkEnd });
    index += 1;
    // 块短于 overlap 时直接前进到块末尾；否则回退 overlap 形成重叠窗口
    let nextCursor = chunkEnd - cursor <= overlap ? chunkEnd : chunkEnd - overlap;
    if (nextCursor <= cursor) nextCursor = cursor + 1; // 防御性：确保前进
    cursor = nextCursor;
  }
  return chunks;
}
