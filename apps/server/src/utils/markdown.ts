/**
 * Extract a YAML front-matter block from markdown content.
 */
export function extractFrontMatter(content: string): {
  frontMatter: string | null;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontMatter: null, body: content };
  }
  return { frontMatter: match[1], body: match[2] };
}

/**
 * Build markdown with YAML front-matter.
 */
export function buildMarkdown(frontMatter: string, body: string): string {
  return `---\n${frontMatter}\n---\n\n${body}`;
}

/**
 * Extract headings from markdown content.
 */
export function extractHeadings(content: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    headings.push({ level: match[1].length, text: match[2].trim() });
  }
  return headings;
}

/**
 * Extract a section from markdown by heading text.
 */
export function extractSection(content: string, headingText: string): string | null {
  const lines = content.split("\n");
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      if (inSection && level <= sectionLevel) {
        break;
      }
      if (text === headingText) {
        inSection = true;
        sectionLevel = level;
        continue;
      }
    }
    if (inSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.length > 0 ? sectionLines.join("\n").trim() : null;
}
