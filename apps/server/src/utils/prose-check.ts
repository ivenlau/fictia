/**
 * AI 模式检测：扫描中文散文中的高风险 AI 腔句式，返回 findings 列表。
 *
 * 检测 18 条规则，blocking 6 条 / advisory 12 条。
 * 忠实移植自 fictia-skill/scripts/lib/prose_check.py（与 JS 版 check-ai-patterns.js 同源）；
 * 阈值、正则、处理流水线保持一致。parity 以 Python scan_text 输出为准。
 */

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type Severity = "blocking" | "advisory";

export interface Finding {
  line: number;
  column: number;
  type: string;
  severity: Severity;
  message: string;
  excerpt: string;
}

export interface ProseReport {
  blocking: Finding[];
  advisory: Finding[];
}

interface ProseLine {
  text: string;
  lineNo: number;
}

// ---------------------------------------------------------------------------
// 正则安全包装（避免 /g 的 lastIndex 状态泄漏）
// ---------------------------------------------------------------------------

/** 全局匹配所有结果（克隆为 /g，不影响原 regex）。 */
function findAll(re: RegExp, str: string): RegExpExecArray[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(str)) !== null) {
    out.push(m);
    if (m.index === g.lastIndex) g.lastIndex++; // 零宽匹配防死循环
  }
  return out;
}

/** 首个匹配（克隆为非 /g）。 */
function findFirst(re: RegExp, str: string): RegExpExecArray | null {
  const ng = new RegExp(re.source, re.flags.replace(/g/g, ""));
  return ng.exec(str);
}

/** 是否匹配。 */
function testAny(re: RegExp, str: string): boolean {
  return findFirst(re, str) !== null;
}

/** 全局替换。 */
function replaceAll(
  re: RegExp,
  str: string,
  replacer: (m: string, offset: number, groups: string[]) => string,
): string {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return str.replace(g, replacer as never);
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const STOP_CHARS = new Set(["。", "！", "？", "!", "?", "\n"]);
const SOFT_SEPARATORS = new Set(["，", ",", "、", "；", ";", "：", ":"]);
const HARD_SEPARATORS = new Set(["。", ".", "！", "!", "？", "?"]);
const MAX_NEGATIVE_SPAN = 80;
const MAX_POSITIVE_SPAN = 80;

// 碎句号
const STUTTER_MIN_RUN = 6;
const STUTTER_MAX_SENTENCE = 5;

// 长段落
const LONG_PARAGRAPH_CHARS = 200;

// 微动作复读
const MICRO_TIC_PATTERN = /了(?:[一两三几半])?[下阵圈道声眼口气会]/;
const MICRO_TIC_MIN_HITS = 5;
const MICRO_TIC_PER_KILO = 6;

// 监控摄像头式动作清单
const ACTION_LIST_VERB_PATTERN = /伸手|抬手|探手|拿起|拿过|取出|取过|掏出|摸出|抓起|攥住|握住|捏住|按住|推开|拉开|打开|关上|放下|递给|挑开|掀开|扯开|拧开|倒出|端起|转身|回头|抬头|低头|弯腰|俯身|走到|走向|坐下|站起|看向|看着|盯着|扫过/;
const ACTION_LIST_MIN_HITS = 5;
const ACTION_LIST_MIN_SEPARATORS = 4;

// 抽象总结复读
const ABSTRACT_SUMMARY_PATTERNS: RegExp[] = [
  /这一刻[，,]?[^。！？!?\n]{0,24}(?:终于|才)(?:明白|意识到)/,
  /从这一刻开始/,
  /(?:命运|宿命)[^。！？!?\n]{0,28}(?:齿轮|棋局|獠牙|改写|推向|安排)/,
  /早已[^。！？!?\n]{0,8}(?:布好|安排好)[^。！？!?\n]{0,8}(?:棋局|局)/,
  /前所未有的(?:决意|清醒|勇气|力量|恐惧|平静|信念)/,
  /(?:反击|复仇|战争|较量|故事|命运)[^。！？!?\n]{0,12}才刚刚开始/,
  /(?:新的开始|全新的开始)/,
];
const ABSTRACT_SUMMARY_MIN_HITS = 3;
const ABSTRACT_SUMMARY_PER_KILO = 4;

// 套词密度
const CLICHE_PATTERNS: RegExp[] = [
  /仿佛|犹如|宛若|如同/,
  /一丝|一抹|些许|几分|隐约/,
  /深吸一口气|缓缓|微微|轻轻|淡淡/,
  /眼中闪过|嘴角勾起|眸光微微一闪|指节泛白|目光锐利|眼神锐利/,
  /心中涌起一股|心头一震|心中一动|心下了然|心中暗道|心中一凛/,
  /不容置疑|不容置喙|不易察觉|显而易见|毫无疑问|不可否认/,
  /声音不大[，,]?却带着|语气平静无波|平静无波|声音平直|听不出情绪/,
  /不知何时|唾手可得|无声翻涌|沉默(?:在[^。！？!?\n]{0,16})?蔓延|难以言说/,
  /散发着一股|冰冷的光|格外刺眼|深邃而冰冷/,
];
const CLICHE_DENSITY_MIN_HITS = 8;
const CLICHE_DENSITY_PER_KILO = 12;

// 比喻密度
const METAPHOR_MARKER_PATTERN = /好像|像是|仿佛|宛如|如同|犹如|(?<![不头图画录摄肖])像(?![头像素])/;
const METAPHOR_LIKE_PHRASE_PATTERN = /(?:死|水|冰|火|潮水|石头|木头|机器|纸|铁|鬼|死人|刀|针|网|墙)一样/;
const METAPHOR_DENSITY_MIN_HITS = 7;
const METAPHOR_DENSITY_PER_KILO = 3;

// 解释链密度
const REASONING_CHAIN_PATTERNS: { key: string; core: boolean; pattern: RegExp }[] = [
  {
    key: "mental",
    core: true,
    pattern: /(?<![不没未无])(?:他|她|我)?(?:知道|明白|意识到|清楚|判断|确认|分析)/,
  },
  {
    key: "connector",
    core: true,
    pattern:
      /这意味着|也就是说|换句话说|真正的问题(?:在于)?|问题在于|关键在于|在这种情况下|按照这个逻辑|只有这样|想到这里/,
  },
  {
    key: "modal",
    core: true,
    pattern:
      /(?:(?<!不)(?:必须|需要|应该|只要|就会|可能|可以|能够|无法)|不能)[^。！？!?\n]{0,16}(?:判断|确认|承担|维持|稳住|控制|扩大|失控|带来|造成|理解|默认|回家|进门|核对|筛选|减少|建立|风险|结果|秩序|责任)/,
  },
  {
    key: "abstract",
    core: false,
    pattern: /(?:任务|条件|风险|来源|逻辑|局面|结果|责任|秩序|规则|信息不足|决策能力)/,
  },
];
const REASONING_CHAIN_MIN_HITS = 8;
const REASONING_CHAIN_CORE_MIN_HITS = 4;
const REASONING_CHAIN_MIN_BUCKETS = 2;
const REASONING_CHAIN_PER_KILO = 18;

// 系统公告公文腔
const NOTICE_FORMAL_PATTERNS: RegExp[] = [
  /不得|必须|不可|禁止|严禁|应当|须|需|务必/,
  /当前|本公告|本规则|本系统|提示|任务失败|临时权限|权限|状态|等级/,
  /维持|公共区域|秩序|优先|惩罚|处罚|违规|指令|执行/,
  /被视为|同样计入|计入|承担|责任|单位|撤回|转发|截图/,
];
const NOTICE_FORMAL_CORE_PATTERN = /不得|必须|不可|禁止|严禁|应当|须|需|务必|被视为|同样计入|计入/;
const NOTICE_FORMAL_MIN_LINES = 4;
const NOTICE_FORMAL_MIN_HITS = 12;
const NOTICE_FORMAL_CORE_MIN_HITS = 5;
const NOTICE_FORMAL_PER_KILO = 60;

// 过度精炼短段
const OVERCOMPRESSED_PROSE_PARTICLE_PATTERN = /[的了就着过呢吧啊呀嘛]/;
const OVERCOMPRESSED_PROSE_MIN_CHARS = 1200;
const OVERCOMPRESSED_PROSE_MIN_PARAS = 45;
const OVERCOMPRESSED_PROSE_SHORT_MAX_CHARS = 15;
const OVERCOMPRESSED_PROSE_SHORT_RATIO = 0.58;
const OVERCOMPRESSED_PROSE_PARTICLE_PER_KILO = 85;

// 低连接密度
const LOW_CONNECTIVE_FUNCTION_TERMS = [
  "的", "了", "就", "在", "是", "也", "都", "还", "又", "把", "被", "给",
  "这个", "那个", "里面", "以后", "时候", "现在", "因为", "所以", "但是",
  "不过", "然后", "已经", "还是", "起来", "出来", "下去",
];
const LOW_CONNECTIVE_PLAIN_TERMS = [
  "的", "了", "就", "也", "还", "又", "这个", "那个", "东西", "事情",
  "时候", "里面", "以后", "一下", "一点", "有点", "还是",
];
const LOW_CONNECTIVE_MIN_CHARS = 800;
const LOW_CONNECTIVE_FUNCTION_PER_KILO = 100;
const LOW_CONNECTIVE_PLAIN_PER_KILO = 65;
const LOW_CONNECTIVE_LONG_SENTENCE_CHARS = 30;
const LOW_CONNECTIVE_LONG_SENTENCE_RATIO = 0.08;

// not-is / reverse-not-is 前字排除
const COMPACT_EITHER_OR_PREV = new Set(["不", "就", "也"]);
const TAG_PARTICLES = new Set(["吗", "吧", "嘛"]);
const AFFIRMATION_TAG_PARTICLES = new Set(["的", "啊", "呀", "呢"]);
const AFFIRMATION_TAG_BOUNDARY = new Set([
  "", "，", ",", "。", ".", "！", "!", "？", "?", "、", "；", ";", "：", ":",
  "\n", "\r", "\t", " ",
]);

// 反序对比前字排除
const REVERSE_NOT_IS_PREV_EXCLUDE = new Set<string>([
  ...COMPACT_EITHER_OR_PREV,
  "还", "只", "可", "但", "于", "倒", "像", "若", "要", "正", "便",
  "总", "老", "更", "最", "算", "怕", "凡", "或", "即", "自", "竟",
  "原", "本", "仍", "许", "净", "光", "单", "尽",
]);

// 音量反差腔
const VOICE_CONTRAST_PATTERN = /声音(?:并)?不[大高响亮][^。！？!?\n]{0,16}[却但偏]/;

// 否定排比
const NEGATION_PARADE_PATTERNS: RegExp[] = [
  /(?:没有[^。！？!?\n，,]{1,12}[，,]){2}/,
  /没(?:有)?[^。！？!?\n，,]{1,12}[，,]\s*没(?:有)?[^。！？!?\n，,]{1,16}[，,。.][^。！？!?\n，,]{0,6}只(?:是|会|有)/,
];

// 反序对比
const REVERSE_NOT_IS_PATTERN = /是([^。！？!?\n，,]{1,12})[，,]\s*(?:而)?不是([^。！？!?\n]{1,20})/;

// 预告式总结收尾
const TRAILER_ENDING_PATTERN =
  /没人知道|谁也不知道|谁也没想到|殊不知|(?:这)?才刚刚开(?:始|头)|正(?:朝着|向着)[^。！？!?\n]{0,24}(?:压|涌|袭|逼)(?:了?过去|了?过来|来)|(?<!正式)拉开(?:序幕|帷幕)|即将(?:开始|来临|降临)/;
const TRAILER_ENDING_WINDOW_CHARS = 600;

// 引号强调滥用
const QUOTE_EMPHASIS_MIN_HITS = 3;
const QUOTE_EMPHASIS_MAX_VISIBLE = 4;
const QUOTE_EMPHASIS_SPEECH_VERB_PATTERN = /[说道问喊答念叫回吼骂写读唱嘀咕]/;

// 成对引号
const QUOTE_PAIRS: [string, string][] = [
  ["「", "」"], ["『", "』"], ["【", "】"],
  ["“", "”"], ["‘", "’"], // "" ''
  ['"', '"'], ["'", "'"],
];

// em-dash
const DASH_PATTERN = /--|-|--+/;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCharClass(s: string): string {
  return s.replace(/[\\\]^-]/g, "\\$&");
}

function buildQuoteSources(): RegExp[] {
  const sources: RegExp[] = [];
  for (const [openCh, closeCh] of QUOTE_PAIRS) {
    const pat = escapeRe(openCh) + "[^" + escapeCharClass(closeCh) + "]*" + escapeRe(closeCh);
    sources.push(new RegExp(pat));
  }
  return sources;
}

const QUOTE_SOURCES = buildQuoteSources();

function isDivider(trimmed: string): boolean {
  return /^-{3,}$/.test(trimmed) || /^[*_]{3,}$/.test(trimmed);
}

function isStructural(trimmed: string): boolean {
  if (/^(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|\|)/.test(trimmed)) return true;
  if (/^第[零一二三四五六七八九十百千万\d]+章(?:\s|_|$)/.test(trimmed)) return true;
  return false;
}

function isInlineSpace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\r";
}

function stripQuoted(text: string): string {
  let out = text;
  for (const pat of QUOTE_SOURCES) {
    out = replaceAll(pat, out, (m) => "");
  }
  return out;
}

function maskQuoted(text: string): string {
  let out = text;
  for (const pat of QUOTE_SOURCES) {
    out = replaceAll(pat, out, (m) => "。".repeat(m.length));
  }
  return out;
}

function quotedRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const pat of QUOTE_SOURCES) {
    for (const m of findAll(pat, text)) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function insideRanges(pos: number, ranges: [number, number][]): boolean {
  return ranges.some(([start, end]) => start <= pos && pos < end);
}

function splitSentences(trimmed: string): string[] {
  return trimmed
    .split(/[。！？!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function visibleLength(sentence: string): number {
  return (sentence.match(/[一-鿿Ａ-ｚA-Za-z0-9]/g) || []).length;
}

function countTerms(text: string, terms: string[]): number {
  let count = 0;
  for (const term of terms) {
    let idx = 0;
    for (;;) {
      idx = text.indexOf(term, idx);
      if (idx === -1) break;
      count += 1;
      idx += term.length;
    }
  }
  return count;
}

function sentenceAround(text: string, index: number): string {
  let start = index;
  while (start > 0 && !STOP_CHARS.has(text[start - 1])) start -= 1;
  let end = index;
  while (end < text.length && !STOP_CHARS.has(text[end])) end += 1;
  return compact(text.slice(start, end).trim());
}

function compact(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length > 80) return normalized.slice(0, 77) + "...";
  return normalized;
}

function trimTrailingNoise(text: string): string {
  return text.replace(/[\s|）)】\]]+$/, "");
}

function startsWithAt(text: string, index: number, needle: string): boolean {
  return text.slice(index, index + needle.length) === needle;
}

function isAffirmationTagAt(text: string, index: number): boolean {
  if (index >= text.length || text[index] !== "是") return false;
  if (index + 1 >= text.length) return false;
  const particle = text[index + 1];
  if (!AFFIRMATION_TAG_PARTICLES.has(particle)) return false;
  const boundary = index + 2 < text.length ? text[index + 2] : "";
  return AFFIRMATION_TAG_BOUNDARY.has(boundary);
}

function skipGap(text: string, index: number): number {
  while (index < text.length && (isInlineSpace(text[index]) || text[index] === "\n")) {
    index += 1;
  }
  return index;
}

function parseFenceMarker(trimmedLine: string): { char: string; length: number } | null {
  const m = /^(`{3,}|~{3,})/.exec(trimmedLine);
  if (!m) return null;
  return { char: m[0][0], length: m[0].length };
}

function hasYamlFrontMatter(lines: string[]): boolean {
  if (lines.length === 0 || lines[0].trim() !== "---") return false;
  let sawField = false;
  for (let i = 1; i < Math.min(lines.length, 40); i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "---") return sawField;
    if (/^[A-Za-z0-9_-]+:\s*/.test(trimmed)) sawField = true;
  }
  return false;
}

interface LineStart {
  offset: number;
  lineNo: number;
}

function positionForOffset(lineStarts: LineStart[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const current = lineStarts[mid];
    const nxt = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : null;
    if (offset < current.offset) {
      high = mid - 1;
    } else if (nxt && offset >= nxt.offset) {
      low = mid + 1;
    } else {
      return { line: current.lineNo, column: offset - current.offset + 1 };
    }
  }
  return { line: lineStarts[0].lineNo, column: 1 };
}

// ---------------------------------------------------------------------------
// not-is-comparison（跨行 block 级检测）
// ---------------------------------------------------------------------------

function findPositiveFlipEnd(candidate: string): number {
  let index = 2; // 跳过 '不是'
  let scanned = 0;
  let crossedSeparator = false;

  while (index < candidate.length && scanned <= MAX_NEGATIVE_SPAN) {
    const ch = candidate[index];

    if (startsWithAt(candidate, index, "而是")) return index + 2;

    if (SOFT_SEPARATORS.has(ch)) {
      const nxt = skipGap(candidate, index + 1);
      if (startsWithAt(candidate, nxt, "而是")) return nxt + 2;
      if (
        nxt < candidate.length &&
        candidate[nxt] === "是" &&
        (nxt + 1 >= candidate.length || !TAG_PARTICLES.has(candidate[nxt + 1])) &&
        !isAffirmationTagAt(candidate, nxt)
      ) {
        return nxt + 1;
      }
      crossedSeparator = true;
    }

    if (HARD_SEPARATORS.has(ch)) {
      const nxt = skipGap(candidate, index + 1);
      if (
        nxt < candidate.length &&
        candidate[nxt] === "是" &&
        (nxt + 1 >= candidate.length || !TAG_PARTICLES.has(candidate[nxt + 1])) &&
        !isAffirmationTagAt(candidate, nxt)
      ) {
        return nxt + 1;
      }
      if (ch !== ".") break;
      crossedSeparator = true;
    }

    if (STOP_CHARS.has(ch)) break;

    // Compact forms: 不是A是B (before any separator)
    if (
      ch === "是" &&
      index > 0 &&
      !COMPACT_EITHER_OR_PREV.has(candidate[index - 1]) &&
      !crossedSeparator
    ) {
      return index + 1;
    }

    index += 1;
    scanned += 1;
  }

  return -1;
}

function extractFinding(candidate: string, markerEnd: number): string {
  let end = markerEnd;
  const limit = Math.min(candidate.length, markerEnd + MAX_POSITIVE_SPAN);
  while (end < limit) {
    if (STOP_CHARS.has(candidate[end])) break;
    end += 1;
  }
  return candidate.slice(0, end);
}

function findNotIsComparisons(
  text: string,
  getPosition: (offset: number) => { line: number; column: number },
): Finding[] {
  const findings: Finding[] = [];
  const quoted = quotedRanges(text);
  let offset = 0;

  while (offset < text.length) {
    const start = text.indexOf("不是", offset);
    if (start === -1) break;

    // 引号内豁免
    if (insideRanges(start, quoted)) {
      offset = start + 2;
      continue;
    }

    // 排除「是不是」
    if (start > 0 && text[start - 1] === "是") {
      offset = start + 2;
      continue;
    }

    const candidate = text.slice(start);
    const markerEnd = findPositiveFlipEnd(candidate);

    if (markerEnd === -1) {
      offset = start + 2;
      continue;
    }

    const raw = trimTrailingNoise(extractFinding(candidate, markerEnd));
    if (raw.length >= 4) {
      const pos = getPosition(start);
      findings.push({
        line: pos.line,
        column: pos.column,
        type: "not-is-comparison",
        severity: "blocking",
        message: "高频 AI 对比句式；删掉否定铺垫，直接写后项，或改成动作/细节呈现。",
        excerpt: compact(raw),
      });
    }

    offset = start + Math.max(raw.length, 2);
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 逐行检测函数
// ---------------------------------------------------------------------------

function findVoiceContrast(proseLines: ProseLine[]): Finding[] {
  const findings: Finding[] = [];
  for (const entry of proseLines) {
    const text = entry.text;
    const lineNo = entry.lineNo;
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const masked = maskQuoted(text);
    for (const m of findAll(VOICE_CONTRAST_PATTERN, masked)) {
      findings.push({
        line: lineNo,
        column: m.index + 1,
        type: "voice-contrast",
        severity: "blocking",
        message:
          "音量反差腔：「声音不大/不高…却/但…」是 AI 高频反差模板；删掉音量铺垫，直接写声音落进场子的具体效果（谁停了手、哪排安静了）。",
        excerpt: compact(text.slice(m.index, m.index + m[0].length)),
      });
    }
  }
  return findings;
}

function findNegationParade(proseLines: ProseLine[]): Finding[] {
  const findings: Finding[] = [];
  for (const entry of proseLines) {
    const text = entry.text;
    const lineNo = entry.lineNo;
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const masked = maskQuoted(text);

    const spans: [number, number][] = [];
    for (const pat of NEGATION_PARADE_PATTERNS) {
      for (const m of findAll(pat, masked)) {
        spans.push([m.index, m.index + m[0].length]);
      }
    }
    spans.sort((a, b) => a[0] - b[0]);

    let lastEnd = -1;
    for (const [start, end] of spans) {
      if (start < lastEnd) {
        lastEnd = Math.max(lastEnd, end);
        continue;
      }
      lastEnd = end;
      findings.push({
        line: lineNo,
        column: start + 1,
        type: "negation-parade",
        severity: "blocking",
        message:
          "否定排比：「没有X，没有Y…」/「没X，没有Y，只是Z」是 AI 高频排比模板；删掉否定清单，直接写现场实际有什么，最多留一个最有信息量的否定。",
        excerpt: compact(text.slice(start, end)),
      });
    }
  }
  return findings;
}

function findReverseNotIs(proseLines: ProseLine[]): Finding[] {
  const findings: Finding[] = [];
  for (const entry of proseLines) {
    const text = entry.text;
    const lineNo = entry.lineNo;
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const masked = maskQuoted(text);
    for (const m of findAll(REVERSE_NOT_IS_PATTERN, masked)) {
      const start = m.index;
      // 前字合成词排除
      if (start > 0 && REVERSE_NOT_IS_PREV_EXCLUDE.has(masked[start - 1])) continue;
      // 「是不是…」问句
      if (start + 1 < masked.length && masked[start + 1] === "不") continue;
      // 「是的，…不是…」确认语
      if (isAffirmationTagAt(masked, start)) continue;
      // 反问尾巴
      if (m[2] && /^[吗么吧]/.test(m[2])) continue;
      findings.push({
        line: lineNo,
        column: start + 1,
        type: "reverse-not-is",
        severity: "blocking",
        message:
          "反序对比腔：「是A，不是B」与「不是A，是B」同族；删掉后置否定，直接写 A 的具体表现，或用细节让读者自己对比。",
        excerpt: compact(text.slice(start, start + m[0].length)),
      });
    }
  }
  return findings;
}

function findTrailerEnding(proseLines: ProseLine[]): Finding[] {
  // 从文末往回收集窗口行
  const windowLines: ProseLine[] = [];
  let accumulated = 0;
  for (let i = proseLines.length - 1; i >= 0; i--) {
    const entry = proseLines[i];
    const trimmed = entry.text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    if (accumulated >= TRAILER_ENDING_WINDOW_CHARS) break;
    windowLines.unshift(entry);
    accumulated += visibleLength(stripQuoted(trimmed));
  }

  const findings: Finding[] = [];
  for (const entry of windowLines) {
    const text = entry.text;
    const lineNo = entry.lineNo;
    const masked = maskQuoted(text);
    for (const m of findAll(TRAILER_ENDING_PATTERN, masked)) {
      findings.push({
        line: lineNo,
        column: m.index + 1,
        type: "trailer-ending",
        severity: "blocking",
        message:
          "预告式总结收尾：「没人知道/才刚刚开始/正朝着…压了过去」是 AI 章尾预告腔；结尾停在具体动作、画面或一句台词上，悬念让事件自己挂住，别替读者预告下一章。",
        excerpt: compact(text.slice(m.index, m.index + m[0].length)),
      });
    }
  }
  return findings;
}

function findQuoteEmphasisTic(proseLines: ProseLine[]): Finding[] {
  let hits = 0;
  let firstLine: number | null = null;
  const samples: string[] = [];

  for (const entry of proseLines) {
    const text = entry.text;
    const lineNo = entry.lineNo;
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    if (visibleLength(stripQuoted(trimmed)) === 0) continue;
    const ranges = quotedRanges(text);

    for (const [start, end] of ranges) {
      if (text[start] === "【") continue;
      // 引号套引号排除（忠实复刻 Python：先粗后精）
      const nested = ranges.some(
        ([s2, e2]) => s2 <= start && end <= e2 && (s2 !== start || e2 !== end),
      );
      if (nested) continue;

      const inner = text.slice(start + 1, end - 1);
      const visible = visibleLength(inner);
      if (visible < 1 || visible > QUOTE_EMPHASIS_MAX_VISIBLE) continue;
      if (/[。！？!?…，,；;：:]/.test(inner)) continue;
      const before = text.slice(Math.max(0, start - 6), start);
      const after = text.slice(end, end + 3);
      if (testAny(QUOTE_EMPHASIS_SPEECH_VERB_PATTERN, before)) continue;
      if (testAny(QUOTE_EMPHASIS_SPEECH_VERB_PATTERN, after)) continue;
      hits += 1;
      if (firstLine === null) firstLine = lineNo;
      if (samples.length < 6 && !samples.includes(inner)) samples.push(inner);
    }
  }

  if (hits < QUOTE_EMPHASIS_MIN_HITS) return [];

  return [
    {
      line: firstLine ?? 1,
      column: 1,
      type: "quote-emphasis-tic",
      severity: "advisory",
      message: `引号强调滥用：叙述里 1-4 字短词加引号强调 ${hits} 处；只留真正反讽/转述必要的一两处，其余去掉引号直接写，或换成具体动作让读者自己品。`,
      excerpt: compact(samples.join(" ")),
    },
  ];
}

function findMicroActionTic(proseLines: ProseLine[]): Finding[] {
  let hits = 0;
  let narrativeChars = 0;
  let firstLine: number | null = null;
  const samples: string[] = [];

  for (const entry of proseLines) {
    const trimmed = entry.text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);
    for (const m of findAll(MICRO_TIC_PATTERN, narrative)) {
      hits += 1;
      if (firstLine === null) firstLine = entry.lineNo;
      if (samples.length < 6 && !samples.includes(m[0])) samples.push(m[0]);
    }
  }

  if (narrativeChars === 0 || hits < MICRO_TIC_MIN_HITS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < MICRO_TIC_PER_KILO) return [];

  return [
    {
      line: firstLine ?? 1,
      column: 1,
      type: "micro-action-tic",
      severity: "advisory",
      message: `微动作复读：「了下/了一下」式轻量补语 ${hits} 处（${perKilo.toFixed(1)}/千字）；同一反应模板高密度复现是机械指纹，合并动作 beat、换具体细节，别每个动作都补一个轻反应尾巴。`,
      excerpt: compact(samples.join(" ")),
    },
  ];
}

function findActionListTic(proseLines: ProseLine[]): Finding[] {
  const findings: Finding[] = [];
  for (const entry of proseLines) {
    const text = entry.text;
    const lineNo = entry.lineNo;
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed).trim();
    if (!narrative) continue;

    const verbs = findAll(ACTION_LIST_VERB_PATTERN, narrative).map((m) => m[0]);
    if (verbs.length < ACTION_LIST_MIN_HITS) continue;
    const separators = (narrative.match(/[，、；;]/g) || []).length;
    if (separators < ACTION_LIST_MIN_SEPARATORS) continue;

    findings.push({
      line: lineNo,
      column: 1,
      type: "action-list-tic",
      severity: "advisory",
      message: `监控摄像头式动作清单：同段连续动作动词 ${verbs.length} 个、分隔符 ${separators} 个；合并琐碎步骤，只保留有情绪/情节功能的动作，必要时用角色犹豫、误判或环境反馈做缓冲。`,
      excerpt: compact(verbs.slice(0, 8).join(" ")),
    });
  }
  return findings;
}

function findClicheDensityTic(proseLines: ProseLine[]): Finding[] {
  let hits = 0;
  let narrativeChars = 0;
  let firstLine: number | null = null;
  const samples: string[] = [];

  for (const entry of proseLines) {
    const trimmed = entry.text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);

    for (const pat of CLICHE_PATTERNS) {
      for (const m of findAll(pat, narrative)) {
        hits += 1;
        if (firstLine === null) firstLine = entry.lineNo;
        if (samples.length < 8 && !samples.includes(m[0])) samples.push(m[0]);
      }
    }
  }

  if (narrativeChars === 0 || hits < CLICHE_DENSITY_MIN_HITS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < CLICHE_DENSITY_PER_KILO) return [];

  return [
    {
      line: firstLine ?? 1,
      column: 1,
      type: "cliche-density-tic",
      severity: "advisory",
      message: `套词密度过高：高危 AI 套词 ${hits} 处（${perKilo.toFixed(1)}/千字）；不要同义词轮换，改成角色当下可见的动作、物件、对话和具体后果。`,
      excerpt: compact(samples.join(" ")),
    },
  ];
}

function findMetaphorDensityTic(proseLines: ProseLine[]): Finding[] {
  let hits = 0;
  let narrativeChars = 0;
  let firstLine: number | null = null;
  const samples: string[] = [];

  for (const entry of proseLines) {
    const trimmed = entry.text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);

    for (const m of findAll(METAPHOR_MARKER_PATTERN, narrative)) {
      hits += 1;
      if (firstLine === null) firstLine = entry.lineNo;
      const sample = sentenceAround(narrative, m.index);
      if (samples.length < 6 && sample && !samples.includes(sample)) samples.push(sample);
    }

    for (const m of findAll(METAPHOR_LIKE_PHRASE_PATTERN, narrative)) {
      const prefix = narrative.slice(Math.max(0, m.index - 8), m.index);
      if (testAny(/好像|像是|像|仿佛|宛如|如同|犹如/, prefix)) continue;
      hits += 1;
      if (firstLine === null) firstLine = entry.lineNo;
      const sample = sentenceAround(narrative, m.index);
      if (samples.length < 6 && sample && !samples.includes(sample)) samples.push(sample);
    }
  }

  if (narrativeChars === 0 || hits < METAPHOR_DENSITY_MIN_HITS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < METAPHOR_DENSITY_PER_KILO) return [];

  return [
    {
      line: firstLine ?? 1,
      column: 1,
      type: "metaphor-density-tic",
      severity: "advisory",
      message: `比喻密度过高：像/好像/仿佛/如同等比喻标记 ${hits} 处（${perKilo.toFixed(1)}/千字）；保留最有叙事功能的少数比喻，其余回到具体动作、物件、声音或后果，不要换成新比喻。`,
      excerpt: compact(samples.join(" | ")),
    },
  ];
}

function findReasoningChainTic(proseLines: ProseLine[]): Finding[] {
  let hits = 0;
  let coreHits = 0;
  let narrativeChars = 0;
  let firstLine: number | null = null;
  const samples: string[] = [];
  const buckets = new Set<string>();

  for (const entry of proseLines) {
    const trimmed = entry.text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);

    for (const item of REASONING_CHAIN_PATTERNS) {
      for (const m of findAll(item.pattern, narrative)) {
        hits += 1;
        if (item.core) coreHits += 1;
        buckets.add(item.key);
        if (firstLine === null) firstLine = entry.lineNo;
        const sample = compact(m[0]);
        if (samples.length < 8 && !samples.includes(sample)) samples.push(sample);
      }
    }
  }

  if (narrativeChars === 0 || hits < REASONING_CHAIN_MIN_HITS) return [];
  if (coreHits < REASONING_CHAIN_CORE_MIN_HITS || buckets.size < REASONING_CHAIN_MIN_BUCKETS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < REASONING_CHAIN_PER_KILO) return [];

  return [
    {
      line: firstLine ?? 1,
      column: 1,
      type: "reasoning-chain-tic",
      severity: "advisory",
      message: `解释链密度过高：知道/明白/这意味着/必须/需要等判断链 ${hits} 处（${perKilo.toFixed(1)}/千字）；像逻辑报告时，把判断落到角色当下可见的动作、物件、对话和现场反馈。`,
      excerpt: compact(samples.join(" | ")),
    },
  ];
}

function findNoticeFormalityTic(proseLines: ProseLine[]): Finding[] {
  let hits = 0;
  let noticeChars = 0;
  let noticeLines = 0;
  let coreHits = 0;
  let firstLine: number | null = null;
  const samples: string[] = [];

  for (const entry of proseLines) {
    const trimmed = entry.text.trim();
    if (!/^【[^】]+】$/.test(trimmed)) continue;
    noticeLines += 1;
    noticeChars += visibleLength(trimmed);

    for (const cm of findAll(NOTICE_FORMAL_CORE_PATTERN, trimmed)) {
      coreHits += 1;
    }

    for (const pat of NOTICE_FORMAL_PATTERNS) {
      for (const m of findAll(pat, trimmed)) {
        hits += 1;
        if (firstLine === null) firstLine = entry.lineNo;
        const sample = compact(m[0]);
        if (samples.length < 8 && !samples.includes(sample)) samples.push(sample);
      }
    }
  }

  if (
    noticeLines < NOTICE_FORMAL_MIN_LINES ||
    noticeChars === 0 ||
    hits < NOTICE_FORMAL_MIN_HITS ||
    coreHits < NOTICE_FORMAL_CORE_MIN_HITS
  ) {
    return [];
  }
  const perKilo = (hits / noticeChars) * 1000;
  if (perKilo < NOTICE_FORMAL_PER_KILO) return [];

  return [
    {
      line: firstLine ?? 1,
      column: 1,
      type: "system-notice-formality-tic",
      severity: "advisory",
      message: `系统公告公文腔过密：方括号规则行中硬规则词 ${hits} 处（${perKilo.toFixed(1)}/千字）；保留为角色看见的屏幕/公告/规则载体，只在载体内部白话化部分硬词，或补角色当场看懂的具体后果，不改成叙述者解释。`,
      excerpt: compact(samples.join(" | ")),
    },
  ];
}

function findOvercompressedProseTic(proseLines: ProseLine[]): Finding[] {
  let narrativeChars = 0;
  let narrativeParas = 0;
  let shortParas = 0;
  let particles = 0;
  let firstLine: number | null = null;
  const samples: string[] = [];

  for (const entry of proseLines) {
    const trimmed = entry.text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    if (/^【[^】]+】$/.test(trimmed)) continue;
    const narrative = stripQuoted(trimmed).trim();
    const length = visibleLength(narrative);
    if (length === 0) continue;

    if (firstLine === null) firstLine = entry.lineNo;
    narrativeParas += 1;
    narrativeChars += length;
    if (length <= OVERCOMPRESSED_PROSE_SHORT_MAX_CHARS) {
      shortParas += 1;
      if (samples.length < 6) samples.push(narrative);
    }

    particles += findAll(OVERCOMPRESSED_PROSE_PARTICLE_PATTERN, narrative).length;
  }

  if (
    narrativeChars < OVERCOMPRESSED_PROSE_MIN_CHARS ||
    narrativeParas < OVERCOMPRESSED_PROSE_MIN_PARAS
  ) {
    return [];
  }
  const shortRatio = shortParas / narrativeParas;
  if (shortRatio < OVERCOMPRESSED_PROSE_SHORT_RATIO) return [];
  const particlePerKilo = (particles / narrativeChars) * 1000;
  if (particlePerKilo >= OVERCOMPRESSED_PROSE_PARTICLE_PER_KILO) return [];

  return [
    {
      line: firstLine ?? 1,
      column: 1,
      type: "overcompressed-prose-tic",
      severity: "advisory",
      message: `过度精炼短段：叙述段 ${narrativeParas} 个，其中 ${shortParas} 个≤${OVERCOMPRESSED_PROSE_SHORT_MAX_CHARS}字（${(shortRatio * 100).toFixed(0)}%），自然连接 ${particlePerKilo.toFixed(1)}/千字偏少；先通读判断，确有提纲感再补断裂处和必要结构虚词，有意短镜头可留，别机械注水。`,
      excerpt: compact(samples.join(" | ")),
    },
  ];
}

function findLowConnectiveDensityTic(proseLines: ProseLine[]): Finding[] {
  let bodyChars = 0;
  let functionHits = 0;
  let plainHits = 0;
  let firstLine: number | null = null;
  const sentences: number[] = [];
  const samples: string[] = [];

  for (const entry of proseLines) {
    const trimmed = entry.text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed).trim();
    const narrativeLen = visibleLength(narrative);
    if (narrativeLen === 0) continue;

    if (firstLine === null) firstLine = entry.lineNo;
    bodyChars += narrativeLen;
    functionHits += countTerms(narrative, LOW_CONNECTIVE_FUNCTION_TERMS);
    plainHits += countTerms(narrative, LOW_CONNECTIVE_PLAIN_TERMS);

    for (const sentence of splitSentences(narrative)) {
      const length = visibleLength(sentence);
      if (length === 0) continue;
      sentences.push(length);
      if (length <= 12 && samples.length < 6) samples.push(sentence);
    }
  }

  if (bodyChars < LOW_CONNECTIVE_MIN_CHARS || sentences.length === 0) return [];
  const functionPerKilo = (functionHits / bodyChars) * 1000;
  if (functionPerKilo >= LOW_CONNECTIVE_FUNCTION_PER_KILO) return [];
  const plainPerKilo = (plainHits / bodyChars) * 1000;
  if (plainPerKilo >= LOW_CONNECTIVE_PLAIN_PER_KILO) return [];
  const longCount = sentences.filter((s) => s >= LOW_CONNECTIVE_LONG_SENTENCE_CHARS).length;
  const longRatio = longCount / sentences.length;
  if (longRatio >= LOW_CONNECTIVE_LONG_SENTENCE_RATIO) return [];

  return [
    {
      line: firstLine ?? 1,
      column: 1,
      type: "low-connective-density-tic",
      severity: "advisory",
      message: `低连接密度：引号外叙述功能词 ${functionPerKilo.toFixed(1)}/千字、白话连接 ${plainPerKilo.toFixed(1)}/千字，且≥${LOW_CONNECTIVE_LONG_SENTENCE_CHARS}字承接句仅 ${(longRatio * 100).toFixed(0)}%；容易像提纲/电报体。通读后补必要连接和中长句群，别机械注水。`,
      excerpt: compact(samples.join(" | ")),
    },
  ];
}

function findAbstractSummaryTic(proseLines: ProseLine[]): Finding[] {
  let hits = 0;
  let narrativeChars = 0;
  let firstLine: number | null = null;
  const samples: string[] = [];

  for (const entry of proseLines) {
    const trimmed = entry.text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);

    for (const pat of ABSTRACT_SUMMARY_PATTERNS) {
      for (const m of findAll(pat, narrative)) {
        hits += 1;
        if (firstLine === null) firstLine = entry.lineNo;
        const sample = compact(m[0]);
        if (samples.length < 6 && !samples.includes(sample)) samples.push(sample);
      }
    }
  }

  if (narrativeChars === 0 || hits < ABSTRACT_SUMMARY_MIN_HITS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < ABSTRACT_SUMMARY_PER_KILO) return [];

  return [
    {
      line: firstLine ?? 1,
      column: 1,
      type: "abstract-summary-tic",
      severity: "advisory",
      message: `抽象总结复读：命运/棋局/这一刻终于明白/才刚刚开始等作者总结 ${hits} 处（${perKilo.toFixed(1)}/千字）；回到角色当下可见的文件、动作、对话或物理后果，别替读者盖章。`,
      excerpt: compact(samples.join(" | ")),
    },
  ];
}

function findPeriodStutter(proseLines: ProseLine[]): Finding[] {
  const findings: Finding[] = [];
  let runLen = 0;
  let runStartLine: number | null = null;
  const runSample: string[] = [];

  const flush = (): void => {
    if (runLen >= STUTTER_MIN_RUN) {
      findings.push({
        line: runStartLine ?? 1,
        column: 1,
        type: "period-stutter",
        severity: "advisory",
        message: `碎句号：连续 ${runLen} 个短句无呼吸；按目标句长把碎句合并成中长句、补回画面与连接（见本 skill 句长/疏密节奏规则）。`,
        excerpt: compact(runSample.join(" ")),
      });
    }
    runLen = 0;
    runStartLine = null;
    runSample.length = 0;
  };

  for (const entry of proseLines) {
    const text = entry.text;
    const lineNo = entry.lineNo;
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (isDivider(trimmed) || isStructural(trimmed)) {
      flush();
      continue;
    }
    const narrative = stripQuoted(trimmed);
    if (visibleLength(narrative) === 0) {
      flush();
      continue;
    }
    for (const sentence of splitSentences(narrative)) {
      if (visibleLength(sentence) <= STUTTER_MAX_SENTENCE) {
        if (runLen === 0) runStartLine = lineNo;
        runLen += 1;
        if (runSample.length < 6) runSample.push(sentence);
      } else {
        flush();
      }
    }
  }

  flush();
  return findings;
}

// ---------------------------------------------------------------------------
// 段落级 prose 检测（em-dash + long-paragraph + 所有逐行/全文规则）
// ---------------------------------------------------------------------------

function scanProsePatterns(proseLines: ProseLine[]): Finding[] {
  const findings: Finding[] = [];

  // em-dash + long-paragraph 逐行
  for (const entry of proseLines) {
    const text = entry.text;
    const lineNo = entry.lineNo;
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;

    for (const dash of findAll(DASH_PATTERN, text)) {
      findings.push({
        line: lineNo,
        column: dash.index + 1,
        type: "em-dash",
        severity: "blocking",
        message: "破折号按功能改写：打断→动作 beat/短句，拖长音→省略或动作，插入说明→逗号/冒号；勿一律改句号。",
        excerpt: compact(text.slice(Math.max(0, dash.index - 8), dash.index + dash[0].length + 8)),
      });
    }

    if (trimmed.length > LONG_PARAGRAPH_CHARS) {
      findings.push({
        line: lineNo,
        column: 1,
        type: "long-paragraph",
        severity: "advisory",
        message: `段落过长（${trimmed.length} 字）：按镜头/新动作/新线索/视线切换断段，别一段到底。`,
        excerpt: compact(trimmed.slice(0, 40)),
      });
    }
  }

  // 全文/逐行规则
  findings.push(...findVoiceContrast(proseLines));
  findings.push(...findNegationParade(proseLines));
  findings.push(...findReverseNotIs(proseLines));
  findings.push(...findTrailerEnding(proseLines));
  findings.push(...findQuoteEmphasisTic(proseLines));
  findings.push(...findPeriodStutter(proseLines));
  findings.push(...findMicroActionTic(proseLines));
  findings.push(...findActionListTic(proseLines));
  findings.push(...findAbstractSummaryTic(proseLines));
  findings.push(...findClicheDensityTic(proseLines));
  findings.push(...findMetaphorDensityTic(proseLines));
  findings.push(...findReasoningChainTic(proseLines));
  findings.push(...findNoticeFormalityTic(proseLines));
  findings.push(...findOvercompressedProseTic(proseLines));
  findings.push(...findLowConnectiveDensityTic(proseLines));
  return findings;
}

// ---------------------------------------------------------------------------
// Block 扫描（not-is-comparison 跨行检测）
// ---------------------------------------------------------------------------

function scanBlock(block: ProseLine[]): Finding[] {
  const text = block.map((entry) => entry.text).join("\n");
  const lineStarts: LineStart[] = [];
  let cursor = 0;
  for (const entry of block) {
    lineStarts.push({ offset: cursor, lineNo: entry.lineNo });
    cursor += entry.text.length + 1;
  }

  const getPosition = (offset: number): { line: number; column: number } =>
    positionForOffset(lineStarts, offset);

  return findNotIsComparisons(text, getPosition);
}

// ---------------------------------------------------------------------------
// 主扫描流水线
// ---------------------------------------------------------------------------

/**
 * 扫描文本，返回所有 findings（与 Python scan_text 输出一致）。
 */
export function scanText(text: string): Finding[] {
  const lines = text.includes("\r\n") ? text.split("\r\n") : text.split("\n");
  const findings: Finding[] = [];
  let fence: { char: string; length: number } | null = null;
  let inFrontMatter = hasYamlFrontMatter(lines);
  let block: ProseLine[] = [];
  const proseLines: ProseLine[] = [];

  const flushBlock = (): void => {
    if (block.length > 0) {
      findings.push(...scanBlock(block));
      block = [];
    }
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();

    if (inFrontMatter) {
      if (index > 0 && trimmed === "---") inFrontMatter = false;
      continue;
    }

    const fenceMarker = parseFenceMarker(trimmed);
    if (fence) {
      if (
        fenceMarker &&
        fenceMarker.char === fence.char &&
        fenceMarker.length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }

    if (fenceMarker) {
      flushBlock();
      fence = fenceMarker;
      continue;
    }

    block.push({ text: line, lineNo: index + 1 });
    proseLines.push({ text: line, lineNo: index + 1 });
  }

  flushBlock();
  findings.push(...scanProsePatterns(proseLines));
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return findings;
}

/**
 * 扫描文本，按严重度拆分为 blocking / advisory。
 * WritingLoopService 用 blocking 判定是否必须先修复。
 */
export function checkProse(text: string): ProseReport {
  const findings = scanText(text);
  const blocking: Finding[] = [];
  const advisory: Finding[] = [];
  for (const f of findings) {
    if (f.severity === "blocking") blocking.push(f);
    else advisory.push(f);
  }
  return { blocking, advisory };
}
