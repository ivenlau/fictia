import JSZip from "jszip";


interface ChapterData {
  number: number;
  title: string;
  content: string;
}

interface NovelMeta {
  title: string;
  author?: string;
  description?: string;
  genre?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(md: string): string {
  let html = escapeHtml(md);

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr/>");

  // Paragraphs
  html = html
    .split(/\n\n+/)
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      if (block.startsWith("<h") || block.startsWith("<hr")) return block;
      return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  return html;
}

export function exportMarkdown(novel: NovelMeta, chapters: ChapterData[]) {
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  const parts = sorted.map((ch) => `# ${ch.title}\n\n${ch.content}`);
  const full = `# ${novel.title}\n\n${parts.join("\n\n---\n\n")}`;
  downloadFile(full, `${novel.title}.md`, "text/markdown;charset=utf-8");
}

export async function exportEpub(novel: NovelMeta, chapters: ChapterData[]) {
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  const zip = new JSZip();
  const uuid = crypto.randomUUID();

  // mimetype (must be first, uncompressed)
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // META-INF/container.xml
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  // OEBPS/content.opf
  const manifestItems = sorted
    .map((ch, i) => `    <item id="chapter${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const spineItems = sorted
    .map((_, i) => `    <itemref idref="chapter${i + 1}"/>`)
    .join("\n");

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeHtml(novel.title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    ${novel.author ? `<dc:creator>${escapeHtml(novel.author)}</dc:creator>` : "<dc:creator>AI</dc:creator>"}
    ${novel.description ? `<dc:description>${escapeHtml(novel.description)}</dc:description>` : ""}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
${manifestItems}
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>`,
  );

  // OEBPS/style.css
  zip.file(
    "OEBPS/style.css",
    `body { font-family: serif; line-height: 1.8; margin: 1em; color: #333; }
h1 { font-size: 1.5em; margin: 2em 0 1em; text-align: center; }
h2 { font-size: 1.2em; margin: 1.5em 0 0.8em; }
h3 { font-size: 1.1em; margin: 1.2em 0 0.6em; }
p { text-indent: 2em; margin: 0.5em 0; }
hr { border: none; border-top: 1px solid #ccc; margin: 2em 0; }
strong { font-weight: bold; }
em { font-style: italic; }`,
  );

  // OEBPS/toc.xhtml (navigation)
  const navItems = sorted
    .map((ch, i) => `      <li><a href="chapter${i + 1}.xhtml">${escapeHtml(ch.title)}</a></li>`)
    .join("\n");

  zip.file(
    "OEBPS/toc.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  <nav epub:type="toc">
    <h1>目录</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`,
  );

  // Chapter XHTML files
  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted[i];
    const chapterHtml = markdownToHtml(ch.content);
    zip.file(
      `OEBPS/chapter${i + 1}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeHtml(ch.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h1>${escapeHtml(ch.title)}</h1>
${chapterHtml}
</body>
</html>`,
    );
  }

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
  downloadFile(blob, `${novel.title}.epub`, "application/epub+zip");
}

export function exportTxt(novel: NovelMeta, chapters: ChapterData[]) {
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  const parts = sorted.map((ch) => `${ch.title}\n\n${ch.content}`);
  const full = `${novel.title}\n\n${"=".repeat(40)}\n\n${parts.join("\n\n" + "-".repeat(40) + "\n\n")}`;
  downloadFile(full, `${novel.title}.txt`, "text/plain;charset=utf-8");
}

function downloadFile(data: string | Blob, filename: string, mimeType: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
