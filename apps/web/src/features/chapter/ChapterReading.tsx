import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChapterReadingProps {
  content: string;
  /** 空内容时的提示文案，默认「章节内容为空」；设计文档等场景可覆盖。 */
  emptyLabel?: string;
}

export function ChapterReading({ content, emptyLabel = "章节内容为空" }: ChapterReadingProps) {
  if (!content) {
    return (
      <div className="rounded-lg border border-dashed border-strong bg-surface-muted p-8 text-center">
        <p className="font-body text-sm text-fg-muted">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-subtle bg-gradient-to-b from-surface-card to-surface-inset p-6 lg:p-10 shadow-theme-card">
      <article className="prose-reading max-w-none font-body leading-[1.95] [&_blockquote]:border-l-2 [&_blockquote]:border-accent/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-fg-secondary [&_code]:rounded [&_code]:bg-surface-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-caption [&_code]:text-xs [&_code]:text-accent [&_h1]:mb-4 [&_h1]:font-display [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-fg-primary [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg-primary [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-fg-primary [&_hr]:my-6 [&_hr]:border-subtle [&_li]:mb-1 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-4 [&_p]:text-fg-primary [&_p]:leading-[1.95] [&_td]:border [&_td]:border-subtle [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:border [&_th]:border-subtle [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_thead]:bg-surface-elevated/60 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5">
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      </article>
    </div>
  );
}
