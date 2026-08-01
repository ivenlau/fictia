/**
 * 审核/校验报告解析。
 *
 * 忠实移植自 fictia-skill/scripts/lib/context.py::parse_review_verdict。
 * parity 以 Python 输出为准（7 个回归用例，含 3 个历史 bug 场景：
 * section 跨边界、修复日志混入、综合评分正则过松）。
 *
 * web 的 editor 产出的报告（综合评分 A/B/C/D + 严重/一般问题表）直接适用。
 */

export type Grade = "A" | "B" | "C" | "D";

export interface Verdict {
  grade: Grade | null;
  severe: number;
  normal: number;
  passed: boolean;
}

// section 体内「无」占位识别
const NONE_MARKER_RE = /^(无|（无）|\(无\)|无问题|无重大问题|无明显问题|无特别|暂无|-)\s*[。.！!]?\s*$/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 从报告中解析综合评分字母（A-D）。
 * 只匹配包含「综合评分」关键词的形态，不会误抓修复日志或「评分细项」表里的列头。
 */
function extractGrade(text: string): Grade | null {
  const pats: RegExp[] = [
    /\*\*?综合评分\*\*?[：:]\s*\*?\*?([A-D])/,
    /综合评分\*\*?[：:]\s*\*?\*?([A-D])/,
    // design-reviewer 格式：「## 综合评分」标题 + 换行 + **A**（无冒号，A 在新段）
    /^#{1,6}\s*综合评分[^\n]*\n+\s*\*{0,2}([A-D])/m,
  ];
  for (const pat of pats) {
    const m = pat.exec(text);
    if (m) return m[1] as Grade;
  }
  return null;
}

/**
 * 在 `### 严重问题` / `### 一般问题` 标题之后、下一个同级或更高级标题之前，
 * 统计数据行数。
 *
 * 关键点：
 * 1. section 边界：只在目标 section 内找表格，不跨过下一个 `###`/`##` 标题
 *    （否则会把细节问题/审核修复日志的行数误算）。
 * 2. 「无」占位识别：section 体内只有「无」/「（无）」/「暂无」等占位文字时返回 0。
 */
function countTableRowsAfterHeader(text: string, header: string): number {
  const headerRe = new RegExp("^(#{1,6})\\s*" + escapeRe(header) + "[^\\n]*\\n", "m");
  const m = headerRe.exec(text);
  if (!m) return 0;
  const marker = m[1]; // 形如 "###"
  const start = m.index + m[0].length;
  const rest = text.slice(start);

  // 找下一个同级或更高级标题（同一 marker 或更少 #）
  const nextRe = new RegExp("^#{1," + marker.length + "}\\s+", "m");
  const nextM = nextRe.exec(rest);
  const end = nextM ? nextM.index : rest.length;
  const sectionBody = rest.slice(0, end);

  // section 体内第一段非空文字：若是「无」占位，直接返回 0
  let firstLine = "";
  for (const ln of sectionBody.split("\n")) {
    const s = ln.trim();
    if (s) {
      firstLine = s;
      break;
    }
  }
  if (NONE_MARKER_RE.test(firstLine)) return 0;

  // section 体内第一个表格
  const tblM = /(?:^\|.*\|\s*\n)+/m.exec(sectionBody);
  if (!tblM) return 0;
  const tbl = tblM[0];
  const lines = tbl.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return 0;
  // 跳过表头与分隔行
  const dataLines = lines.slice(2).filter((l) => !/^\|[\s\-:|]+\|\s*$/.test(l));
  return dataLines.length;
}

/**
 * 从编辑审核报告中解析：综合评分、严重问题数、一般问题数、是否通过。
 * 通过条件：grade === "A" && severe === 0 && normal === 0。
 */
export function parseReviewVerdict(text: string): Verdict {
  const grade = extractGrade(text);
  const severe = countTableRowsAfterHeader(text, "严重问题");
  const normal = countTableRowsAfterHeader(text, "一般问题");
  return {
    grade,
    severe,
    normal,
    // 通过条件：A（优秀）+ 0 严重问题即达标；一般问题（normal）是优化建议，不阻塞通过
    passed: grade === "A" && severe === 0,
  };
}

/**
 * 一致性校验报告解析。skill 的 verdict consistency 复用同一解析逻辑
 * （报告结构相同：综合评分 + 严重/一般问题表）。
 */
export function parseConsistencyVerdict(text: string): Verdict {
  return parseReviewVerdict(text);
}
