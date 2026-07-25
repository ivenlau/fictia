/**
 * 产出文件的统一路径 / 命名规范（前后端共用）。
 *
 * 命名约定：
 * - 章节：chapters/ch{NN}_act{N}-{标题}.md   扁平，act 编码进文件名，章节号补 2 位
 * - 人物：characters/{名字}_{类型}.md        扁平，类型集 主角/反派/配角/龙套
 * - 记忆：ai/memory.md
 * - 设计稿：design/*.md
 *
 * 所有写入入口（chapter-writer / chapterService / 工具）必须经过这里的函数，
 * 防止命名再次分裂——历史上 chapter-writer 写 act-X/chXX.md、chapterService
 * 写 NNN-标题.md，两套并存就是因为没有统一的路径生成入口。
 */

/** 角色类型词集。人物文件名后缀按此匹配分类。 */
export const CHARACTER_TYPES = ["主角", "反派", "配角", "龙套"] as const;
export type CharacterType = (typeof CHARACTER_TYPES)[number];

/** AI 记忆文件相对路径（替代旧的 AI助手/记忆.md）。 */
export const MEMORY_PATH = "ai/memory.md";

/** 设计稿目录（题材分析/蓝图/风格/艺术/叙事编织 5 个前置设计稿归类于此）。 */
export const DESIGN_DIR = "design";

/** 文件名中不允许出现的字符 → 下划线（沿用 chapterService 旧逻辑）。 */
const TITLE_FORBIDDEN = /[/\\:*?"<>|]/g;

/** 清洗标题用于文件名：去首尾空白、非法字符替成 _、空兜底「未命名」。 */
export function sanitizeTitle(title?: string): string {
  const t = (title ?? "").trim();
  return (t || "未命名").replace(TITLE_FORBIDDEN, "_");
}

/** 清洗角色名用于文件名：去路径非法字符（避免名字里的 / 被当目录分隔符），空兜底「未命名」。 */
export function sanitizeName(name: string): string {
  return name.replace(TITLE_FORBIDDEN, "_").trim() || "未命名";
}

const CHAPTER_PREFIX_RE = /^第\s*[一二三四五六七八九十百零\d]+\s*章\s*[：:.\-\s]* */;
/** 去掉标题开头的「第N章：」「第八章」类前缀（支持中文/阿拉伯数字），得到纯标题。 */
export function stripChapterPrefix(title?: string): string {
  return (title ?? "").replace(CHAPTER_PREFIX_RE, "").trim();
}

// ===== 章节 =====

/** 生成章节正文相对路径：chapters/ch{NN}_act{N}-{标题}.md（标题自动去掉「第N章：」前缀）。 */
export function chapterPath(num: number, act: number, title?: string): string {
  const nn = String(num).padStart(2, "0");
  return `chapters/ch${nn}_act${act}-${sanitizeTitle(stripChapterPrefix(title))}.md`;
}

const CHAPTER_RE = /ch(\d+)_act(\d+)-(.*?)\.md$/i;

/**
 * 解析章节路径/文件名 → {章节号, 幕号, 标题}。
 * 不锚定目录前缀：正文（chapters/）、大纲（outline/chapters/）路径与裸 basename 均可。
 * 非章节文件返回 null。
 */
export function parseChapterPath(rel: string): { num: number; act: number; title: string } | null {
  const m = rel.replace(/\\/g, "/").match(CHAPTER_RE);
  if (!m) return null;
  return { num: Number(m[1]), act: Number(m[2]), title: m[3] };
}

/** 仅从文件名解析章节号（扫目录后对 basename 用）。 */
export function parseChapterNumber(basename: string): number | null {
  const m = basename.match(/^ch(\d+)_act\d+-.*\.md$/i);
  return m ? Number(m[1]) : null;
}

/** 仅从文件名解析幕号（扫目录后对 basename 用）。 */
export function parseActNumber(basename: string): number | null {
  const m = basename.match(/^ch\d+_act(\d+)-.*\.md$/i);
  return m ? Number(m[1]) : null;
}

// ===== 人物 =====

/** 生成人物相对路径：characters/{名字}_{类型}.md（名字清洗路径非法字符）。 */
export function characterPath(name: string, type: CharacterType | string): string {
  return `characters/${sanitizeName(name)}_${type}.md`;
}

const CHAR_TYPE_RE = new RegExp(`([^/]+)_(${CHARACTER_TYPES.join("|")})\\.md$`);

/**
 * 解析人物路径/文件名 → {名字, 类型}。
 * 非角色文件（如 relationships.md、无类型后缀的文件）返回 null。
 * 接收相对路径或裸 basename 均可。
 */
export function parseCharacterPath(rel: string): { name: string; type: CharacterType } | null {
  const m = rel.replace(/\\/g, "/").match(CHAR_TYPE_RE);
  if (!m) return null;
  return { name: m[1], type: m[2] as CharacterType };
}
