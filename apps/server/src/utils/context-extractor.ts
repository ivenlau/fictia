/**
 * Context extraction utilities for progressive loading.
 * Provides chapter-specific, stage-specific, and full-book summary extractions
 * to reduce input token usage across all downstream agents.
 */

import { parseYamlFrontMatter } from "./yaml.js";
import type { CharacterMeta } from "../schemas/character.js";

/**
 * Build a lightweight character registry from multiple character files.
 * Parses YAML front-matter from each file and produces a summary table + relationship quick-ref.
 * This is Tier 1 context — always loaded, ~500-1000 chars total regardless of character count.
 */
export function buildCharacterRegistry(
  characterFiles: { path: string; content: string }[]
): string {
  const metas: { meta: CharacterMeta; filePath: string }[] = [];

  for (const { path: filePath, content } of characterFiles) {
    const { data: meta } = parseYamlFrontMatter<CharacterMeta>(content);
    if (meta && meta.name) {
      metas.push({ meta, filePath });
    }
  }

  if (metas.length === 0) {
    return "（未找到角色设定文件）";
  }

  const parts: string[] = [];

  // Summary table
  parts.push("## 角色总览\n");
  parts.push("| 角色 | 身份 | 类型 | 性格关键词 | 语言特征 |");
  parts.push("|------|------|------|-----------|---------|");
  for (const { meta } of metas) {
    const traits = meta.traits.join("、");
    const lang = meta.language_style || "—";
    const age = meta.age ? `${meta.age}岁` : "";
    const identity = age ? `${meta.identity}，${age}` : meta.identity;
    parts.push(`| ${meta.name} | ${identity} | ${meta.role} | ${traits} | ${lang} |`);
  }

  // Relationship quick-ref
  const allRels: string[] = [];
  for (const { meta } of metas) {
    for (const rel of meta.relationships) {
      allRels.push(`- ${meta.name}：${rel}`);
    }
  }
  if (allRels.length > 0) {
    parts.push("\n### 关键关系速查");
    parts.push(...allRels);
  }

  return parts.join("\n");
}

/**
 * Check if a chapter reference string matches the target chapter number.
 * Handles formats: "第1章", "第15章", "第4-6章", "ch15", "Ch1", "1-3", etc.
 */
function chapterMatches(ref: string, target: number): boolean {
  // Normalize: remove spaces, markdown bold markers
  const clean = ref.replace(/\*\*/g, "").trim();

  // Match "第N章" or "第 N 章"
  const singleMatch = clean.match(/第\s*(\d+)\s*章/);
  if (singleMatch) {
    return Number(singleMatch[1]) === target;
  }

  // Match "第N-M章" range
  const rangeMatch = clean.match(/第\s*(\d+)\s*-\s*(\d+)\s*章/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    return target >= start && target <= end;
  }

  // Match "ChN" or "chN"
  const chMatch = clean.match(/[Cc]h\s*(\d+)/);
  if (chMatch) {
    return Number(chMatch[1]) === target;
  }

  // Match bare number range "N-M"
  const bareRange = clean.match(/^(\d+)\s*-\s*(\d+)$/);
  if (bareRange) {
    const start = Number(bareRange[1]);
    const end = Number(bareRange[2]);
    return target >= start && target <= end;
  }

  // Match bare number
  const bareNum = clean.match(/^(\d+)$/);
  if (bareNum) {
    return Number(bareNum[1]) === target;
  }

  return false;
}

/**
 * Parse a markdown table into rows, returning header and data rows separately.
 */
function parseMarkdownTable(tableText: string): { header: string; separator: string; rows: string[] } {
  const lines = tableText.split("\n").filter(l => l.trim().startsWith("|"));
  if (lines.length < 2) {
    return { header: "", separator: "", rows: [] };
  }
  const header = lines[0];
  const separator = lines[1]; // |---|---|...|
  const rows = lines.slice(2);
  return { header, separator, rows };
}

/**
 * Filter table rows where the first column matches the target chapter.
 */
function filterTableByChapter(rows: string[], target: number): string[] {
  return rows.filter(row => {
    const cells = row.split("|").filter(c => c.trim());
    if (cells.length === 0) return false;
    return chapterMatches(cells[0], target);
  });
}

/**
 * Extract chapter-specific content from narrative-weave.md.
 * Targets: Section 4.1 (per-chapter technique table), 5.1 (foreshadowing checklist),
 * 5.2 (recovery status), and any foreshadowing entries mentioning the chapter.
 */
export function extractChapterNarrativeWeave(fullText: string, chapterNum: number): string {
  const parts: string[] = [];

  // --- Section 4.1: 全书叙事技巧配置总表 ---
  const s41Match = fullText.match(/### 4\.1[^\n]*\n([\s\S]*?)(?=\n### [45]\.|$)/);
  if (s41Match) {
    const { header, separator, rows } = parseMarkdownTable(s41Match[1]);
    const matched = filterTableByChapter(rows, chapterNum);
    if (matched.length > 0) {
      parts.push(`#### 叙事技巧配置（第${chapterNum}章）\n\n${header}\n${separator}\n${matched.join("\n")}`);
    }
  }

  // --- Section 5.1: 埋设检查（按章节） ---
  const s51Match = fullText.match(/### 5\.1[^\n]*\n([\s\S]*?)(?=\n### 5\.|$)/);
  if (s51Match) {
    const { header, separator, rows } = parseMarkdownTable(s51Match[1]);
    const matched = filterTableByChapter(rows, chapterNum);
    if (matched.length > 0) {
      parts.push(`#### 伏笔埋设检查（第${chapterNum}章）\n\n${header}\n${separator}\n${matched.join("\n")}`);
    }
  }

  // --- Section 5.2: 回收状态总览 — entries where埋设/强化/回收 mentions this chapter ---
  const s52Match = fullText.match(/### 5\.2[^\n]*\n([\s\S]*?)(?=\n### 5\.|$)/);
  if (s52Match) {
    const { header, separator, rows } = parseMarkdownTable(s52Match[1]);
    const chRef = new RegExp(`Ch?${chapterNum}(?:[^\\d-]|$)`);
    const matched = rows.filter(row => chRef.test(row.replace(/\*\*/g, "")));
    if (matched.length > 0) {
      parts.push(`#### 涉及第${chapterNum}章的伏笔状态\n\n${header}\n${separator}\n${matched.join("\n")}`);
    }
  }

  // --- Section 4.2: 未处理信号 — entries for this chapter ---
  const usMatch = fullText.match(/#### 4\.2\.2[^\n]*\n([\s\S]*?)(?=\n####|$)/);
  if (usMatch) {
    const { header, separator, rows } = parseMarkdownTable(usMatch[1]);
    const matched = filterTableByChapter(rows, chapterNum);
    if (matched.length > 0) {
      parts.push(`#### 未处理信号（第${chapterNum}章）\n\n${header}\n${separator}\n${matched.join("\n")}`);
    }
  }

  if (parts.length === 0) {
    return `（narrative-weave.md 中未找到第${chapterNum}章的专项配置）`;
  }

  return parts.join("\n\n");
}

/**
 * Extract chapter-specific content from art-design.md.
 * Targets: Section 2.2 (全章情感节拍表), per-chapter imagery entries.
 */
export function extractChapterArtDesign(fullText: string, chapterNum: number): string {
  const parts: string[] = [];

  // --- Section 2.2: 全章情感节拍表 ---
  // This table is split by act/stage headers (e.g., "#### 序篇：蒸发（第 1-3 章）")
  // Find all tables in section 2.2
  const s22Start = fullText.indexOf("### 2.2");
  const s22End = fullText.indexOf("## 三");
  if (s22Start !== -1) {
    const section = s22End > s22Start
      ? fullText.slice(s22Start, s22End)
      : fullText.slice(s22Start);

    // Split by sub-headers (#### ...) to find each act's table
    const actSections = section.split(/(?=####\s)/);
    for (const actSection of actSections) {
      const { header, separator, rows } = parseMarkdownTable(actSection);
      const matched = filterTableByChapter(rows, chapterNum);
      if (matched.length > 0) {
        // Extract the act header (#### 序篇：蒸发...)
        const actHeaderMatch = actSection.match(/(####\s+[^\n]+)/);
        const actLabel = actHeaderMatch ? actHeaderMatch[1].replace(/^####\s*/, "") : "";
        parts.push(`#### 情感节拍${actLabel ? `（${actLabel}）` : ""}\n\n${header}\n${separator}\n${matched.join("\n")}`);
      }
    }
  }

  // --- Imagery entries for this chapter (意象一/二/三/四/五 tables) ---
  // These tables have "章节" as first column and chapter references
  const imagerySections = fullText.match(/####\s+意象[一二三四五六][^\n]*\n([\s\S]*?)(?=\n####\s+意象|$)/g);
  if (imagerySections) {
    for (const section of imagerySections) {
      const { header, separator, rows } = parseMarkdownTable(section);
      const matched = filterTableByChapter(rows, chapterNum);
      if (matched.length > 0) {
        const titleMatch = section.match(/####\s+([^\n]+)/);
        const title = titleMatch ? titleMatch[1] : "意象";
        parts.push(`#### ${title}（第${chapterNum}章）\n\n${header}\n${separator}\n${matched.join("\n")}`);
      }
    }
  }

  if (parts.length === 0) {
    return `（art-design.md 中未找到第${chapterNum}章的专项配置）`;
  }

  return parts.join("\n\n");
}

/**
 * 在「## 章节风格锚点」段中定位本 act 的风格块。
 * 优先新约定 `### Act {n}`；fallback 旧格式 `### 第X-Y章（…）`（按 blueprint 的 act chapters 范围匹配）。
 */
function matchActAnchor(anchorSection: string, actNum: number, blueprint?: string): string | null {
  const blocks = anchorSection.split(/(?=^###\s)/m).filter((b) => b.trim());
  // 优先：新约定 ### Act {n}
  for (const b of blocks) {
    const m = b.match(/^###\s*Act\s*(\d+)/);
    if (m && Number(m[1]) === actNum) return b.replace(/^###\s*[^\n]*\n/, "").trim();
  }
  // Fallback：旧格式 ### 第X-Y章，按本 act 的 chapters 范围匹配
  const acts = parseActDefinitions(blueprint);
  const act = acts?.find((a) => a.act === actNum);
  if (!act || act.chapters.length === 0) return null;
  const min = Math.min(...act.chapters);
  const max = Math.max(...act.chapters);
  for (const b of blocks) {
    const m = b.match(/^###\s*第(\d+)\s*(?:[-–—]\s*(\d+))?\s*章/);
    if (m) {
      const s = Number(m[1]);
      const e = m[2] ? Number(m[2]) : s;
      if (s >= min && e <= max) return b.replace(/^###\s*[^\n]*\n/, "").trim();
    }
  }
  return null;
}

/**
 * Extract act-specific notes from style-guide.md（适配任意 act 数）。
 * 抽真实存在的段：总体调性 / 语言规范 / 禁忌清单 / 本 act 的章节风格锚点。
 */
export function extractStyleStageNotes(fullText: string, actNum: number, blueprint?: string): string {
  const parts: string[] = [];

  const toneMatch = fullText.match(/## 总体调性\s*\n([\s\S]*?)(?=\n## |\n---|$)/);
  if (toneMatch) parts.push(`### 总体调性\n\n${toneMatch[1].trim()}`);

  const langMatch = fullText.match(/## 语言规范\s*\n([\s\S]*?)(?=\n## )/);
  if (langMatch) parts.push(`### 语言规范\n\n${langMatch[1].trim()}`);

  const prohibMatch = fullText.match(/## 禁忌清单\s*\n([\s\S]*?)(?=\n## )/);
  if (prohibMatch) parts.push(`### 禁忌清单\n\n${prohibMatch[1].trim()}`);

  const anchorMatch = fullText.match(/## 章节风格锚点\s*\n([\s\S]*?)(?=\n## |$)/);
  if (anchorMatch) {
    const anchor = matchActAnchor(anchorMatch[1], actNum, blueprint);
    if (anchor) parts.push(`### 本幕风格锚点（act ${actNum}）\n\n${anchor}`);
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Build a character quick reference card from a full character file.
 * First tries to parse YAML front-matter (structured metadata).
 * Falls back to regex-based extraction when front-matter is missing.
 */
export function buildCharacterQuickCard(
  fullText: string,
  characterName: string,
  chapterNum?: number
): string {
  // Try YAML front-matter first
  const { data: meta, body } = parseYamlFrontMatter<CharacterMeta>(fullText);
  if (meta && meta.name) {
    return buildCharacterCardFromMeta(meta, chapterNum);
  }

  // Fallback: regex-based extraction
  return buildCharacterCardFromRegex(fullText, chapterNum);
}

/**
 * Build a character card from structured YAML front-matter metadata.
 */
function buildCharacterCardFromMeta(meta: CharacterMeta, chapterNum?: number): string {
  const parts: string[] = [];

  parts.push(`### ${meta.name}（${meta.role}）`);
  parts.push(`**身份**：${meta.identity}${meta.age ? `，${meta.age}岁` : ""}`);

  parts.push(`\n**性格关键词**：${meta.traits.join("、")}`);

  if (meta.language_style) {
    parts.push(`**语言特征**：${meta.language_style}`);
  }

  if (meta.relationships.length > 0) {
    parts.push(`\n**关键关系**：`);
    for (const rel of meta.relationships) {
      parts.push(`- ${rel}`);
    }
  }

  if (meta.growth_arc && meta.growth_arc.length > 0) {
    if (chapterNum !== undefined) {
      // Filter growth arc entries mentioning this chapter
      const relevant = meta.growth_arc.filter(
        (s: string) => s.includes(`第${chapterNum}章`) || s.includes(`第 ${chapterNum} 章`)
      );
      if (relevant.length > 0) {
        parts.push(`\n**成长弧线（第${chapterNum}章相关）**：`);
        for (const entry of relevant) {
          parts.push(`- ${entry}`);
        }
      }
    } else {
      parts.push(`\n**成长弧线**：`);
      for (const entry of meta.growth_arc) {
        parts.push(`- ${entry}`);
      }
    }
  }

  return parts.join("\n");
}

/**
 * Fallback: extract character card from markdown using regex.
 */
function buildCharacterCardFromRegex(fullText: string, chapterNum?: number): string {
  const parts: string[] = [];

  // Extract name and role from the first heading and first paragraph
  const nameMatch = fullText.match(/^#\s+[^\n]*\n+([^\n]+)/);
  if (nameMatch) {
    parts.push(nameMatch[0].trim());
  }

  // Extract 基本信息 section
  const basicMatch = fullText.match(/## (?:一、)?基本信息\n([\s\S]*?)(?=\n## [二三四五六七八九十]|\n## [一二三四五六七八九十]|\n---\n\n##)/);
  if (basicMatch) {
    parts.push(`## 基本信息\n\n${basicMatch[1].trim()}`);
  }

  // Extract 性格特征 section (core traits)
  const traitMatch = fullText.match(/## (?:二|三)、?性格[^\n]*\n([\s\S]*?)(?=\n## [三四五六七八九十]|\n## [一二三四五六七八九十]|\n---\n\n##)/);
  if (traitMatch) {
    const traitText = traitMatch[1].trim();
    const lines = traitText.split("\n");
    const compressed: string[] = [];
    for (const line of lines) {
      if (line.startsWith("#") || line.startsWith("-") || line.startsWith("*") || line.trim().length < 80) {
        compressed.push(line);
      }
    }
    parts.push(`## 性格特征\n\n${compressed.join("\n")}`);
  }

  // Extract 关键关系 section
  const relMatch = fullText.match(/## (?:五|六)、?(?:关键)?关系[^\n]*\n([\s\S]*?)(?=\n## [六七八九十]|\n## [一二三四五六七八九十]|\n---\n\n##)/);
  if (relMatch) {
    const relText = relMatch[1].trim();
    const lines = relText.split("\n");
    const compressed: string[] = [];
    for (const line of lines) {
      if (line.startsWith("#") || line.startsWith("-") || line.startsWith("*") || line.trim().length < 100) {
        compressed.push(line);
      }
    }
    parts.push(`## 关键关系\n\n${compressed.join("\n")}`);
  }

  // Extract growth arc entry for specific chapter if provided
  if (chapterNum !== undefined) {
    const growthMatch = fullText.match(/## (?:四|五)、?成长弧线[^\n]*\n([\s\S]*?)(?=\n## [五六七八九十]|\n## [一二三四五六七八九十]|\n---\n\n##)/);
    if (growthMatch) {
      const growthText = growthMatch[1];
      const paragraphs = growthText.split(/\n\n+/);
      const relevant = paragraphs.filter(p =>
        p.includes(`第${chapterNum}章`) || p.includes(`第 ${chapterNum} 章`)
      );
      if (relevant.length > 0) {
        parts.push(`## 成长弧线（第${chapterNum}章相关）\n\n${relevant.join("\n\n")}`);
      }
    }
  }

  if (parts.length <= 1) {
    return fullText.slice(0, 800) + "\n\n（... 详细内容请使用 read_project_file 查看完整文件）";
  }

  return parts.join("\n\n");
}

/**
 * Build a world setting quick reference from setting.md and rules.md.
 * Extracts: world name, power system summary, key locations, key organizations.
 */
export function buildWorldQuickRef(settingText: string, rulesText: string): string {
  const parts: string[] = [];

  if (settingText) {
    // Extract world name/title
    const titleMatch = settingText.match(/^#\s+([^\n]+)/);
    if (titleMatch) {
      parts.push(`# ${titleMatch[1].replace(/[·\s]+/g, " ").trim()}`);
    }

    // Extract each top-level section, but compress long content
    const sections = settingText.split(/(?=^## )/m);
    for (const section of sections) {
      const headerMatch = section.match(/^## ([^\n]+)/);
      if (!headerMatch) continue;

      const header = headerMatch[1];
      const lines = section.split("\n");

      // Keep header + first few meaningful lines (tables, bullets, short paragraphs)
      const compressed: string[] = [];
      let lineCount = 0;
      for (const line of lines) {
        if (line.startsWith("#")) {
          compressed.push(line);
          continue;
        }
        if (line.trim() === "" || line.trim().startsWith("|") || line.trim().startsWith("-") || line.trim().startsWith("*")) {
          compressed.push(line);
          continue;
        }
        if (lineCount < 5 && line.trim().length < 150) {
          compressed.push(line);
          lineCount++;
        }
        // Skip long descriptive paragraphs
      }
      parts.push(compressed.join("\n"));
    }
  }

  if (rulesText) {
    // Extract power system summary from rules
    const powerMatch = rulesText.match(/## (?:一|二)、?(?:力量|能力|修炼|等级)[^\n]*\n([\s\S]*?)(?=\n## [二三四五六七八九十]|\n## [一二三四五六七八九十]|\n---\n\n##)/);
    if (powerMatch) {
      const lines = powerMatch[1].split("\n");
      const compressed = lines.filter(l =>
        l.startsWith("#") || l.startsWith("-") || l.startsWith("*") || l.startsWith("|") || l.trim().length < 100
      );
      parts.push(`## 力量体系\n\n${compressed.join("\n")}`);
    }
  }

  if (parts.length === 0) {
    return "（未找到世界设定文件）";
  }

  return parts.join("\n\n");
}

/**
 * Build a full-book summary of narrative-weave.md.
 * Keeps all structural tables (foreshadowing, subplots, easter eggs) intact
 * since they are per-item definitions, not per-chapter rows.
 * Compresses prose sections (关联图, 支线关系, 支线时序, 叙事技巧计划) to headers + first paragraph.
 */
export function buildNarrativeWeaveSummary(fullText: string): string {
  const parts: string[] = [];

  // Helper: extract a section by header, keeping content up to next same-or-higher level header
  function extractSection(headerPattern: string, maxProseLines: number = 5): string | null {
    const regex = new RegExp(`(${headerPattern}[^\n]*\n)([\\s\\S]*?)(?=\\n#{1,3} |$)`);
    const match = fullText.match(regex);
    if (!match) return null;

    const header = match[1].trim();
    const body = match[2];

    // If body contains a table (|...|), keep it in full — tables are structural data
    if (body.trim().startsWith("|")) {
      return `${header}\n\n${body.trim()}`;
    }

    // For prose sections, keep first N meaningful lines
    const lines = body.split("\n");
    const kept: string[] = [];
    let lineCount = 0;
    for (const line of lines) {
      if (line.trim() === "") {
        kept.push(line);
        continue;
      }
      if (lineCount < maxProseLines) {
        kept.push(line);
        lineCount++;
      }
    }
    if (kept.length < lines.length) {
      kept.push("（... 详细内容请使用 read_project_file 查看完整文件）");
    }
    return `${header}\n\n${kept.join("\n").trim()}`;
  }

  // 伏笔体系 — tables are structural, keep in full
  const foreshadowing = extractSection("### 全书核心伏笔", 0);
  if (foreshadowing) parts.push(foreshadowing);

  const volumeForeshadowing = extractSection("### 卷级伏笔", 0);
  if (volumeForeshadowing) parts.push(volumeForeshadowing);

  const foreshadowingMap = extractSection("### 伏笔关联图", 5);
  if (foreshadowingMap) parts.push(foreshadowingMap);

  // 支线网络 — tables are structural, keep in full
  const subplotList = extractSection("### 支线列表", 0);
  if (subplotList) parts.push(subplotList);

  const subplotRelation = extractSection("### 支线与主线关系", 5);
  if (subplotRelation) parts.push(subplotRelation);

  const subplotTimeline = extractSection("### 支线时序", 5);
  if (subplotTimeline) parts.push(subplotTimeline);

  // 彩蛋布局 — table is structural, keep in full
  const easterEggs = extractSection("### 彩蛋列表", 0);
  if (easterEggs) parts.push(easterEggs);

  // 叙事技巧应用计划 — prose, compress
  const techniquePlan = extractSection("## 叙事技巧应用计划", 8);
  if (techniquePlan) parts.push(techniquePlan);

  // 伏笔回收检查清单 — checklist, keep in full
  const checklist = extractSection("## 伏笔回收检查清单", 0);
  if (checklist) parts.push(checklist);

  if (parts.length === 0) {
    return "（未找到叙事设计文件）";
  }

  return parts.join("\n\n");
}

/**
 * Build a full-book summary of art-design.md.
 * Keeps structural sections (imagery definitions, prose overviews) intact.
 * Compresses per-chapter tables (逐章情感规划, 各章叙事技巧应用) to per-act summaries.
 */

/** 无 acts 时从逐章表章号推断动态 act 分组（均分，避免硬编码绝对章号）。 */
function inferActRanges(rows: string[], segmentCount = 5): ActDefinition[] {
  const nums = rows
    .map((r) => Number(r.split("|").filter((c) => c.trim())[0]?.match(/\d+/)?.[0]))
    .filter((n) => Number.isInteger(n));
  const max = nums.length ? Math.max(...nums) : 50;
  const perAct = Math.max(1, Math.ceil(max / segmentCount));
  const names = ["序篇", "第一幕", "第二幕", "第三幕", "终篇"];
  return Array.from({ length: segmentCount }, (_, i) => {
    const chapters = Array.from({ length: perAct }, (_, j) => i * perAct + j + 1).filter((c) => c <= max);
    return { act: i + 1, name: names[i] ?? `Act ${i + 1}`, chapters };
  }).filter((a) => a.chapters.length > 0);
}

export function buildArtDesignSummary(fullText: string, acts?: ActDefinition[] | null): string {
  const parts: string[] = [];

  // Section 1: 意象体系 — keep in full (structural definitions)
  const imageryMatch = fullText.match(/## 1[.、．]\s*意象体系\n([\s\S]*?)(?=\n## 2[.、．]|$)/);
  if (imageryMatch) {
    parts.push(`## 1. 意象体系\n\n${imageryMatch[1].trim()}`);
  }

  // Section 2: 情感节拍
  const emotionMatch = fullText.match(/## 2[.、．]\s*情感节拍\n([\s\S]*?)(?=\n## 3[.、．]|$)/);
  if (emotionMatch) {
    const emotionSection = emotionMatch[1];

    // Keep prose subsections (全书情感曲线, 关键情感转折点) in full
    const arcMatch = emotionSection.match(/### 全书情感曲线\n([\s\S]*?)(?=\n### |$)/);
    if (arcMatch) {
      parts.push(`### 全书情感曲线\n\n${arcMatch[1].trim()}`);
    }

    // Compress 逐章情感规划 table to per-act summary
    const beatTableMatch = emotionSection.match(/### 逐章情感规划\n([\s\S]*?)(?=\n### |$)/);
    if (beatTableMatch) {
      const { header, separator, rows } = parseMarkdownTable(beatTableMatch[1]);
      if (rows.length > 0) {
        const actDefs = acts && acts.length > 0 ? acts : inferActRanges(rows);
        const summaryRows: string[] = [];
        for (const act of actDefs) {
          const chs = act.chapters;
          const actRows = rows.filter(r => {
            const cells = r.split("|").filter(c => c.trim());
            if (cells.length === 0) return false;
            const chMatch = cells[0].match(/\d+/);
            if (!chMatch) return false;
            return chs.includes(Number(chMatch[0]));
          });
          if (actRows.length > 0) {
            const min = Math.min(...chs);
            const max = Math.max(...chs);
            const intensities = actRows.map(r => {
              const cells = r.split("|").filter(c => c.trim());
              return cells.length >= 3 ? cells[2].trim() : "?";
            }).filter(v => v !== "?");
            const avgIntensity = intensities.length > 0
              ? (intensities.reduce((s, v) => s + Number(v), 0) / intensities.length).toFixed(1)
              : "—";
            const name = act.name || `Act ${act.act}`;
            summaryRows.push(`| ${name}（第${min}-${max}章） | ${actRows.length}章 | 平均强度 ${avgIntensity} | — |`);
          }
        }
        if (summaryRows.length > 0) {
          parts.push(`### 逐章情感规划（按幕汇总）\n\n| 幕 | 章节数 | 情感强度 | 备注 |\n|------|------|------|------|\n${summaryRows.join("\n")}`);
        }
      }
    }

    const turningPoints = emotionSection.match(/### 关键情感转折点\n([\s\S]*?)(?=\n### |$)/);
    if (turningPoints) {
      parts.push(`### 关键情感转折点\n\n${turningPoints[1].trim()}`);
    }
  }

  // Section 3: 叙事技巧 — keep prose, compress per-chapter table
  const techniqueMatch = fullText.match(/## 3[.、．]\s*叙事技巧\n([\s\S]*?)(?=\n## |$)/);
  if (techniqueMatch) {
    const techSection = techniqueMatch[1];

    // Keep prose subsections in full (结构手法, 信息释放策略, 文体实验)
    const structuralMatch = techSection.match(/### 结构手法\n([\s\S]*?)(?=\n### |$)/);
    if (structuralMatch) {
      parts.push(`### 结构手法\n\n${structuralMatch[1].trim()}`);
    }

    const infoMatch = techSection.match(/### 信息释放策略\n([\s\S]*?)(?=\n### |$)/);
    if (infoMatch) {
      parts.push(`### 信息释放策略\n\n${infoMatch[1].trim()}`);
    }

    const expMatch = techSection.match(/### 文体实验\n([\s\S]*?)(?=\n### |$)/);
    if (expMatch) {
      parts.push(`### 文体实验\n\n${expMatch[1].trim()}`);
    }

    // Compress 各章叙事技巧应用 table to per-act summary
    const appTableMatch = techSection.match(/### 各章叙事技巧应用\n([\s\S]*?)(?=\n### |$)/);
    if (appTableMatch) {
      const { header, separator, rows } = parseMarkdownTable(appTableMatch[1]);
      if (rows.length > 0) {
        const actDefs = acts && acts.length > 0 ? acts : inferActRanges(rows);
        const summaryRows: string[] = [];
        for (const act of actDefs) {
          const chs = act.chapters;
          const actRows = rows.filter(r => {
            const cells = r.split("|").filter(c => c.trim());
            if (cells.length === 0) return false;
            const chMatch = cells[0].match(/\d+/);
            if (!chMatch) return false;
            return chs.includes(Number(chMatch[0]));
          });
          if (actRows.length > 0) {
            const min = Math.min(...chs);
            const max = Math.max(...chs);
            const techniques = new Set<string>();
            for (const r of actRows) {
              const cells = r.split("|").filter(c => c.trim());
              if (cells.length >= 2) techniques.add(cells[1].trim());
            }
            const name = act.name || `Act ${act.act}`;
            summaryRows.push(`| ${name}（第${min}-${max}章） | ${actRows.length}章 | ${[...techniques].join("、")} |`);
          }
        }
        if (summaryRows.length > 0) {
          parts.push(`### 各章叙事技巧应用（按幕汇总）\n\n| 幕 | 章节数 | 使用技巧 |\n|------|------|------|\n${summaryRows.join("\n")}`);
        }
      }
    }
  }

  if (parts.length === 0) {
    return "（未找到艺术设计文件）";
  }

  return parts.join("\n\n");
}

/**
 * Extract writing notes from a chapter's output.
 * Looks for the "### 写作备注" section at the end of a chapter.
 */
export function buildPreviousChapterSummary(chapterText: string): string {
  if (!chapterText) return "";

  // Look for writing notes section
  const notesMatch = chapterText.match(/### 写作备注\n([\s\S]*?)$/);
  if (notesMatch) {
    return `### 上章写作备注\n\n${notesMatch[1].trim()}`;
  }

  // Fallback: extract last 300 chars as summary
  const tail = chapterText.slice(-300).trim();
  return `### 上章尾声\n\n...${tail}`;
}

/**
 * Detect chapter participants from an outline file.
 * Extracts character names mentioned in scene descriptions.
 */
export function detectChapterParticipants(outlineText: string, characterNames: string[]): string[] {
  const found: string[] = [];
  for (const name of characterNames) {
    if (outlineText.includes(name)) {
      found.push(name);
    }
  }
  return found;
}

/**
 * Parse chapter number from an outline path like "outline/chapters/ch15.md" or "outline/act-2/ch15.md"
 */
export function parseChapterNumber(outlinePath: string): number {
  const match = outlinePath.match(/ch(\d+)/i);
  return match ? Number(match[1]) : 1;
}

export interface ActDefinition {
  act: number;
  name?: string;
  chapters: number[];
}

/**
 * 解析 blueprint 的 `## 幕定义` 块，返回结构化 act 列表（act 解析的单一真相源）。
 * 支持当前 architect 输出的 JSON 围栏块（``` / ~~~），兼容旧 YAML 格式
 * （name:"幕名" chapters:[...]）。解析失败或无幕定义时返回 null。
 */
export function parseActDefinitions(blueprint?: string): ActDefinition[] | null {
  if (!blueprint) return null;
  const section = blueprint.split(/## 幕定义/)[1] ?? "";
  // 优先：JSON 围栏块
  const fence =
    section.match(/```(?:json)?\s*([\s\S]*?)```/) ?? section.match(/~~~(?:json)?\s*([\s\S]*?)~~~/);
  if (fence) {
    try {
      const acts = JSON.parse(fence[1].trim()) as Array<{ act: number; name?: string; chapters?: number[] }>;
      const parsed = acts
        .filter((a) => Array.isArray(a.chapters) && a.chapters.length > 0)
        .map((a) => ({
          act: Number(a.act),
          name: a.name,
          chapters: a.chapters!.map((c) => Number(c)),
        }));
      if (parsed.length > 0) return parsed;
    } catch {
      // JSON 解析失败，回退旧格式
    }
  }
  // 兼容旧格式：name:"幕名" chapters:[...]
  const actMatches = section.match(/name:\s*"[^"]+"\s*\n\s*chapters:\s*\[([^\]]+)\]/g);
  if (actMatches) {
    const result: ActDefinition[] = [];
    let actNum = 1;
    for (const m of actMatches) {
      const nameMatch = m.match(/name:\s*"([^"]+)"/);
      const nums = m.match(/\d+/g);
      if (nums) {
        result.push({
          act: actNum,
          name: nameMatch?.[1],
          chapters: nums.map((n) => Number(n)),
        });
      }
      actNum++;
    }
    if (result.length > 0) return result;
  }
  return null;
}

/**
 * 无 blueprint 幕定义时的兜底：基于总章数做相对分段，不再写死绝对章号。
 * 返回 1-based act 编号（与 blueprint 的 act 编号对齐），避免长篇失效；
 * totalChapters 缺失时按 50 章估算。
 */
export function defaultActForChapter(chapterNumber: number, totalChapters?: number): number {
  const total = totalChapters && totalChapters > 0 ? totalChapters : 50;
  const segments = 5;
  const perAct = Math.max(1, Math.ceil(total / segments));
  const act = Math.floor((chapterNumber - 1) / perAct) + 1;
  return Math.min(act, segments);
}

/**
 * Determine act number from chapter number using blueprint or default mapping.
 */
export function chapterToAct(chapterNumber: number, blueprint?: string): number {
  const acts = parseActDefinitions(blueprint);
  if (acts) {
    for (const a of acts) {
      if (a.chapters.includes(chapterNumber)) return a.act;
    }
  }
  return defaultActForChapter(chapterNumber);
}
