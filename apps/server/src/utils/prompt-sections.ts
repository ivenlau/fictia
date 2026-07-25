/**
 * System prompt 段落拼装：把若干命名段按顺序插到 base prompt 的「# 专业能力」之前。
 *
 * 替代 buildSystemPrompt / buildInjectionPreview 里原先连续的
 * `.replace("# 专业能力", X + "# 专业能力")` 链——那条链依赖"先 replace 的段
 * 在上方"这种隐式顺序，新增/调整段时容易出错。改成显式的 sections 数组后，
 * 顺序即数组顺序，清晰且可扩展。
 */

export interface PromptSection {
  /** 标题层级：1 = `#`(一级)，2 = `##`(二级，如「已加载知识」)。 */
  level: 1 | 2;
  title: string;
  body: string;
}

/** 把 sections 拼成 markdown 段，插到 basePrompt 的首个「# 专业能力」之前。 */
export function injectSectionsBefore(basePrompt: string, sections: PromptSection[]): string {
  if (sections.length === 0) return basePrompt;
  const block = sections
    .map((s) => `${"#".repeat(s.level)} ${s.title}\n\n${s.body}`)
    .join("\n\n");
  return basePrompt.replace("# 专业能力", `${block}\n\n# 专业能力`);
}
