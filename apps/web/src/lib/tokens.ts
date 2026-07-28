/**
 * Token 数量的解析与格式化（model contextWindow / maxTokens 编辑用）。
 * 支持带 k/m 后缀的简写输入，便于在设置里直接写「200k」「20k」「1m」。
 */

/** 解析 token 数量字符串：支持 "1024" / "12k" / "1m" / "12.5k"。无效或 ≤0 返回 null。 */
export function parseTokenNumber(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const mult = m[2] === "k" ? 1000 : m[2] === "m" ? 1_000_000 : 1;
  const v = num * mult;
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/** 格式化 token 数量为简短显示：200000→"200k"，8000→"8k"，20480→"20480"（不能整除则原样）。 */
export function formatTokenNumber(n: number): string {
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `${n / 1_000_000}m`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}k`;
  return String(n);
}
